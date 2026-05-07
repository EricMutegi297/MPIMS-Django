from django.db.models import Q
from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from .models import Case, CaseAbstractAttachment, InvestigationTeam
from .serializers import CaseAbstractAttachmentSerializer, CaseSerializer, InvestigationTeamSerializer
from apps.notifications.models import Notification
from apps.users.models import User


class InvestigationTeamViewSet(viewsets.ModelViewSet):
    serializer_class = InvestigationTeamSerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(battalion=self.request.user.battalion)

    def get_queryset(self):
        user = self.request.user
        if user.is_superuser:
            return InvestigationTeam.objects.prefetch_related("members").select_related("team_ic", "battalion").all()
        if user.battalion_id:
            return InvestigationTeam.objects.prefetch_related("members").select_related("team_ic", "battalion").filter(battalion_id=user.battalion_id)
        return InvestigationTeam.objects.none()


class CaseViewSet(viewsets.ModelViewSet):
    queryset = Case.objects.select_related("assigned_to", "created_by", "accused_unit").all()
    serializer_class = CaseSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filterset_fields = ["status", "assigned_to", "accused_unit"]
    search_fields = ["case_number", "title", "accused_name", "accused_service_number"]

    def get_queryset(self):
        user = self.request.user
        base_qs = Case.objects.select_related(
            "assigned_to",
            "created_by",
            "accused_unit",
            "tasked_battalion",
        ).prefetch_related("abstracts")

        if not user.is_authenticated:
            return base_qs.none()

        if user.is_superuser or (
            user.role == "admin"
            and user.battalion
            and user.battalion.battalion_type == "hqs"
        ):
            return base_qs.all()

        # Investigators see cases assigned to them or their teams
        if user.role == "investigator":
            team_ids = InvestigationTeam.objects.filter(
                Q(members=user) | Q(team_ic=user)
            ).values_list("id", flat=True)
            return base_qs.filter(
                Q(assigned_to=user) | Q(assigned_team_id__in=team_ids)
            ).distinct()

        if user.battalion_id:
            return base_qs.filter(tasked_battalion_id=user.battalion_id)

        return base_qs.filter(assigned_to=user)

    def perform_create(self, serializer):
        instance = serializer.save(created_by=self.request.user)
        self._send_tasking_notification(instance, created=True)

    def perform_update(self, serializer):
        prev_instance = self.get_object()
        prev_tasked_battalion_id = prev_instance.tasked_battalion_id
        prev_team_id = prev_instance.assigned_team_id

        # Auto-set status to "tasked" when a battalion is newly assigned
        new_tasked = serializer.validated_data.get("tasked_battalion")
        save_kwargs = {}
        if new_tasked and (new_tasked.id if hasattr(new_tasked, "id") else new_tasked) != prev_tasked_battalion_id:
            save_kwargs["status"] = Case.Status.TASKED

        # Auto-set status to "under_investigation" when a team is newly assigned (Special battalion)
        new_team = serializer.validated_data.get("assigned_team")
        if new_team and (new_team.id if hasattr(new_team, "id") else new_team) != prev_team_id:
            save_kwargs["status"] = Case.Status.UNDER_INVESTIGATION

        # tasked_detachment assignment does NOT change status

        instance = serializer.save(**save_kwargs)
        # Only notify if tasking is new or changed
        if instance.tasked_battalion_id and instance.tasked_battalion_id != prev_tasked_battalion_id:
            self._send_tasking_notification(instance, created=False)

    def _send_tasking_notification(self, case, created):
        if not case.tasked_battalion_id:
            return
        users = User.objects.filter(battalion_id=case.tasked_battalion_id, is_active=True)
        if not users.exists():
            return
        msg = f"A new case (#{case.case_number or case.id}) has been tasked to your battalion: {case.title}"
        if not created:
            msg = f"Case (#{case.case_number or case.id}) has been newly tasked to your battalion: {case.title}"
        Notification.objects.bulk_create([
            Notification(
                recipient=u,
                message=msg,
                notification_type=Notification.Type.CASE,
                related_model="case",
                related_id=case.id,
            ) for u in users
        ])

    @action(detail=True, methods=["patch"], parser_classes=[MultiPartParser, FormParser],
            url_path="attach_brief")
    def attach_brief(self, request, pk=None):
        case = self.get_object()
        if "brief_document" not in request.FILES:
            return Response({"detail": "brief_document file is required."}, status=400)
        case.brief_document = request.FILES["brief_document"]
        case.save(update_fields=["brief_document"])
        return Response(CaseSerializer(case, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="forward_brief")
    def forward_brief(self, request, pk=None):
        case = self.get_object()
        if not case.brief_document:
            return Response({"detail": "Attach a brief before forwarding."}, status=400)
        target = request.data.get("forward_to")
        if target == "co":
            case.brief_forwarded_co = True
            case.save(update_fields=["brief_forwarded_co"])
        elif target == "corps_cmd":
            case.brief_forwarded_corps = True
            case.save(update_fields=["brief_forwarded_corps"])
        else:
            return Response({"detail": "forward_to must be 'co' or 'corps_cmd'."}, status=400)
        return Response(CaseSerializer(case, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="serve_case")
    def serve_case(self, request, pk=None):
        from django.utils import timezone
        case = self.get_object()
        if case.status != Case.Status.UNDER_INVESTIGATION:
            return Response(
                {"detail": "Only cases under investigation can be served."},
                status=400,
            )
        if not case.abstracts.exists():
            return Response(
                {"detail": "Cannot serve a case with no abstract attachments."},
                status=400,
            )
        case.status = Case.Status.SERVED
        case.served_at = timezone.now()
        case.save(update_fields=["status", "served_at"])
        return Response(CaseSerializer(case, context={"request": request}).data)


class CaseAbstractAttachmentViewSet(viewsets.ModelViewSet):
    serializer_class = CaseAbstractAttachmentSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        qs = CaseAbstractAttachment.objects.select_related("uploaded_by", "case")
        case_id = self.request.query_params.get("case")
        if case_id:
            qs = qs.filter(case_id=case_id)
        return qs

    def perform_create(self, serializer):
        serializer.save(uploaded_by=self.request.user)
