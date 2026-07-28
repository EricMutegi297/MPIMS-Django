from rest_framework import viewsets, permissions, status as http_status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from django.http import HttpResponse
from django_filters.rest_framework import DjangoFilterBackend
from django.utils import timezone
from django.core.mail import send_mail
from django.conf import settings as django_settings
from django.db import transaction
from django.db.models import Avg, Count, Q, F, ExpressionWrapper, IntegerField, FloatField
from datetime import date
from .models import (
    Case,
    CaseActivityLog,
    CaseAttachment,
    CaseBackBrief,
    CaseBrief,
    CaseBriefForward,
    CaseCourtMartialHearing,
    CaseCourtMartialMilestone,
    ExhibitStorageRequest,
    InvestigationTeam,
)
from .serializers import (
    CaseActivityLogSerializer,
    CaseAttachmentSerializer,
    CaseBackBriefSerializer,
    CaseBriefSerializer,
    CaseCourtMartialHearingSerializer,
    CaseCourtMartialMilestoneSerializer,
    ExhibitStorageRequestSerializer,
    CaseSerializer,
    InvestigationTeamSerializer,
)
from apps.formations.models import Battalion
from apps.notifications.models import Notification
from apps.users.access import (
    battalion_scope_q,
    command_read_only_message,
    has_global_read_access,
    is_hqs_admin,
    is_battalion_command,
    should_block_command_write,
)
from apps.users.models import User


class InvestigationTeamViewSet(viewsets.ModelViewSet):
    serializer_class = InvestigationTeamSerializer
    permission_classes = [permissions.IsAuthenticated]

    def _can_manage_teams(self, user):
        if user.is_superuser:
            return True
        if user.role == User.Role.DETACHMENT and user.detachment_id:
            return True
        if (
            user.role == User.Role.ADMIN
            and user.battalion_id
            and getattr(user.battalion, "battalion_type", "") == Battalion.BattalionType.SPECIAL
        ):
            return True
        return False

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if should_block_command_write(request.user, request.method):
            raise PermissionDenied(command_read_only_message(request.user))
        if request.method not in permissions.SAFE_METHODS and not self._can_manage_teams(request.user):
            raise PermissionDenied("Only Detachment IC or Special Battalion Admin can create or manage investigation teams.")

    def perform_create(self, serializer):
        user = self.request.user
        # IC Det creates teams scoped to their detachment
        if user.role == "detachment" and user.detachment_id:
            serializer.save(battalion=user.battalion, detachment=user.detachment)
        else:
            serializer.save(battalion=user.battalion)

    def get_queryset(self):
        user = self.request.user
        if has_global_read_access(user):
            return InvestigationTeam.objects.prefetch_related("members").select_related("team_ic", "battalion", "detachment").all()
        if user.role == User.Role.INVESTIGATOR:
            return InvestigationTeam.objects.prefetch_related("members").select_related("team_ic", "battalion", "detachment").filter(
                Q(team_ic=user) | Q(members=user)
            ).distinct()
        # IC Det sees only their detachment's teams
        if user.role == "detachment" and user.detachment_id:
            return InvestigationTeam.objects.prefetch_related("members").select_related("team_ic", "battalion", "detachment").filter(detachment_id=user.detachment_id)
        if user.battalion_id:
            return InvestigationTeam.objects.prefetch_related("members").select_related("team_ic", "battalion", "detachment").filter(battalion_id=user.battalion_id)
        return InvestigationTeam.objects.none()

    _ACTIVE = ["under_investigation"]

    @action(detail=False, methods=["get"], url_path="user-workload")
    def user_workload(self, request):
        """
        Returns all personnel (in the requester's scope) ranked by active-case
        engagement: each active case their team is assigned counts once,
        whether they are Team IC or a team member.
        """
        user = request.user

        # Scope the user pool to same detachment / battalion
        if has_global_read_access(user):
            base_users = User.objects.all()
        elif user.role == "detachment" and user.detachment_id:
            base_users = User.objects.filter(detachment_id=user.detachment_id)
        elif user.battalion_id:
            base_users = User.objects.filter(battalion_id=user.battalion_id)
        else:
            base_users = User.objects.none()

        qs = base_users.annotate(
            ic_cases=Count(
                "led_teams__assigned_cases__id",
                filter=Q(led_teams__assigned_cases__status__in=self._ACTIVE),
                distinct=True,
            ),
            member_cases=Count(
                "investigation_teams__assigned_cases__id",
                filter=Q(investigation_teams__assigned_cases__status__in=self._ACTIVE),
                distinct=True,
            ),
        ).annotate(
            total_engagement=ExpressionWrapper(
                F("ic_cases") + F("member_cases"),
                output_field=IntegerField(),
            )
        ).order_by("-total_engagement", "name")

        data = [
            {
                "id": u.id,
                "name": u.name,
                "rank": u.rank or "",
                "service_number": u.service_number or "",
                "role": u.role,
                "ic_cases": u.ic_cases,
                "member_cases": u.member_cases,
                "total_engagement": u.total_engagement,
            }
            for u in qs
        ]
        return Response(data)


class ExhibitStorageRequestViewSet(viewsets.ModelViewSet):
    serializer_class = ExhibitStorageRequestSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filterset_fields = ["status", "case", "storage_scope", "target_detachment", "target_battalion"]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        is_adj_release_authorization = (
            getattr(self, "action", None) in {"approve_lifecycle", "decline_lifecycle"}
            and getattr(request.user, "role", None) == User.Role.ADJ
        )
        if should_block_command_write(request.user, request.method) and not is_adj_release_authorization:
            raise PermissionDenied(command_read_only_message(request.user))

    def get_queryset(self):
        qs = ExhibitStorageRequest.objects.select_related(
            "case",
            "case__assigned_to",
            "case__assigned_team",
            "case__assigned_team__team_ic",
            "case__tasked_battalion",
            "case__tasked_detachment",
            "target_detachment",
            "target_battalion",
            "requested_by",
            "reviewed_by",
            "stored_by",
            "lifecycle_requested_by",
            "lifecycle_reviewed_by",
            "parent_request",
            "parent_request__case",
        ).prefetch_related(
            "case__assigned_team__members",
            "case__accused_entries",
        )
        user = self.request.user
        if has_global_read_access(user):
            return qs
        if user.role == User.Role.INVESTIGATOR:
            return qs.filter(
                Q(requested_by=user)
                | Q(case__assigned_to=user)
                | Q(case__assigned_team__team_ic=user)
                | Q(case__assigned_team__members=user)
            ).distinct()
        if user.role == User.Role.DETACHMENT and user.detachment_id:
            return qs.filter(
                Q(target_detachment_id=user.detachment_id)
                | Q(case__tasked_detachment_id=user.detachment_id)
                | Q(case__assigned_team__detachment_id=user.detachment_id)
            ).distinct()
        if user.role == User.Role.ADMIN and user.battalion_id:
            return qs.filter(
                Q(target_battalion_id=user.battalion_id)
                | Q(case__tasked_battalion_id=user.battalion_id)
                | Q(case__tasked_detachment__battalion_id=user.battalion_id)
                | Q(case__assigned_team__battalion_id=user.battalion_id)
            ).distinct()
        if user.battalion_id:
            return qs.filter(
                Q(case__tasked_battalion_id=user.battalion_id)
                | Q(case__tasked_detachment__battalion_id=user.battalion_id)
                | Q(case__assigned_team__battalion_id=user.battalion_id)
            ).distinct()
        return qs.filter(requested_by=user)

    def perform_create(self, serializer):
        exhibit = serializer.save(requested_by=self.request.user)
        self._notify_approvers(exhibit)

    @action(detail=False, methods=["get"], url_path="eligible-cases")
    def eligible_cases(self, request):
        if request.user.role != User.Role.INVESTIGATOR:
            return Response([])
        qs = Case.objects.select_related(
            "assigned_to",
            "assigned_team",
            "assigned_team__team_ic",
            "tasked_battalion",
            "tasked_detachment",
            "accused_unit",
        ).prefetch_related("assigned_team__members", "accused_entries")
        qs = qs.filter(
            Q(assigned_to=request.user)
            | Q(assigned_team__team_ic=request.user)
            | Q(assigned_team__members=request.user)
        ).distinct().order_by("-created_at")
        return Response(CaseSerializer(qs, many=True, context={"request": request}).data)

    @action(detail=False, methods=["get"], url_path="storage-destinations")
    def storage_destinations(self, request):
        if request.user.role != User.Role.INVESTIGATOR:
            return Response({"detachment": None, "battalions": []})

        detachment = None
        if request.user.detachment_id:
            det = request.user.detachment
            detachment = {
                "id": det.id,
                "name": det.name,
                "battalion": det.battalion_id,
                "battalion_name": det.battalion.name if det.battalion else None,
            }

        battalions = Battalion.objects.order_by("name").values(
            "id",
            "name",
            "battalion_type",
        )
        return Response({
            "detachment": detachment,
            "battalions": list(battalions),
        })

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        exhibit = self.get_object()
        self._ensure_can_review(request.user, exhibit)
        if exhibit.status != ExhibitStorageRequest.Status.PENDING:
            raise ValidationError({"status": "Only pending exhibit storage requests can be approved."})
        exhibit.status = ExhibitStorageRequest.Status.APPROVED
        exhibit.reviewed_by = request.user
        exhibit.reviewed_at = timezone.now()
        exhibit.reviewer_comments = str(request.data.get("comments") or "").strip()
        exhibit.decline_reason = ""
        exhibit.save(update_fields=[
            "status",
            "reviewed_by",
            "reviewed_at",
            "reviewer_comments",
            "decline_reason",
            "updated_at",
        ])
        self._notify_requester(exhibit, "approved")
        return Response(self.get_serializer(exhibit).data)

    @action(detail=True, methods=["post"])
    def decline(self, request, pk=None):
        exhibit = self.get_object()
        self._ensure_can_review(request.user, exhibit)
        if exhibit.status != ExhibitStorageRequest.Status.PENDING:
            raise ValidationError({"status": "Only pending exhibit storage requests can be declined."})
        reason = str(request.data.get("reason") or request.data.get("decline_reason") or "").strip()
        if not reason:
            raise ValidationError({"reason": "Reason for declining exhibit storage is required."})
        exhibit.status = ExhibitStorageRequest.Status.DECLINED
        exhibit.reviewed_by = request.user
        exhibit.reviewed_at = timezone.now()
        exhibit.reviewer_comments = str(request.data.get("comments") or "").strip()
        exhibit.decline_reason = reason
        exhibit.save(update_fields=[
            "status",
            "reviewed_by",
            "reviewed_at",
            "reviewer_comments",
            "decline_reason",
            "updated_at",
        ])
        self._notify_requester(exhibit, "declined")
        return Response(self.get_serializer(exhibit).data)

    @action(detail=True, methods=["post"])
    def store(self, request, pk=None):
        exhibit = self.get_object()
        self._ensure_can_store(request.user, exhibit)
        if exhibit.status != ExhibitStorageRequest.Status.APPROVED:
            raise ValidationError({"status": "Only approved exhibits can be marked as stored."})
        physical_location = str(request.data.get("physical_location") or "").strip()
        if not physical_location:
            raise ValidationError({"physical_location": "Enter the physical storage location after receiving the exhibit."})
        exhibit.status = ExhibitStorageRequest.Status.STORED
        exhibit.stored_by = request.user
        exhibit.stored_at = timezone.now()
        exhibit.physical_location = physical_location
        exhibit.storage_reference = str(request.data.get("storage_reference") or "").strip()
        exhibit.save(update_fields=[
            "status",
            "stored_by",
            "stored_at",
            "physical_location",
            "storage_reference",
            "updated_at",
        ])
        self._notify_requester(exhibit, "stored")
        return Response(self.get_serializer(exhibit).data)

    @action(detail=True, methods=["post"], url_path="request-lifecycle")
    def request_lifecycle(self, request, pk=None):
        exhibit = self.get_object()
        self._ensure_can_request_lifecycle(request.user, exhibit)
        if exhibit.status != ExhibitStorageRequest.Status.STORED:
            raise ValidationError({"status": "Only stored exhibits can be released."})

        lifecycle_action = str(request.data.get("action") or request.data.get("lifecycle_action") or "").strip()
        release_actions = {
            ExhibitStorageRequest.LifecycleAction.RETURN_OWNER,
            ExhibitStorageRequest.LifecycleAction.DISPOSE,
        }
        if lifecycle_action not in release_actions:
            raise ValidationError({"action": "Select Return to the Owner or Dispose as the mode of release."})
        request_status = self._lifecycle_request_status(lifecycle_action)
        if not request_status:
            raise ValidationError({"action": "Select a valid release action."})

        reason = str(request.data.get("reason") or request.data.get("lifecycle_reason") or "").strip()
        if not reason:
            raise ValidationError({"reason": "Reason for release is required."})

        recipient_name = str(request.data.get("recipient_name") or request.data.get("lifecycle_recipient_name") or "").strip()
        recipient_identifier = str(request.data.get("recipient_identifier") or request.data.get("lifecycle_recipient_identifier") or "").strip()
        authority = str(request.data.get("authority") or request.data.get("lifecycle_authority") or "").strip()
        disposal_mode = str(request.data.get("disposal_mode") or request.data.get("lifecycle_disposal_mode") or "").strip()
        lifecycle_attachment = request.FILES.get("attachment") or request.FILES.get("lifecycle_attachment")
        if not lifecycle_attachment:
            raise ValidationError({"attachment": "Evidence document is required before requesting exhibit release."})
        if lifecycle_action == ExhibitStorageRequest.LifecycleAction.RETURN_OWNER:
            accused_name = (exhibit.case.accused_name or "").strip()
            accused_service_number = (exhibit.case.accused_service_number or "").strip()
            if not accused_name and not accused_service_number:
                raise ValidationError({"action": "Return to the Owner is invalid because the case has no accused name or service number recorded."})
            recipient_name = accused_name or "NIL"
            recipient_identifier = accused_service_number or "NIL"
        if lifecycle_action == ExhibitStorageRequest.LifecycleAction.DISPOSE and not disposal_mode:
            raise ValidationError({"disposal_mode": "Mode of disposal is required when disposing an exhibit."})
        if lifecycle_action == ExhibitStorageRequest.LifecycleAction.DISPOSE:
            recipient_name = ""
            recipient_identifier = ""
        else:
            disposal_mode = ""

        exhibit.status = request_status
        exhibit.lifecycle_action = lifecycle_action
        exhibit.lifecycle_reason = reason
        exhibit.lifecycle_recipient_name = recipient_name
        exhibit.lifecycle_recipient_identifier = recipient_identifier
        exhibit.lifecycle_authority = authority
        exhibit.lifecycle_disposal_mode = disposal_mode
        exhibit.lifecycle_requested_by = request.user
        exhibit.lifecycle_requested_at = timezone.now()
        exhibit.lifecycle_reviewed_by = None
        exhibit.lifecycle_reviewed_at = None
        exhibit.lifecycle_review_comments = ""
        exhibit.lifecycle_decline_reason = ""
        exhibit.lifecycle_attachment = lifecycle_attachment
        exhibit.save(update_fields=[
            "status",
            "lifecycle_action",
            "lifecycle_reason",
            "lifecycle_recipient_name",
            "lifecycle_recipient_identifier",
            "lifecycle_authority",
            "lifecycle_disposal_mode",
            "lifecycle_requested_by",
            "lifecycle_requested_at",
            "lifecycle_reviewed_by",
            "lifecycle_reviewed_at",
            "lifecycle_review_comments",
            "lifecycle_decline_reason",
            "lifecycle_attachment",
            "updated_at",
        ])
        self._notify_lifecycle_approvers(exhibit)
        return Response(self.get_serializer(exhibit).data)

    @action(detail=True, methods=["post"], url_path="approve-lifecycle")
    def approve_lifecycle(self, request, pk=None):
        exhibit = self.get_object()
        self._ensure_can_authorize_release(request.user, exhibit)
        if exhibit.status not in self._lifecycle_pending_statuses():
            raise ValidationError({"status": "Only pending exhibit release requests can be approved."})

        final_status = self._lifecycle_final_status(exhibit.lifecycle_action)
        if not final_status:
            raise ValidationError({"action": "This exhibit has no valid pending release request."})

        exhibit.status = final_status
        exhibit.lifecycle_reviewed_by = request.user
        exhibit.lifecycle_reviewed_at = timezone.now()
        exhibit.lifecycle_review_comments = str(request.data.get("comments") or "").strip()
        exhibit.lifecycle_decline_reason = ""
        exhibit.save(update_fields=[
            "status",
            "lifecycle_reviewed_by",
            "lifecycle_reviewed_at",
            "lifecycle_review_comments",
            "lifecycle_decline_reason",
            "updated_at",
        ])
        self._notify_lifecycle_requester(exhibit, "approved")
        return Response(self.get_serializer(exhibit).data)

    @action(detail=True, methods=["post"], url_path="decline-lifecycle")
    def decline_lifecycle(self, request, pk=None):
        exhibit = self.get_object()
        self._ensure_can_authorize_release(request.user, exhibit)
        if exhibit.status not in self._lifecycle_pending_statuses():
            raise ValidationError({"status": "Only pending exhibit release requests can be declined."})

        reason = str(request.data.get("reason") or request.data.get("decline_reason") or "").strip()
        if not reason:
            raise ValidationError({"reason": "Reason for declining the exhibit release is required."})

        exhibit.status = ExhibitStorageRequest.Status.STORED
        exhibit.lifecycle_reviewed_by = request.user
        exhibit.lifecycle_reviewed_at = timezone.now()
        exhibit.lifecycle_review_comments = str(request.data.get("comments") or "").strip()
        exhibit.lifecycle_decline_reason = reason
        exhibit.save(update_fields=[
            "status",
            "lifecycle_reviewed_by",
            "lifecycle_reviewed_at",
            "lifecycle_review_comments",
            "lifecycle_decline_reason",
            "updated_at",
        ])
        self._notify_lifecycle_requester(exhibit, "declined")
        return Response(self.get_serializer(exhibit).data)

    @action(detail=False, methods=["post"], url_path="scan-release-document")
    def scan_release_document(self, request):
        self._ensure_can_scan_release_document(request.user)
        content, filename, content_type = self._scan_release_document()
        response = HttpResponse(content, content_type=content_type)
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response

    def _ensure_can_review(self, user, exhibit):
        if user.is_superuser:
            return
        if exhibit.storage_scope == ExhibitStorageRequest.StorageScope.DETACHMENT:
            if user.role == User.Role.DETACHMENT and user.detachment_id == exhibit.target_detachment_id:
                return
            raise PermissionDenied("Only the target Detachment IC can review this exhibit storage request.")
        if exhibit.storage_scope in {
            ExhibitStorageRequest.StorageScope.BATTALION,
            ExhibitStorageRequest.StorageScope.SPECIAL_BATTALION,
        }:
            if user.role == User.Role.ADMIN and user.battalion_id == exhibit.target_battalion_id:
                return
            raise PermissionDenied("Only the target battalion admin can review this exhibit storage request.")
        raise PermissionDenied("You cannot review this exhibit storage request.")

    def _ensure_can_store(self, user, exhibit):
        self._ensure_can_review(user, exhibit)

    def _ensure_can_authorize_release(self, user, exhibit):
        if user.is_superuser:
            return

        if (
            user.role == User.Role.DETACHMENT
            and user.detachment_id
            and exhibit.storage_scope == ExhibitStorageRequest.StorageScope.DETACHMENT
            and user.detachment_id == exhibit.target_detachment_id
        ):
            return

        command_roles = {
            User.Role.ADMIN,
            User.Role.ADJ,
            User.Role.HOD,
            User.Role.OC,
            User.Role.CO,
            User.Role.TWO_IC,
        }
        if user.role in command_roles and user.battalion_id:
            battalion_ids = {exhibit.target_battalion_id}
            if exhibit.target_detachment_id and exhibit.target_detachment:
                battalion_ids.add(exhibit.target_detachment.battalion_id)
            if user.battalion_id in battalion_ids:
                return

        raise PermissionDenied("Only Admin, Detachment IC, Adjutant, HOD, OC, CO, or 2IC for the storage unit can authorise exhibit release.")

    def _ensure_can_scan_release_document(self, user):
        allowed_roles = {
            User.Role.INVESTIGATOR,
            User.Role.ADMIN,
            User.Role.DETACHMENT,
            User.Role.ADJ,
            User.Role.HOD,
            User.Role.OC,
            User.Role.CO,
            User.Role.TWO_IC,
        }
        if user.is_superuser or user.role in allowed_roles:
            return
        raise PermissionDenied("You cannot scan exhibit release documents.")

    def _ensure_can_request_lifecycle(self, user, exhibit):
        if user.is_superuser:
            return
        if user.role != User.Role.INVESTIGATOR:
            raise PermissionDenied("Only investigators can request exhibit release.")
        if exhibit.case.assigned_to_id == user.id:
            return
        team = getattr(exhibit.case, "assigned_team", None)
        if team:
            if team.team_ic_id == user.id:
                return
            if team.members.filter(id=user.id).exists():
                return
        raise PermissionDenied("You can only request exhibit release for cases assigned to you or your investigation team.")

    def _lifecycle_pending_statuses(self):
        return {
            ExhibitStorageRequest.Status.RETURN_REQUESTED,
            ExhibitStorageRequest.Status.DISPOSAL_REQUESTED,
            ExhibitStorageRequest.Status.TRANSFER_REQUESTED,
            ExhibitStorageRequest.Status.RETENTION_REQUESTED,
        }

    def _lifecycle_request_status(self, lifecycle_action):
        return {
            ExhibitStorageRequest.LifecycleAction.RETURN_ACCUSED: ExhibitStorageRequest.Status.RETURN_REQUESTED,
            ExhibitStorageRequest.LifecycleAction.RETURN_OWNER: ExhibitStorageRequest.Status.RETURN_REQUESTED,
            ExhibitStorageRequest.LifecycleAction.DISPOSE: ExhibitStorageRequest.Status.DISPOSAL_REQUESTED,
            ExhibitStorageRequest.LifecycleAction.TRANSFER: ExhibitStorageRequest.Status.TRANSFER_REQUESTED,
            ExhibitStorageRequest.LifecycleAction.RETAIN: ExhibitStorageRequest.Status.RETENTION_REQUESTED,
        }.get(lifecycle_action)

    def _lifecycle_final_status(self, lifecycle_action):
        return {
            ExhibitStorageRequest.LifecycleAction.RETURN_ACCUSED: ExhibitStorageRequest.Status.RETURNED,
            ExhibitStorageRequest.LifecycleAction.RETURN_OWNER: ExhibitStorageRequest.Status.RETURNED,
            ExhibitStorageRequest.LifecycleAction.DISPOSE: ExhibitStorageRequest.Status.DISPOSED,
            ExhibitStorageRequest.LifecycleAction.TRANSFER: ExhibitStorageRequest.Status.TRANSFERRED,
            ExhibitStorageRequest.LifecycleAction.RETAIN: ExhibitStorageRequest.Status.RETAINED,
        }.get(lifecycle_action)

    def _lifecycle_action_label(self, lifecycle_action):
        labels = {
            ExhibitStorageRequest.LifecycleAction.RETURN_OWNER: "Return to the Owner",
            ExhibitStorageRequest.LifecycleAction.DISPOSE: "Dispose",
        }
        if lifecycle_action in labels:
            return labels[lifecycle_action]
        try:
            return ExhibitStorageRequest.LifecycleAction(lifecycle_action).label
        except ValueError:
            return lifecycle_action or "Exhibit release"

    def _scan_release_document(self):
        try:
            import win32com.client
        except ImportError as exc:
            raise ValidationError({
                "scanner": (
                    "Direct scanner access requires Windows scanner support on the server "
                    "running MPIMS. Install/configure the scanner driver and pywin32, then try again."
                )
            }) from exc

        try:
            dialog = win32com.client.Dispatch("WIA.CommonDialog")
            image = dialog.ShowAcquireImage()
        except Exception as exc:
            raise ValidationError({
                "scanner": "Unable to scan from the connected scanner. Check that the scanner is connected, powered on, and available to this computer."
            }) from exc

        try:
            data = bytes(image.FileData.BinaryData)
        except Exception as exc:
            raise ValidationError({"scanner": "The scanner did not return a readable document."}) from exc

        extension = str(getattr(image, "FileExtension", "") or "jpg").lower().lstrip(".")
        content_types = {
            "bmp": "image/bmp",
            "gif": "image/gif",
            "jpeg": "image/jpeg",
            "jpg": "image/jpeg",
            "png": "image/png",
            "tif": "image/tiff",
            "tiff": "image/tiff",
        }
        content_type = content_types.get(extension, "application/octet-stream")
        filename = f"release_evidence_scan_{timezone.now().strftime('%Y%m%d_%H%M%S')}.{extension}"
        return data, filename, content_type

    def _approvers_for_exhibit(self, exhibit):
        if exhibit.storage_scope == ExhibitStorageRequest.StorageScope.DETACHMENT and exhibit.target_detachment_id:
            return list(User.objects.filter(
                role=User.Role.DETACHMENT,
                detachment_id=exhibit.target_detachment_id,
                is_active=True,
            ))
        if exhibit.target_battalion_id:
            return list(User.objects.filter(
                role=User.Role.ADMIN,
                battalion_id=exhibit.target_battalion_id,
                is_active=True,
            ))
        return []

    def _case_team_recipients(self, exhibit):
        recipients = set()
        for user in [exhibit.requested_by, exhibit.case.assigned_to]:
            if user and user.is_active:
                recipients.add(user)
        team = getattr(exhibit.case, "assigned_team", None)
        if team:
            if team.team_ic and team.team_ic.is_active:
                recipients.add(team.team_ic)
            for member in team.members.filter(is_active=True):
                recipients.add(member)
        return recipients

    def _notify_approvers(self, exhibit):
        recipients = self._approvers_for_exhibit(exhibit)
        if not recipients:
            return
        destination = exhibit.target_detachment or exhibit.target_battalion
        prefix = "Additional exhibit storage request" if exhibit.parent_request_id else "Exhibit storage request"
        message = (
            f"{prefix} for {exhibit.case.case_number} awaits review: "
            f"{exhibit.exhibit_name} to be stored at {destination}."
        )
        Notification.objects.bulk_create([
            Notification(
                recipient=user,
                message=message,
                notification_type=Notification.Type.CASE,
                related_model="exhibit_storage_request",
                related_id=exhibit.id,
            )
            for user in recipients
        ])
        self._send_email(recipients, f"[MPIMS] Exhibit storage request {exhibit.case.case_number}", message)

    def _notify_requester(self, exhibit, event):
        recipients = self._case_team_recipients(exhibit)
        actor = exhibit.stored_by if event == "stored" else exhibit.reviewed_by
        if actor:
            recipients.discard(actor)
        if not recipients:
            return
        if event == "approved":
            message = (
                f"Exhibit storage request for {exhibit.case.case_number} was approved. "
                f"Deliver '{exhibit.exhibit_name}' physically for storage confirmation."
            )
        elif event == "declined":
            message = (
                f"Exhibit storage request for {exhibit.case.case_number} was declined. "
                f"Reason: {exhibit.decline_reason}"
            )
        else:
            message = (
                f"Exhibit '{exhibit.exhibit_name}' for {exhibit.case.case_number} has been physically received "
                f"and stored at {exhibit.physical_location}."
            )
        Notification.objects.bulk_create([
            Notification(
                recipient=user,
                message=message,
                notification_type=Notification.Type.CASE,
                related_model="exhibit_storage_request",
                related_id=exhibit.id,
            )
            for user in recipients
        ])
        self._send_email(list(recipients), f"[MPIMS] Exhibit storage {event}", message)

    def _release_approvers_for_exhibit(self, exhibit):
        recipients = set()
        if exhibit.storage_scope == ExhibitStorageRequest.StorageScope.DETACHMENT and exhibit.target_detachment_id:
            recipients.update(User.objects.filter(
                role=User.Role.DETACHMENT,
                detachment_id=exhibit.target_detachment_id,
                is_active=True,
            ))

        battalion_id = exhibit.target_battalion_id
        if not battalion_id and exhibit.target_detachment_id and exhibit.target_detachment:
            battalion_id = exhibit.target_detachment.battalion_id

        if battalion_id:
            recipients.update(User.objects.filter(
                role__in=[
                    User.Role.ADMIN,
                    User.Role.ADJ,
                    User.Role.HOD,
                    User.Role.OC,
                    User.Role.CO,
                    User.Role.TWO_IC,
                ],
                battalion_id=battalion_id,
                is_active=True,
            ))
        return list(recipients)

    def _notify_lifecycle_approvers(self, exhibit):
        recipients = self._release_approvers_for_exhibit(exhibit)
        if exhibit.lifecycle_requested_by:
            recipients = [user for user in recipients if user.id != exhibit.lifecycle_requested_by_id]
        if not recipients:
            return
        action_label = self._lifecycle_action_label(exhibit.lifecycle_action)
        message = (
            f"{action_label} request for exhibit '{exhibit.exhibit_name}' "
            f"on {exhibit.case.case_number} awaits approval."
        )
        Notification.objects.bulk_create([
            Notification(
                recipient=user,
                message=message,
                notification_type=Notification.Type.CASE,
                related_model="exhibit_storage_request",
                related_id=exhibit.id,
            )
            for user in recipients
        ])
        self._send_email(recipients, f"[MPIMS] Exhibit release request {exhibit.case.case_number}", message)

    def _notify_lifecycle_requester(self, exhibit, event):
        recipients = self._case_team_recipients(exhibit)
        if exhibit.lifecycle_reviewed_by:
            recipients.discard(exhibit.lifecycle_reviewed_by)
        if not recipients:
            return
        action_label = self._lifecycle_action_label(exhibit.lifecycle_action)
        if event == "approved":
            message = (
                f"{action_label} request for exhibit '{exhibit.exhibit_name}' "
                f"on {exhibit.case.case_number} was approved. Current status: {exhibit.get_status_display()}."
            )
        else:
            message = (
                f"{action_label} request for exhibit '{exhibit.exhibit_name}' "
                f"on {exhibit.case.case_number} was declined. Reason: {exhibit.lifecycle_decline_reason}"
            )
        Notification.objects.bulk_create([
            Notification(
                recipient=user,
                message=message,
                notification_type=Notification.Type.CASE,
                related_model="exhibit_storage_request",
                related_id=exhibit.id,
            )
            for user in recipients
        ])
        self._send_email(list(recipients), f"[MPIMS] Exhibit release {event}", message)

    def _send_email(self, users, subject, message):
        recipients = [user.email for user in users if getattr(user, "email", "")]
        if not recipients:
            return
        try:
            send_mail(
                subject=subject,
                message=message,
                from_email=django_settings.DEFAULT_FROM_EMAIL,
                recipient_list=recipients,
                fail_silently=True,
            )
        except Exception:
            pass


class CaseViewSet(viewsets.ModelViewSet):
    queryset = Case.objects.select_related("assigned_to", "created_by", "accused_unit").prefetch_related(
        "extra_attachments", "court_martial_hearings", "court_martial_milestones", "accused_entries"
    ).all()
    serializer_class = CaseSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = {
        "status": ["exact", "in"],
        "assigned_to": ["exact"],
        "accused_unit": ["exact"],
        "tasked_detachment": ["exact"],
        "tasked_battalion": ["exact"],
        "criminal_offence_type": ["exact"],
    }
    search_fields = ["case_number", "title", "accused_name", "accused_service_number"]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        command_write_allowed = (
            getattr(self, "action", None) == "approve_brief"
            and request.method == "POST"
            and getattr(request.user, "role", None) == User.Role.CORPS_CMD
        ) or (
            getattr(self, "action", None) == "brief"
            and request.method == "PATCH"
            and getattr(request.user, "role", None) == User.Role.ADJ
        )
        if should_block_command_write(request.user, request.method) and not command_write_allowed:
            raise PermissionDenied(command_read_only_message(request.user))

    def _can_view_case_progress(self, user, case_obj):
        if not user or not user.is_authenticated:
            return False
        if has_global_read_access(user):
            return True
        if user.role == User.Role.INVESTIGATOR:
            if case_obj.assigned_to_id == user.id:
                return True
            if case_obj.assigned_team_id:
                team = case_obj.assigned_team
                return bool(team and (team.team_ic_id == user.id or team.members.filter(id=user.id).exists()))
            return False
        if case_obj.tasked_battalion_id and user.battalion_id == case_obj.tasked_battalion_id:
            return True
        if case_obj.tasked_detachment_id and user.battalion_id == getattr(case_obj.tasked_detachment, "battalion_id", None):
            return True
        if case_obj.tasked_detachment_id and user.detachment_id == case_obj.tasked_detachment_id:
            return True
        if case_obj.assigned_to_id == user.id:
            return True
        if case_obj.assigned_team_id:
            team = case_obj.assigned_team
            if team and (team.team_ic_id == user.id or team.members.filter(id=user.id).exists()):
                return True
        return False

    def get_queryset(self):
        user = self.request.user
        base_qs = Case.objects.select_related(
            "assigned_to",
            "created_by",
            "accused_unit",
            "tasked_battalion",
            "tasked_detachment",
        ).prefetch_related(
            "extra_attachments",
            "court_martial_hearings",
            "court_martial_milestones",
        )

        if not user.is_authenticated:
            return base_qs.none()

        if has_global_read_access(user):
            return base_qs.all()

        if user.role == User.Role.INVESTIGATOR:
            return base_qs.filter(
                Q(assigned_to=user)
                | Q(assigned_team__team_ic=user)
                | Q(assigned_team__members=user)
            ).distinct()

        # Battalion command users see cases tasked to their battalion or its detachments.
        if is_battalion_command(user):
            return base_qs.filter(
                battalion_scope_q(
                    user,
                    battalion_field="tasked_battalion_id",
                    detachment_field="tasked_detachment",
                )
                | Q(assigned_team__battalion_id=user.battalion_id)
                | Q(assigned_team__detachment__battalion_id=user.battalion_id)
            ).distinct()

        # Detachment IC (role=detachment) sees cases tasked to their detachment
        if user.role == "detachment" and user.detachment_id:
            return base_qs.filter(
                Q(tasked_detachment_id=user.detachment_id)
                | Q(assigned_team__detachment_id=user.detachment_id)
            ).distinct()

        if user.battalion_id:
            return base_qs.filter(
                Q(tasked_battalion_id=user.battalion_id)
                | Q(tasked_detachment__battalion_id=user.battalion_id)
                | Q(assigned_to=user)
                | Q(assigned_team__team_ic=user)
                | Q(assigned_team__members=user)
            ).distinct()

        return base_qs.filter(assigned_to=user)

    def _log_action(self, case, actor, action, detail=""):
        CaseActivityLog.objects.create(case=case, actor=actor, action=action, detail=detail)

    def _actor_label(self, actor):
        if not actor:
            return "System"
        parts = [p for p in [actor.rank, actor.name] if p]
        return " ".join(parts) or actor.service_number

    def _notify_team(self, case, actor, message):
        """Create dashboard notifications + send email to every active team member / IC,
        excluding the actor who triggered the action."""
        if not case.assigned_team_id:
            return
        try:
            team = case.assigned_team
        except Exception:
            return
        recipients = set()
        if team.team_ic and team.team_ic.is_active:
            recipients.add(team.team_ic)
        for m in team.members.filter(is_active=True):
            recipients.add(m)
        if actor:
            recipients.discard(actor)
        if not recipients:
            return
        Notification.objects.bulk_create([
            Notification(
                recipient=u,
                message=message,
                notification_type=Notification.Type.CASE,
                related_model="case",
                related_id=case.id,
            ) for u in recipients
        ])
        email_list = [u.email for u in recipients if u.email]
        if email_list:
            try:
                send_mail(
                    subject=f"[MPIMS] Case {case.case_number} — Activity",
                    message=message,
                    from_email=django_settings.DEFAULT_FROM_EMAIL,
                    recipient_list=email_list,
                    fail_silently=True,
                )
            except Exception:
                pass

    def _is_hq_admin_or_superuser(self, user):
        if not user or not user.is_authenticated:
            return False
        return has_global_read_access(user)

    def _can_manage_court_martial_progress(self, user, case_obj):
        if not user or not user.is_authenticated:
            return False
        if self._is_hq_admin_or_superuser(user):
            return True
        team = getattr(case_obj, "assigned_team", None)
        if not team:
            return False
        if team.team_ic_id and team.team_ic_id == user.id:
            return True
        return team.members.filter(id=user.id).exists()

    def _can_set_court_martial_schedule(self, user, case_obj):
        if self._can_manage_court_martial_progress(user, case_obj):
            return True
        if case_obj.assigned_to_id and case_obj.assigned_to_id == getattr(user, "id", None):
            return True
        if user and user.is_authenticated and user.role == "investigator":
            return self._can_view_case_progress(user, case_obj)
        return False

    def _can_edit_court_action_remarks(self, user, case_obj):
        if not user or not user.is_authenticated:
            return False
        team = getattr(case_obj, "assigned_team", None)
        if team and (team.team_ic_id == user.id or team.members.filter(id=user.id).exists()):
            return True
        if case_obj.assigned_to_id and case_obj.assigned_to_id == user.id:
            return True
        return False

    def _can_request_close(self, user, case_obj):
        if not user or not user.is_authenticated:
            return False
        team = getattr(case_obj, "assigned_team", None)
        if not team:
            return False
        return team.team_ic_id == user.id or team.members.filter(id=user.id).exists()

    def _can_manage_case_brief(self, user, case_obj):
        if not user or not user.is_authenticated:
            return False
        if has_global_read_access(user):
            return True
        if case_obj.assigned_to_id == user.id:
            return True
        team = getattr(case_obj, "assigned_team", None)
        if team and (team.team_ic_id == user.id or team.members.filter(id=user.id).exists()):
            return True
        return False

    def _brief_case_scope(self, user, qs):
        if has_global_read_access(user):
            return qs
        if getattr(user, "role", None) == User.Role.INVESTIGATOR:
            return qs.filter(
                Q(assigned_to=user)
                | Q(assigned_team__team_ic=user)
                | Q(assigned_team__members=user)
            ).distinct()
        return qs

    def _brief_creator_scope(self, user, qs):
        if getattr(user, "role", None) != User.Role.INVESTIGATOR:
            return qs
        team_ids = InvestigationTeam.objects.filter(
            Q(team_ic=user) | Q(members=user)
        ).values("id")
        team_user_ids = User.objects.filter(
            Q(led_teams__id__in=team_ids) | Q(investigation_teams__id__in=team_ids)
        ).values("id")
        return qs.filter(
            Q(brief__attached_by=user) | Q(brief__attached_by_id__in=team_user_ids)
        ).distinct()

    def _brief_forward_target_for_role(self, user):
        return {
            User.Role.HOD: CaseBrief.ForwardRole.HOD,
            User.Role.DETACHMENT: CaseBrief.ForwardRole.DETACHMENT,
            User.Role.ADJ: CaseBrief.ForwardRole.ADJ,
            User.Role.TWO_IC: CaseBrief.ForwardRole.TWO_IC,
            User.Role.CO: CaseBrief.ForwardRole.CO,
            User.Role.OC: CaseBrief.ForwardRole.OC,
            User.Role.CORPS_CMD: CaseBrief.ForwardRole.CORPS_CMD,
        }.get(getattr(user, "role", None))

    def _brief_visible_scope(self, user, qs):
        if getattr(user, "role", None) == User.Role.INVESTIGATOR:
            return qs

        if getattr(user, "role", None) == User.Role.ADMIN and not has_global_read_access(user):
            if not user.battalion_id:
                return qs.none()
            return qs.filter(
                Q(tasked_battalion_id=user.battalion_id)
                | Q(tasked_detachment__battalion_id=user.battalion_id)
                | Q(assigned_team__battalion_id=user.battalion_id)
                | Q(assigned_team__detachment__battalion_id=user.battalion_id)
            ).distinct()

        target = self._brief_forward_target_for_role(user)
        if target:
            qs = qs.filter(
                Q(brief__forwarded_to_role=target)
                | Q(brief__forward_history__to_role=target)
                | Q(brief__forward_history__from_role=user.role)
            )
            if user.role == User.Role.CORPS_CMD:
                return qs.distinct()
            if user.role == User.Role.DETACHMENT:
                if not user.detachment_id:
                    return qs.none()
                return qs.filter(
                    Q(tasked_detachment_id=user.detachment_id)
                    | Q(assigned_team__detachment_id=user.detachment_id)
                ).distinct()
            if not user.battalion_id:
                return qs.none()
            return qs.filter(
                Q(tasked_battalion_id=user.battalion_id)
                | Q(tasked_detachment__battalion_id=user.battalion_id)
                | Q(assigned_team__battalion_id=user.battalion_id)
                | Q(assigned_team__detachment__battalion_id=user.battalion_id)
            ).distinct()

        if has_global_read_access(user):
            return qs
        return qs.none()

    def _case_battalion_id(self, case_obj):
        battalion_id = case_obj.tasked_battalion_id
        if not battalion_id and case_obj.tasked_detachment_id:
            battalion_id = getattr(case_obj.tasked_detachment, "battalion_id", None)
        if not battalion_id and case_obj.assigned_team_id:
            battalion_id = getattr(case_obj.assigned_team, "battalion_id", None)
        if not battalion_id and case_obj.assigned_team_id:
            team_detachment = getattr(case_obj.assigned_team, "detachment", None)
            battalion_id = getattr(team_detachment, "battalion_id", None)
        return battalion_id

    def _case_detachment_id(self, user, case_obj):
        if case_obj.tasked_detachment_id:
            return case_obj.tasked_detachment_id
        if case_obj.assigned_team_id:
            detachment_id = getattr(case_obj.assigned_team, "detachment_id", None)
            if detachment_id:
                return detachment_id
        return getattr(user, "detachment_id", None)

    def _brief_role_has_history_access(self, user, brief):
        target = self._brief_forward_target_for_role(user)
        if not target:
            return False
        if brief.forwarded_to_role == target:
            return True
        return brief.forward_history.filter(
            Q(to_role=target) | Q(from_role=getattr(user, "role", ""))
        ).exists()

    def _brief_forward_label(self, role):
        return dict(CaseBrief.ForwardRole.choices).get(role, role)

    def _brief_duplicate_forward(self, brief, to_role):
        return (
            brief.forward_history.select_related("forwarded_by")
            .filter(revision=brief.revision, to_role=to_role)
            .order_by("-forwarded_at", "-id")
            .first()
        )

    def _brief_forward_allowed_roles(self, user, case_obj, brief):
        role = getattr(user, "role", None)
        base_roles = set()
        if role == User.Role.INVESTIGATOR:
            if self._case_detachment_id(user, case_obj):
                base_roles = {CaseBrief.ForwardRole.DETACHMENT}
            else:
                base_roles = {CaseBrief.ForwardRole.HOD, CaseBrief.ForwardRole.ADJ}
        elif role == User.Role.DETACHMENT and self._brief_role_has_history_access(user, brief):
            base_roles = {
                CaseBrief.ForwardRole.ADJ,
                CaseBrief.ForwardRole.HOD,
                CaseBrief.ForwardRole.TWO_IC,
                CaseBrief.ForwardRole.OC,
            }
        elif role == User.Role.HOD and self._brief_role_has_history_access(user, brief):
            base_roles = {CaseBrief.ForwardRole.TWO_IC, CaseBrief.ForwardRole.CO}
        elif role == User.Role.ADJ and self._brief_role_has_history_access(user, brief):
            base_roles = {CaseBrief.ForwardRole.TWO_IC, CaseBrief.ForwardRole.CO}
        elif role == User.Role.TWO_IC and self._brief_role_has_history_access(user, brief):
            base_roles = {CaseBrief.ForwardRole.CO}
        elif role == User.Role.OC and self._brief_role_has_history_access(user, brief):
            base_roles = {CaseBrief.ForwardRole.TWO_IC, CaseBrief.ForwardRole.CO}
        elif role == User.Role.CO and self._brief_role_has_history_access(user, brief):
            base_roles = {CaseBrief.ForwardRole.CORPS_CMD}
        if not base_roles:
            return set()
        already_forwarded = set(
            brief.forward_history.filter(
                revision=brief.revision,
                to_role__in=base_roles,
            ).values_list("to_role", flat=True)
        )
        return base_roles - already_forwarded

    def _can_view_case_brief(self, user, case_obj, brief):
        if not user or not user.is_authenticated:
            return False
        if user.role == User.Role.INVESTIGATOR:
            return self._can_manage_case_brief(user, case_obj)
        if user.role == User.Role.ADMIN and not has_global_read_access(user):
            return bool(user.battalion_id and self._case_battalion_id(case_obj) == user.battalion_id)

        target = self._brief_forward_target_for_role(user)
        if target and self._brief_role_has_history_access(user, brief):
            if user.role == User.Role.CORPS_CMD:
                return True
            if user.role == User.Role.DETACHMENT:
                return bool(user.detachment_id and self._case_detachment_id(user, case_obj) == user.detachment_id)
            return bool(user.battalion_id and self._case_battalion_id(case_obj) == user.battalion_id)

        return has_global_read_access(user) and user.role != User.Role.CORPS_CMD

    def _can_edit_case_brief(self, user, case_obj, brief):
        if not user or not user.is_authenticated:
            return False
        if user.role == User.Role.INVESTIGATOR:
            return self._can_manage_case_brief(user, case_obj)
        if user.role == User.Role.HOD and self._brief_role_has_history_access(user, brief):
            return self._can_view_case_brief(user, case_obj, brief)
        if user.role == User.Role.OC and self._brief_role_has_history_access(user, brief):
            return self._can_view_case_brief(user, case_obj, brief)
        if user.role == User.Role.ADJ and self._brief_role_has_history_access(user, brief):
            return self._can_view_case_brief(user, case_obj, brief)
        return False

    def _latest_court_milestone(self, case_obj):
        return case_obj.court_martial_milestones.order_by("-scheduled_date", "-created_at", "-id").first()

    def perform_create(self, serializer):
        instance = serializer.save(created_by=self.request.user, status=Case.Status.NEW)
        accused_entries = list(instance.accused_entries.all())
        if len(accused_entries) > 1:
            self._create_duplicate_cases_for_accused(instance, accused_entries)
            self._send_tasking_notification(instance, created=True)
            self._log_action(instance, self.request.user, CaseActivityLog.Action.CASE_CREATED,
                             f"Case {instance.case_number} created")
        else:
            self._send_tasking_notification(instance, created=True)
            self._log_action(instance, self.request.user, CaseActivityLog.Action.CASE_CREATED,
                             f"Case {instance.case_number} created")

    def perform_update(self, serializer):
        instance = self.get_object()
        previous_status = instance.status
        case = serializer.save()

        if previous_status != case.status:
            if case.status == Case.Status.SERVED:
                if not case.served_at:
                    case.served_at = timezone.now()
                    case.save(update_fields=["served_at"])
                self._send_served_notification(case, self.request.user)
                self._log_action(
                    case,
                    self.request.user,
                    CaseActivityLog.Action.CASE_UPDATED,
                    f"Case {case.case_number} served",
                )
            elif case.status == Case.Status.CLOSED:
                self._send_closed_notification(case)
                self._log_action(
                    case,
                    self.request.user,
                    CaseActivityLog.Action.CASE_UPDATED,
                    f"Case {case.case_number} closed",
                )

    def _create_duplicate_cases_for_accused(self, original_case, accused_entries):
        def suffix_for_index(index):
            letters = []
            while index >= 0:
                letters.append(chr(ord("A") + (index % 26)))
                index = index // 26 - 1
            return "".join(reversed(letters))

        with transaction.atomic():
            base_number = original_case.case_number
            original_case.accused_entries.all().delete()
            for index, accused in enumerate(accused_entries):
                suffix = suffix_for_index(index)
                if index == 0:
                    original_case.accused_entries.create(
                        name=(accused.name or "").strip(),
                        rank=(accused.rank or "").strip(),
                        service_number=(accused.service_number or "").strip(),
                        service=(accused.service or "").strip(),
                        unit=accused.unit,
                    )
                    original_case.accused_name = accused.name or ""
                    original_case.accused_rank = accused.rank or ""
                    original_case.accused_service_number = accused.service_number or ""
                    original_case.accused_service = accused.service or ""
                    original_case.accused_unit = accused.unit
                    original_case.case_number = f"{base_number}{suffix}"
                    original_case.save(update_fields=[
                        "accused_name",
                        "accused_rank",
                        "accused_service_number",
                        "accused_service",
                        "accused_unit",
                        "case_number",
                    ])
                    continue

                case_copy = Case.objects.get(pk=original_case.pk)
                case_copy.pk = None
                case_copy.case_number = f"{base_number}{suffix}"
                case_copy.accused_name = accused.name or ""
                case_copy.accused_rank = accused.rank or ""
                case_copy.accused_service_number = accused.service_number or ""
                case_copy.accused_service = accused.service or ""
                case_copy.accused_unit = accused.unit
                case_copy.save(force_insert=True)
                case_copy.accused_entries.create(
                    name=(accused.name or "").strip(),
                    rank=(accused.rank or "").strip(),
                    service_number=(accused.service_number or "").strip(),
                    service=(accused.service or "").strip(),
                    unit=accused.unit,
                )

    def _send_tasking_notification(self, case, created):
        if not case.tasked_battalion_id:
            return
        users = User.objects.filter(
            battalion_id=case.tasked_battalion_id,
            is_active=True,
        ).exclude(role="detachment")
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

    def _notify_brief_recipients(self, case, actor, message):
        try:
            brief = case.brief
        except (CaseBrief.DoesNotExist, AttributeError):
            return

        battalion_id = self._case_battalion_id(case)
        detachment_id = self._case_detachment_id(actor, case)

        recipients = set()
        if brief.forwarded_to_role == CaseBrief.ForwardRole.HOD:
            recipients.update(
                User.objects.filter(role=User.Role.HOD, battalion_id=battalion_id, is_active=True)
            )
        elif brief.forwarded_to_role == CaseBrief.ForwardRole.CO:
            recipients.update(
                User.objects.filter(role=User.Role.CO, battalion_id=battalion_id, is_active=True)
            )
        elif brief.forwarded_to_role == CaseBrief.ForwardRole.OC:
            recipients.update(
                User.objects.filter(role=User.Role.OC, battalion_id=battalion_id, is_active=True)
            )
        elif brief.forwarded_to_role == CaseBrief.ForwardRole.CORPS_CMD:
            recipients.update(
                User.objects.filter(role=User.Role.CORPS_CMD, is_active=True)
            )
        elif brief.forwarded_to_role == CaseBrief.ForwardRole.DETACHMENT:
            recipients.update(
                User.objects.filter(role=User.Role.DETACHMENT, detachment_id=detachment_id, is_active=True)
            )
        elif brief.forwarded_to_role == CaseBrief.ForwardRole.ADJ:
            recipients.update(
                User.objects.filter(role=User.Role.ADJ, battalion_id=battalion_id, is_active=True)
            )
        elif brief.forwarded_to_role == CaseBrief.ForwardRole.TWO_IC:
            recipients.update(
                User.objects.filter(role=User.Role.TWO_IC, battalion_id=battalion_id, is_active=True)
            )
        if actor:
            recipients.discard(actor)
        if not recipients:
            return
        Notification.objects.bulk_create([
            Notification(
                recipient=u,
                message=message,
                notification_type=Notification.Type.CASE,
                related_model="case",
                related_id=case.id,
            ) for u in recipients
        ])
        email_list = [u.email for u in recipients if u.email]
        if email_list:
            try:
                send_mail(
                    subject=f"[MPIMS] Case {case.case_number} — Brief Forwarded",
                    message=message,
                    from_email=django_settings.DEFAULT_FROM_EMAIL,
                    recipient_list=email_list,
                    fail_silently=True,
                )
            except Exception:
                pass

    def _can_upload_back_brief(self, user):
        return bool(user and user.is_authenticated and (user.is_superuser or is_hqs_admin(user)))

    def _notify_back_brief_recipients(self, case, actor, back_brief):
        battalion_id = self._case_battalion_id(case)
        recipients = set()

        if case.assigned_to and case.assigned_to.is_active:
            recipients.add(case.assigned_to)

        if case.assigned_team_id:
            team = case.assigned_team
            if team.team_ic and team.team_ic.is_active:
                recipients.add(team.team_ic)
            for member in team.members.filter(is_active=True):
                recipients.add(member)

        if battalion_id:
            recipients.update(
                User.objects.filter(
                    role__in=[
                        User.Role.ADMIN,
                        User.Role.ADJ,
                        User.Role.HOD,
                        User.Role.CO,
                        User.Role.OC,
                        User.Role.TWO_IC,
                    ],
                    battalion_id=battalion_id,
                    is_active=True,
                )
            )

        recipients.update(User.objects.filter(role=User.Role.CORPS_CMD, is_active=True))

        if actor:
            recipients.discard(actor)
        if not recipients:
            return

        msg = (
            f"{self._actor_label(actor)} uploaded a back-brief for Case #{case.case_number}. "
            "The brief and back-brief are available for review and printing."
        )
        Notification.objects.bulk_create([
            Notification(
                recipient=user,
                message=msg,
                notification_type=Notification.Type.CASE,
                related_model="case",
                related_id=case.id,
            ) for user in recipients
        ])

        email_list = [user.email for user in recipients if user.email]
        if email_list:
            try:
                send_mail(
                    subject=f"[MPIMS] Case {case.case_number} - Back-Brief Uploaded",
                    message=msg,
                    from_email=django_settings.DEFAULT_FROM_EMAIL,
                    recipient_list=email_list,
                    fail_silently=True,
                )
            except Exception:
                pass

    def _notify_brief_approval_recipients(self, case, actor, brief):
        recipients = set(
            User.objects.filter(
                Q(is_superuser=True)
                | Q(
                    role__in=[User.Role.ADMIN, User.Role.MPC_HQS],
                    battalion__battalion_type=Battalion.BattalionType.HQS,
                ),
                is_active=True,
            )
        )
        if actor:
            recipients.discard(actor)
        if not recipients:
            return

        msg = (
            f"{self._actor_label(actor)} approved the brief for Case #{case.case_number}. "
            "HQ admin can now attach the back-brief."
        )
        Notification.objects.bulk_create([
            Notification(
                recipient=user,
                message=msg,
                notification_type=Notification.Type.CASE,
                related_model="case",
                related_id=case.id,
            ) for user in recipients
        ])

        email_list = [user.email for user in recipients if user.email]
        if email_list:
            try:
                send_mail(
                    subject=f"[MPIMS] Case {case.case_number} - Brief Approved",
                    message=msg,
                    from_email=django_settings.DEFAULT_FROM_EMAIL,
                    recipient_list=email_list,
                    fail_silently=True,
                )
            except Exception:
                pass

    def _send_detachment_tasking_notification(self, case):
        """Notify all users in the tasked detachment (role=detachment as IC Det)."""
        if not case.tasked_detachment_id:
            return
        # Notify users whose detachment matches and whose role is 'detachment' (IC Det)
        users = User.objects.filter(
            detachment_id=case.tasked_detachment_id,
            role="detachment",
            is_active=True,
        )
        if not users.exists():
            return
        det_name = case.tasked_detachment.name if case.tasked_detachment else str(case.tasked_detachment_id)
        msg = (
            f"Case #{case.case_number} — '{case.title}' has been tasked to {det_name}. "
            f"Please assign an investigation team."
        )
        Notification.objects.bulk_create([
            Notification(
                recipient=u,
                message=msg,
                notification_type=Notification.Type.CASE,
                related_model="case",
                related_id=case.id,
            ) for u in users
        ])

    def _send_served_notification(self, case, actor=None):
        """Notify all admin users in HQS battalions that a case has been served."""
        hqs_admins = User.objects.filter(
            role="admin",
            battalion__battalion_type=Battalion.BattalionType.HQS,
            is_active=True,
        )
        if not hqs_admins.exists():
            return
        # Build actor attribution: "by Rank Name of Detachment/Battalion"
        if actor:
            actor_label = f"{actor.rank} {actor.name}".strip()
            if actor.detachment_id and actor.detachment:
                unit_label = actor.detachment.name
            elif actor.battalion_id and actor.battalion:
                unit_label = actor.battalion.name
            else:
                unit_label = None
            served_by = f" by {actor_label}" + (f" of {unit_label}" if unit_label else "")
        else:
            served_by = ""
        msg = (
            f"Case #{case.case_number} \u2014 '{case.title}' has been served{served_by} "
            f"and is awaiting closure."
        )
        Notification.objects.bulk_create([
            Notification(
                recipient=u,
                message=msg,
                notification_type=Notification.Type.CASE,
                related_model="case",
                related_id=case.id,
            ) for u in hqs_admins
        ])

        email_list = [u.email for u in hqs_admins if u.email]
        if email_list:
            try:
                send_mail(
                    subject=f"[MPIMS] Case Served — Case {case.case_number}",
                    message=msg,
                    from_email=django_settings.DEFAULT_FROM_EMAIL,
                    recipient_list=email_list,
                    fail_silently=True,
                )
            except Exception:
                pass

    def _send_closed_notification(self, case):
        """Notify assigned team (IC + members), tasked battalion admin, and Det IC if detachment-level."""
        recipients = set()
        # Assigned team IC + members
        if case.assigned_team_id:
            try:
                team = case.assigned_team
                if team.team_ic and team.team_ic.is_active:
                    recipients.add(team.team_ic)
                for member in team.members.filter(is_active=True):
                    recipients.add(member)
            except Exception:
                pass

        # Admin of the tasked battalion
        if case.tasked_battalion_id:
            recipients.update(User.objects.filter(
                role="admin",
                battalion_id=case.tasked_battalion_id,
                is_active=True,
            ))

        # Detachment IC if this is a detachment-level case
        if case.tasked_detachment_id:
            recipients.update(User.objects.filter(
                role="detachment",
                detachment_id=case.tasked_detachment_id,
                is_active=True,
            ))

        if not recipients:
            return
        msg = (
            f"Case #{case.case_number} — '{case.title}' has been officially closed."
        )
        Notification.objects.bulk_create([
            Notification(
                recipient=u,
                message=msg,
                notification_type=Notification.Type.CASE,
                related_model="case",
                related_id=case.id,
            ) for u in recipients
        ])

    def _send_case_update_notification(self, case, actor=None, update_date=None, update_text=""):
        """Notify HQ, tasked battalion/detachment, IO, and team members on case updates."""
        recipients = set()

        # HQ admins
        recipients.update(
            User.objects.filter(
                role="admin",
                battalion__battalion_type=Battalion.BattalionType.HQS,
                is_active=True,
            )
        )

        # Tasked battalion admins
        if case.tasked_battalion_id:
            recipients.update(
                User.objects.filter(
                    role="admin",
                    battalion_id=case.tasked_battalion_id,
                    is_active=True,
                )
            )

        # Tasked detachment IC users
        if case.tasked_detachment_id:
            recipients.update(
                User.objects.filter(
                    role="detachment",
                    detachment_id=case.tasked_detachment_id,
                    is_active=True,
                )
            )

        # IO directly assigned to the case
        if case.assigned_to and case.assigned_to.is_active:
            recipients.add(case.assigned_to)

        # Team IO and members
        if case.assigned_team_id:
            team = case.assigned_team
            if team.team_ic and team.team_ic.is_active:
                recipients.add(team.team_ic)
            for member in team.members.filter(is_active=True):
                recipients.add(member)

        if actor:
            recipients.discard(actor)
        if not recipients:
            return

        actor_label = self._actor_label(actor)
        date_label = str(update_date) if update_date else "Not provided"
        trimmed_update = (update_text or "").strip()
        if len(trimmed_update) > 160:
            trimmed_update = f"{trimmed_update[:157]}..."

        offence_label = (
            case.offence_ref.name.strip()
            if case.offence_ref and case.offence_ref.name
            else (case.offence or "Not provided").strip() or "Not provided"
        )
        case_type_label = "DCI/Civ police" if case.criminal_offence_type == Case.CriminalOffenceType.DCI_CIV else case.get_criminal_offence_type_display()

        msg = (
            f"{actor_label} updated {case_type_label} Case No {case.case_number} "
            f"Offence {offence_label} On {date_label}. "
            f"Update: {trimmed_update or 'No details provided.'}"
        )

        Notification.objects.bulk_create([
            Notification(
                recipient=u,
                message=msg,
                notification_type=Notification.Type.CASE,
                related_model="case",
                related_id=case.id,
            ) for u in recipients
        ])

    def _send_close_request_notification(self, case, actor=None):
        """Notify HQ admins via dashboard notification and email when close is requested by team."""
        hq_admins = User.objects.filter(
            role="admin",
            battalion__battalion_type=Battalion.BattalionType.HQS,
            is_active=True,
        )
        if not hq_admins.exists():
            return

        actor_label = self._actor_label(actor)
        offence_label = (
            case.offence_ref.name.strip()
            if case.offence_ref and case.offence_ref.name
            else (case.offence or "Not provided").strip() or "Not provided"
        )
        msg = (
            f"{actor_label} requested close for DCI/Civ Police Case No {case.case_number}. "
            f"Offence: {offence_label}. Please review and close on HQ dashboard."
        )

        Notification.objects.bulk_create([
            Notification(
                recipient=u,
                message=msg,
                notification_type=Notification.Type.CASE,
                related_model="case",
                related_id=case.id,
            ) for u in hq_admins
        ])

        email_list = [u.email for u in hq_admins if u.email]
        if email_list:
            try:
                send_mail(
                    subject=f"[MPIMS] Close Request — Case {case.case_number}",
                    message=msg,
                    from_email=django_settings.DEFAULT_FROM_EMAIL,
                    recipient_list=email_list,
                    fail_silently=True,
                )
            except Exception:
                pass

    @action(detail=False, methods=["get"], url_path="detachment-summary")
    def detachment_summary(self, request):
        """
        Returns per-detachment case count breakdown for the requesting user's battalion.
        Accessible to battalion admins and superusers.
        Superusers must supply ?battalion=<id> query param.
        Returns: { battalion_id, detachments: [{id, name, company, under_investigation, pending, closed, total}] }
        """
        from apps.formations.models import Detachment

        user = request.user

        if user.is_superuser:
            battalion_id = request.query_params.get("battalion")
            if not battalion_id:
                return Response(
                    {"detail": "Supply ?battalion=<id> to specify a battalion."},
                    status=http_status.HTTP_400_BAD_REQUEST,
                )
            base_qs = Case.objects.all()
        elif is_battalion_command(user):
            battalion_id = user.battalion_id
            base_qs = self.get_queryset()
        else:
            return Response(
                {"detail": "Only battalion command users can access this endpoint."},
                status=http_status.HTTP_403_FORBIDDEN,
            )

        detachments = Detachment.objects.filter(battalion_id=battalion_id).order_by("name")
        summary = []
        for det in detachments:
            det_qs = base_qs.filter(tasked_detachment_id=det.id)
            summary.append({
                "id": det.id,
                "name": det.name,
                "company": det.company,
                "tasked": det_qs.filter(status=Case.Status.TASKED).count(),
                "under_investigation": det_qs.filter(status=Case.Status.UNDER_INVESTIGATION).count(),
                "pending": det_qs.filter(status=Case.Status.PENDING).count(),
                "closed": det_qs.filter(status=Case.Status.CLOSED).count(),
                "total": det_qs.count(),
            })

        return Response({"battalion_id": battalion_id, "detachments": summary})

    @action(detail=False, methods=["get"], url_path="analytics")
    def analytics(self, request):
        """
        Deadline-based resolution analytics scoped to the requesting user.
        Returns:
          - total_with_deadline     : cases that have an investigation_deadline set
          - resolved_total          : served or closed cases with a deadline
          - resolved_on_time        : resolved where served_at.date() <= investigation_deadline
          - resolved_late           : resolved where served_at.date() > investigation_deadline
          - on_time_rate_pct        : on_time / resolved_total * 100  (null if none resolved)
          - currently_overdue       : deadline < today AND status not in [served, closed]
          - avg_days_variance       : avg(served_at.date() - investigation_deadline) in days
                                      negative = early, positive = late
          - avg_team_window_days    : avg(investigation_deadline - team_assigned_at.date())
                                      how many days teams were given from assignment to deadline
          - avg_team_resolution_days: avg(served_at.date() - team_assigned_at.date())
                                      how many days teams actually took from assignment to close
          - by_battalion            : per-battalion breakdown (superuser / HQ admin only)
        """
        qs = self.get_queryset()
        today = date.today()

        resolved_statuses = [Case.Status.SERVED, Case.Status.CLOSED]

        with_deadline = qs.filter(investigation_deadline__isnull=False)
        resolved = with_deadline.filter(status__in=resolved_statuses, served_at__isnull=False)

        # On-time: served_at (datetime) cast to date <= investigation_deadline
        from django.db.models.functions import TruncDate
        resolved_on_time = resolved.filter(
            served_at__date__lte=F("investigation_deadline")
        ).count()
        resolved_late = resolved.filter(
            served_at__date__gt=F("investigation_deadline")
        ).count()
        resolved_total = resolved_on_time + resolved_late

        on_time_rate = round(resolved_on_time / resolved_total * 100, 1) if resolved_total else None

        currently_overdue = with_deadline.filter(
            investigation_deadline__lt=today
        ).exclude(status__in=resolved_statuses).count()

        # Average variance in days (served_at.date − investigation_deadline)
        # We compute in Python to avoid DB-level date subtraction dialect issues
        variance_days = [
            (c.served_at.date() - c.investigation_deadline).days
            for c in resolved
            if c.served_at and c.investigation_deadline
        ]
        avg_variance = round(sum(variance_days) / len(variance_days), 1) if variance_days else None

        # Team window: investigation_deadline − team_assigned_at (how long the team was given)
        team_cases = with_deadline.filter(team_assigned_at__isnull=False)
        team_window_days = [
            (c.investigation_deadline - c.team_assigned_at.date()).days
            for c in team_cases
            if c.investigation_deadline and c.team_assigned_at
        ]
        avg_team_window = round(sum(team_window_days) / len(team_window_days), 1) if team_window_days else None

        # Team resolution time: served_at.date − team_assigned_at.date (how long they actually took)
        resolved_with_assignment = resolved.filter(team_assigned_at__isnull=False)
        team_resolution_days = [
            (c.served_at.date() - c.team_assigned_at.date()).days
            for c in resolved_with_assignment
            if c.served_at and c.team_assigned_at
        ]
        avg_team_resolution = round(sum(team_resolution_days) / len(team_resolution_days), 1) if team_resolution_days else None

        result = {
            "total_with_deadline":      with_deadline.count(),
            "resolved_total":           resolved_total,
            "resolved_on_time":         resolved_on_time,
            "resolved_late":            resolved_late,
            "on_time_rate_pct":         on_time_rate,
            "currently_overdue":        currently_overdue,
            "avg_days_variance":        avg_variance,
            "avg_team_window_days":     avg_team_window,
            "avg_team_resolution_days": avg_team_resolution,
        }

        # Per-battalion breakdown for superuser / HQ admin
        user = request.user
        is_hq_admin = (
            has_global_read_access(user)
        )
        if is_hq_admin:
            from apps.formations.models import Battalion
            breakdown = []
            for bn in Battalion.objects.order_by("name"):
                bn_qs = with_deadline.filter(tasked_battalion=bn)
                bn_resolved = bn_qs.filter(status__in=resolved_statuses, served_at__isnull=False)
                bn_on_time = bn_resolved.filter(
                    served_at__date__lte=F("investigation_deadline")
                ).count()
                bn_total_resolved = bn_resolved.count()
                bn_overdue = bn_qs.filter(
                    investigation_deadline__lt=today
                ).exclude(status__in=resolved_statuses).count()
                breakdown.append({
                    "battalion": bn.name,
                    "total_with_deadline": bn_qs.count(),
                    "resolved_total":      bn_total_resolved,
                    "resolved_on_time":    bn_on_time,
                    "on_time_rate_pct":    round(bn_on_time / bn_total_resolved * 100, 1)
                                           if bn_total_resolved else None,
                    "currently_overdue":   bn_overdue,
                })
            result["by_battalion"] = breakdown

        return Response(result)

    @action(detail=False, methods=["get"], url_path="statistics")
    def statistics(self, request):
        qs = self.get_queryset()

        def top_text_field(field_name):
            rows = (
                qs.exclude(**{f"{field_name}__isnull": True})
                .exclude(**{field_name: ""})
                .values(field_name)
                .annotate(count=Count("id", distinct=True))
                .order_by("-count", field_name)[:10]
            )
            return [
                {
                    "label": row.get(field_name) or "Not recorded",
                    "count": row["count"],
                }
                for row in rows
            ]

        unit_rows = (
            qs.filter(accused_unit__isnull=False)
            .values("accused_unit_id", "accused_unit__name")
            .annotate(count=Count("id", distinct=True))
            .order_by("-count", "accused_unit__name")[:10]
        )
        top_accused_units = [
            {
                "id": row["accused_unit_id"],
                "label": row["accused_unit__name"] or "Unknown unit",
                "count": row["count"],
            }
            for row in unit_rows
        ]

        criminal_rows = (
            qs.exclude(criminal_offence_type="")
            .values("criminal_offence_type")
            .annotate(count=Count("id", distinct=True))
        )
        criminal_counts = {
            row["criminal_offence_type"]: row["count"]
            for row in criminal_rows
        }
        criminal_offence_types = [
            {
                "key": key,
                "label": label,
                "count": criminal_counts.get(key, 0),
            }
            for key, label in Case.CriminalOffenceType.choices
        ]
        criminal_offence_types.sort(key=lambda item: (-item["count"], item["label"]))

        return Response({
            "total_cases": qs.count(),
            "top_hotspots": top_text_field("place_of_offence"),
            "top_accused_units": top_accused_units,
            "top_offences": top_text_field("offence"),
            "criminal_offence_types": criminal_offence_types[:10],
            "service_report": self._service_statistics_report(qs, request),
        })

    def _service_statistics_report(self, qs, request):
        service_labels = {
            Case.Service.KA: "Kenya Army",
            Case.Service.KAF: "Kenya Air Force",
            Case.Service.KN: "Kenya Navy",
            "not_recorded": "Service Not Recorded",
        }
        service_order = [Case.Service.KA, Case.Service.KAF, Case.Service.KN, "not_recorded"]

        status_key = request.query_params.get("service_report_status") or "pending"
        status_choices = dict(Case.Status.choices)
        if status_key == "active":
            report_qs = qs.filter(status__in=[Case.Status.TASKED, Case.Status.UNDER_INVESTIGATION, Case.Status.PENDING])
            status_label = "Active/Pending"
        elif status_key == "all":
            report_qs = qs
            status_label = "All"
        elif status_key in status_choices:
            report_qs = qs.filter(status=status_key)
            status_label = status_choices[status_key]
        else:
            raise ValidationError({"service_report_status": "Select a valid report status."})

        period = request.query_params.get("period") or "as_at"
        today = timezone.localdate()
        as_at_date = today
        date_from = None
        date_to = None
        if period == "range":
            raw_from = request.query_params.get("date_from") or today.isoformat()
            raw_to = request.query_params.get("date_to") or today.isoformat()
            try:
                date_from = date.fromisoformat(raw_from)
                date_to = date.fromisoformat(raw_to)
            except ValueError as exc:
                raise ValidationError({"date_range": "Use YYYY-MM-DD format for range dates."}) from exc
            if date_from > date_to:
                raise ValidationError({"date_range": "From date cannot be later than To date."})
            report_qs = report_qs.filter(created_at__date__gte=date_from, created_at__date__lte=date_to)
            as_at_date = date_to
        elif period == "as_at":
            as_at = request.query_params.get("as_at") or today.isoformat()
            try:
                as_at_date = date.fromisoformat(as_at)
            except ValueError as exc:
                raise ValidationError({"as_at": "Use YYYY-MM-DD format."}) from exc
            report_qs = report_qs.filter(created_at__date__lte=as_at_date)
        else:
            raise ValidationError({"period": "Select either as_at or range."})

        service_filter = request.query_params.get("service") or ""
        valid_services = {Case.Service.KA, Case.Service.KAF, Case.Service.KN}
        if service_filter and service_filter not in valid_services:
            raise ValidationError({"service": "Select a valid service."})

        services = {}
        for row in report_qs.order_by().values(
            "id",
            "accused_service",
            "accused_unit_id",
            "accused_unit__name",
            "accused_unit__service",
            "offence",
        ):
            service = row["accused_service"] or row["accused_unit__service"] or "not_recorded"
            if service_filter and service != service_filter:
                continue

            service_bucket = services.setdefault(service, {
                "service": service,
                "label": service_labels.get(service, service),
                "offences": set(),
                "rows": {},
                "total": 0,
            })

            offence = (row["offence"] or "").strip() or "Not recorded"
            unit_id = row["accused_unit_id"]
            unit_key = str(unit_id) if unit_id else "not_recorded"
            unit_label = row["accused_unit__name"] or "Not recorded"

            service_bucket["offences"].add(offence)
            unit_row = service_bucket["rows"].setdefault(unit_key, {
                "unit_id": unit_id,
                "formation_unit": unit_label,
                "offences": {},
                "total": 0,
            })
            unit_row["offences"][offence] = unit_row["offences"].get(offence, 0) + 1
            unit_row["total"] += 1
            service_bucket["total"] += 1

        reports = []
        ordered_services = service_order + sorted(set(services.keys()) - set(service_order))
        if service_filter and service_filter not in services:
            ordered_services = [service_filter]
            services[service_filter] = {
                "service": service_filter,
                "label": service_labels.get(service_filter, service_filter),
                "offences": set(),
                "rows": {},
                "total": 0,
            }

        for service in ordered_services:
            bucket = services.get(service)
            if not bucket:
                continue
            offence_columns = sorted(bucket["offences"])
            rows = sorted(bucket["rows"].values(), key=lambda item: item["formation_unit"].lower())
            subtotal = {
                offence: sum(row["offences"].get(offence, 0) for row in rows)
                for offence in offence_columns
            }
            reports.append({
                "service": bucket["service"],
                "label": bucket["label"],
                "offences": offence_columns,
                "rows": rows,
                "subtotal": subtotal,
                "total": bucket["total"],
            })

        return {
            "period": period,
            "as_at": as_at_date.isoformat(),
            "date_from": date_from.isoformat() if date_from else None,
            "date_to": date_to.isoformat() if date_to else None,
            "status": status_key,
            "status_label": status_label,
            "service": service_filter,
            "services": reports,
            "total": sum(report["total"] for report in reports),
        }

    @action(
        detail=True,
        methods=["get", "post"],
        url_path="attachments",
        parser_classes=[MultiPartParser, FormParser],
    )
    def attachments(self, request, pk=None):
        case = self.get_object()
        if request.method == "GET":
            qs = case.extra_attachments.select_related("uploaded_by").all()
            serializer = CaseAttachmentSerializer(qs, many=True, context={"request": request})
            return Response(serializer.data)
        serializer = CaseAttachmentSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        att = serializer.save(case=case, uploaded_by=request.user)
        filename = att.file.name.split("/")[-1] if att.file else ""
        label = att.label or filename
        self._log_action(case, request.user, CaseActivityLog.Action.ATTACHMENT_UPLOADED,
                         f"Uploaded '{label}'")
        actor_label = self._actor_label(request.user)
        self._notify_team(
            case, actor=request.user,
            message=(
                f"{actor_label} uploaded attachment '{label}' on Case #{case.case_number} "
                f"— '{case.title}'."
            ),
        )
        return Response(serializer.data, status=http_status.HTTP_201_CREATED)

    @action(
        detail=False,
        methods=["get"],
        url_path="briefable-cases",
        parser_classes=[JSONParser],
    )
    def briefable_cases(self, request):
        if request.user.role != User.Role.INVESTIGATOR:
            return Response([])
        qs = self.get_queryset().select_related(
            "assigned_to",
            "assigned_team",
            "assigned_team__team_ic",
            "tasked_battalion",
            "tasked_detachment",
            "accused_unit",
        ).prefetch_related("assigned_team__members", "accused_entries")
        qs = self._brief_case_scope(request.user, qs).filter(brief__isnull=True).order_by("-created_at")
        serializer = CaseSerializer(qs, many=True, context={"request": request})
        return Response(serializer.data)

    @action(
        detail=False,
        methods=["get"],
        url_path="briefs",
        parser_classes=[JSONParser],
    )
    def briefs(self, request):
        qs = self.get_queryset().select_related(
            "assigned_to",
            "assigned_team",
            "assigned_team__team_ic",
            "tasked_battalion",
            "tasked_detachment",
            "accused_unit",
            "brief",
            "brief__attached_by",
            "brief__forwarded_by",
            "brief__approved_by",
        ).prefetch_related(
            "assigned_team__members",
            "accused_entries",
            "brief__forward_history",
            "brief__forward_history__forwarded_by",
        )
        qs = self._brief_case_scope(request.user, qs).filter(brief__isnull=False)
        qs = self._brief_visible_scope(request.user, qs).order_by("-brief__updated_at")
        serializer = CaseSerializer(qs, many=True, context={"request": request})
        return Response(serializer.data)

    @action(
        detail=False,
        methods=["get"],
        url_path="back-briefs",
        parser_classes=[JSONParser],
    )
    def back_briefs(self, request):
        qs = self.get_queryset().select_related(
            "assigned_to",
            "assigned_team",
            "assigned_team__team_ic",
            "tasked_battalion",
            "tasked_detachment",
            "accused_unit",
            "brief",
            "brief__attached_by",
            "brief__forwarded_by",
            "brief__approved_by",
            "brief__back_brief",
            "brief__back_brief__uploaded_by",
        ).prefetch_related(
            "assigned_team__members",
            "accused_entries",
            "brief__forward_history",
            "brief__forward_history__forwarded_by",
        )
        qs = qs.filter(brief__isnull=False)

        if self._can_upload_back_brief(request.user):
            serializer = CaseSerializer(qs.order_by("-brief__updated_at"), many=True, context={"request": request})
            return Response(serializer.data)

        if request.user.role == User.Role.INVESTIGATOR:
            qs = self._brief_case_scope(request.user, qs)
        elif request.user.role == User.Role.DETACHMENT:
            if not request.user.detachment_id:
                qs = qs.none()
            else:
                qs = qs.filter(
                    Q(tasked_detachment_id=request.user.detachment_id)
                    | Q(assigned_team__detachment_id=request.user.detachment_id)
                ).distinct()
        else:
            qs = self._brief_visible_scope(request.user, qs)

        serializer = CaseSerializer(qs.order_by("-brief__back_brief__uploaded_at", "-brief__updated_at"), many=True, context={"request": request})
        return Response(serializer.data)

    @action(
        detail=True,
        methods=["get", "post", "patch"],
        url_path="brief",
        parser_classes=[MultiPartParser, FormParser],
    )
    def brief(self, request, pk=None):
        case = self.get_object()
        if request.method == "GET":
            if not hasattr(case, "brief"):
                return Response(None, status=http_status.HTTP_204_NO_CONTENT)
            if not self._can_view_case_brief(request.user, case, case.brief):
                raise PermissionDenied("This brief has not been forwarded to your role.")
            serializer = CaseBriefSerializer(case.brief, context={"request": request})
            return Response(serializer.data)

        data = request.data.copy()
        if request.method == "POST":
            if request.user.role != User.Role.INVESTIGATOR or not self._can_manage_case_brief(request.user, case):
                raise PermissionDenied("Only assigned investigators can create briefs.")
        if request.method == "POST" and hasattr(case, "brief"):
            return Response(
                {"detail": "A brief already exists for this case. Use forwarding or update instead."},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        if request.method == "PATCH" and not hasattr(case, "brief"):
            return Response(
                {"detail": "No brief exists for this case to update or forward."},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        had_brief = hasattr(case, "brief")
        is_forward = request.method == "PATCH" and bool(data.get("forwarded_to_role"))
        if is_forward:
            if not had_brief:
                raise PermissionDenied("No brief exists for this case to forward.")
            requested_role = data.get("forwarded_to_role")
            allowed_roles = self._brief_forward_allowed_roles(request.user, case, case.brief)
            if requested_role not in allowed_roles:
                duplicate = self._brief_duplicate_forward(case.brief, requested_role)
                if duplicate:
                    forwarded_by = self._actor_label(duplicate.forwarded_by) if duplicate.forwarded_by else "another user"
                    target_label = self._brief_forward_label(requested_role)
                    raise ValidationError({
                        "detail": (
                            f"This brief was already forwarded to {target_label} by {forwarded_by}. "
                            f"Edit the brief before forwarding to {target_label} again."
                        )
                    })
                raise PermissionDenied("You cannot forward this brief to that role at this stage.")
        elif request.method == "PATCH":
            if not self._can_edit_case_brief(request.user, case, case.brief):
                raise PermissionDenied("You cannot edit this brief at this stage.")
        if had_brief:
            serializer = CaseBriefSerializer(case.brief, data=data, partial=True, context={"request": request})
        else:
            serializer = CaseBriefSerializer(data=data, context={"request": request})

        serializer.is_valid(raise_exception=True)
        if had_brief:
            brief = serializer.save()
        else:
            brief = serializer.save(case=case, attached_by=request.user)

        if is_forward:
            forwarded_at = timezone.now()
            brief.status = CaseBrief.Status.FORWARDED
            brief.forwarded_at = forwarded_at
            brief.forwarded_by = request.user
            brief.forwarded_from_role = request.user.role
            brief.save(update_fields=["status", "forwarded_at", "forwarded_by", "forwarded_from_role"])
            CaseBriefForward.objects.create(
                brief=brief,
                from_role=request.user.role or "",
                to_role=brief.forwarded_to_role,
                forwarded_by=request.user,
                note=brief.forwarded_note or "",
                revision=brief.revision,
                forwarded_at=forwarded_at,
            )
            action = CaseActivityLog.Action.BRIEF_FORWARDED
            detail = f"Forwarded brief to {brief.get_forwarded_to_role_display()}"
            self._notify_brief_recipients(
                case,
                request.user,
                f"{self._actor_label(request.user)} forwarded brief for Case #{case.case_number} to {brief.get_forwarded_to_role_display()}."
            )
        else:
            action = CaseActivityLog.Action.BRIEF_ATTACHED if request.method == "POST" and not had_brief else CaseActivityLog.Action.BRIEF_UPDATED
            detail = f"{'Attached' if action == CaseActivityLog.Action.BRIEF_ATTACHED else 'Updated'} brief"
            if request.method == "PATCH" and had_brief:
                update_fields = ["revision", "updated_at"]
                brief.revision = (brief.revision or 1) + 1
                editor_stage = self._brief_forward_target_for_role(request.user)
                if request.user.role == User.Role.INVESTIGATOR:
                    brief.status = CaseBrief.Status.DRAFT
                    brief.forwarded_to_role = ""
                    update_fields.extend(["status", "forwarded_to_role"])
                elif editor_stage:
                    brief.status = CaseBrief.Status.FORWARDED
                    brief.forwarded_to_role = editor_stage
                    update_fields.extend(["status", "forwarded_to_role"])
                if brief.approved_at:
                    brief.approved_by = None
                    brief.approved_at = None
                    brief.approved_note = ""
                    update_fields.extend(["approved_by", "approved_at", "approved_note"])
                brief.save(update_fields=update_fields)

        self._log_action(case, request.user, action, detail)
        return Response(CaseBriefSerializer(brief, context={"request": request}).data, status=http_status.HTTP_200_OK)

    @action(
        detail=True,
        methods=["post"],
        url_path="brief/approve",
        parser_classes=[JSONParser],
    )
    def approve_brief(self, request, pk=None):
        if request.user.role != User.Role.CORPS_CMD:
            raise PermissionDenied("Only Corps Commander can approve briefs for back-brief attachment.")

        case = self.get_object()
        if not hasattr(case, "brief"):
            return Response(
                {"detail": "No brief exists for this case."},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        brief = case.brief
        if not self._can_view_case_brief(request.user, case, brief):
            raise PermissionDenied("This brief has not been forwarded to Corps Commander.")
        if brief.forwarded_to_role != CaseBrief.ForwardRole.CORPS_CMD:
            return Response(
                {"detail": "Brief must be forwarded to Corps Commander before it can be approved."},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        if brief.approved_at:
            approved_by = self._actor_label(brief.approved_by) if brief.approved_by else "Corps Commander"
            return Response(
                {"detail": f"This brief was already approved by {approved_by}."},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        brief.approved_by = request.user
        brief.approved_at = timezone.now()
        brief.approved_note = (request.data.get("approved_note") or request.data.get("note") or "").strip()
        brief.save(update_fields=["approved_by", "approved_at", "approved_note", "updated_at"])

        self._log_action(
            case,
            request.user,
            CaseActivityLog.Action.BRIEF_UPDATED,
            "Approved brief for back-brief attachment",
        )
        self._notify_brief_approval_recipients(case, request.user, brief)
        return Response(CaseBriefSerializer(brief, context={"request": request}).data, status=http_status.HTTP_200_OK)

    @action(
        detail=True,
        methods=["post"],
        url_path="back-brief",
        parser_classes=[MultiPartParser, FormParser],
    )
    def back_brief(self, request, pk=None):
        if not self._can_upload_back_brief(request.user):
            raise PermissionDenied("Only HQ admin users can upload back-briefs.")

        case = self.get_object()
        if not hasattr(case, "brief"):
            return Response(
                {"detail": "No brief exists for this case."},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        if hasattr(case.brief, "back_brief"):
            return Response(
                {"detail": "A back-brief has already been attached to this brief."},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        if not case.brief.approved_at:
            return Response(
                {"detail": "Back-brief can only be attached after the brief has been approved by Corps Commander."},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        serializer = CaseBackBriefSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        back_brief = serializer.save(brief=case.brief, uploaded_by=request.user)
        self._log_action(case, request.user, CaseActivityLog.Action.BRIEF_UPDATED, "Uploaded back-brief")
        self._notify_back_brief_recipients(case, request.user, back_brief)
        return Response(
            CaseBackBriefSerializer(back_brief, context={"request": request}).data,
            status=http_status.HTTP_201_CREATED,
        )

    @action(
        detail=True,
        methods=["delete"],
        url_path=r"attachments/(?P<att_pk>[^/.]+)",
        parser_classes=[JSONParser],
    )
    def delete_attachment(self, request, pk=None, att_pk=None):
        case = self.get_object()
        try:
            att = case.extra_attachments.get(pk=att_pk)
            filename = att.file.name.split("/")[-1] if att.file else str(att_pk)
            label = att.label or filename
            att.file.delete(save=False)
            att.delete()
            self._log_action(case, request.user, CaseActivityLog.Action.ATTACHMENT_DELETED,
                             f"Deleted '{label}'")
            actor_label = self._actor_label(request.user)
            self._notify_team(
                case, actor=request.user,
                message=(
                    f"{actor_label} deleted attachment '{label}' from Case #{case.case_number} "
                    f"— '{case.title}'."
                ),
            )
            return Response(status=http_status.HTTP_204_NO_CONTENT)
        except CaseAttachment.DoesNotExist:
            return Response({"detail": "Not found."}, status=http_status.HTTP_404_NOT_FOUND)

    @action(
        detail=True,
        methods=["get", "post"],
        url_path="court-milestones",
        parser_classes=[JSONParser],
    )
    def court_milestones(self, request, pk=None):
        case = self.get_object()
        if case.criminal_offence_type != Case.CriminalOffenceType.COURT_MARTIAL:
            return Response(
                {"detail": "Court milestones are only available for Court Martial cases."},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        if not self._can_set_court_martial_schedule(request.user, case):
            return Response(
                {"detail": "Only investigator/team IO/members or HQ admins can manage Court Martial milestones."},
                status=http_status.HTTP_403_FORBIDDEN,
            )

        if request.method == "GET":
            qs = case.court_martial_milestones.select_related("created_by", "action_recorded_by").all()
            serializer = CaseCourtMartialMilestoneSerializer(qs, many=True)
            return Response(serializer.data)

        serializer = CaseCourtMartialMilestoneSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        milestone = serializer.save(case=case, created_by=request.user)
        self._log_action(
            case,
            request.user,
            CaseActivityLog.Action.CASE_UPDATED,
            f"Added {milestone.milestone_type} date {milestone.scheduled_date}",
        )
        return Response(CaseCourtMartialMilestoneSerializer(milestone).data, status=http_status.HTTP_201_CREATED)

    @action(
        detail=True,
        methods=["patch", "delete"],
        url_path=r"court-milestones/(?P<milestone_pk>[^/.]+)",
        parser_classes=[JSONParser],
    )
    def court_milestone_detail(self, request, pk=None, milestone_pk=None):
        case = self.get_object()
        if case.criminal_offence_type != Case.CriminalOffenceType.COURT_MARTIAL:
            return Response(
                {"detail": "Court milestones are only available for Court Martial cases."},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        if not self._can_set_court_martial_schedule(request.user, case):
            return Response(
                {"detail": "Only investigator/team IO/members or HQ admins can manage Court Martial milestones."},
                status=http_status.HTTP_403_FORBIDDEN,
            )

        try:
            milestone = case.court_martial_milestones.get(pk=milestone_pk)
        except CaseCourtMartialMilestone.DoesNotExist:
            return Response({"detail": "Not found."}, status=http_status.HTTP_404_NOT_FOUND)

        if request.method == "DELETE":
            detail = f"Deleted {milestone.milestone_type} date {milestone.scheduled_date}"
            milestone.delete()
            self._log_action(case, request.user, CaseActivityLog.Action.CASE_UPDATED, detail)
            return Response(status=http_status.HTTP_204_NO_CONTENT)

        serializer = CaseCourtMartialMilestoneSerializer(milestone, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        updating_action_remarks = "action_remarks" in request.data
        if updating_action_remarks:
            if not self._can_edit_court_action_remarks(request.user, case):
                return Response(
                    {"detail": "Only team IO/members can edit Court Action / Remarks."},
                    status=http_status.HTTP_403_FORBIDDEN,
                )
            latest = self._latest_court_milestone(case)
            if not latest or latest.id != milestone.id:
                return Response(
                    {"detail": "Court Action / Remarks can only be edited on the most current milestone."},
                    status=http_status.HTTP_400_BAD_REQUEST,
                )

        previous_action_remarks = milestone.action_remarks or ""
        updated = serializer.save()
        new_action_remarks = (updated.action_remarks or "").strip()
        if new_action_remarks and new_action_remarks != previous_action_remarks.strip():
            updated.action_recorded_by = request.user
            updated.action_recorded_at = timezone.now()
            updated.save(update_fields=["action_recorded_by", "action_recorded_at", "updated_at"])
        self._log_action(
            case,
            request.user,
            CaseActivityLog.Action.CASE_UPDATED,
            f"Updated {updated.milestone_type} milestone",
        )
        return Response(CaseCourtMartialMilestoneSerializer(updated).data)

    @action(
        detail=True,
        methods=["get", "post"],
        url_path="court-hearings",
        parser_classes=[JSONParser],
    )
    def court_hearings(self, request, pk=None):
        case = self.get_object()
        if case.criminal_offence_type != Case.CriminalOffenceType.COURT_MARTIAL:
            return Response(
                {"detail": "Court hearings are only available for Court Martial cases."},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        if not self._can_manage_court_martial_progress(request.user, case):
            return Response(
                {"detail": "Only team IO/members or HQ admins can manage Court Martial hearings."},
                status=http_status.HTTP_403_FORBIDDEN,
            )

        if request.method == "GET":
            qs = case.court_martial_hearings.select_related("created_by").all()
            serializer = CaseCourtMartialHearingSerializer(qs, many=True)
            return Response(serializer.data)

        if case.status not in {Case.Status.SERVED, Case.Status.CLOSED}:
            return Response(
                {"detail": "Hearing dates can be recorded after the case is served."},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        serializer = CaseCourtMartialHearingSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        hearing = serializer.save(case=case, created_by=request.user)
        self._log_action(
            case,
            request.user,
            CaseActivityLog.Action.CASE_UPDATED,
            f"Added hearing date {hearing.hearing_date}",
        )
        return Response(CaseCourtMartialHearingSerializer(hearing).data, status=http_status.HTTP_201_CREATED)

    @action(
        detail=True,
        methods=["patch", "delete"],
        url_path=r"court-hearings/(?P<hearing_pk>[^/.]+)",
        parser_classes=[JSONParser],
    )
    def court_hearing_detail(self, request, pk=None, hearing_pk=None):
        case = self.get_object()
        if case.criminal_offence_type != Case.CriminalOffenceType.COURT_MARTIAL:
            return Response(
                {"detail": "Court hearings are only available for Court Martial cases."},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        if not self._can_manage_court_martial_progress(request.user, case):
            return Response(
                {"detail": "Only team IO/members or HQ admins can manage Court Martial hearings."},
                status=http_status.HTTP_403_FORBIDDEN,
            )
        try:
            hearing = case.court_martial_hearings.get(pk=hearing_pk)
        except CaseCourtMartialHearing.DoesNotExist:
            return Response({"detail": "Not found."}, status=http_status.HTTP_404_NOT_FOUND)

        if request.method == "DELETE":
            hearing.delete()
            self._log_action(
                case,
                request.user,
                CaseActivityLog.Action.CASE_UPDATED,
                "Deleted a hearing date",
            )
            return Response(status=http_status.HTTP_204_NO_CONTENT)

        serializer = CaseCourtMartialHearingSerializer(hearing, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        self._log_action(
            case,
            request.user,
            CaseActivityLog.Action.CASE_UPDATED,
            f"Updated hearing date {serializer.instance.hearing_date}",
        )
        return Response(serializer.data)

    @action(detail=True, methods=["get"], url_path="activity")
    def activity(self, request, pk=None):
        case = self.get_object()
        if not self._can_view_case_progress(request.user, case):
            raise ValidationError({"detail": "You may not view progress updates for this case."})
        qs = case.activity_logs.select_related("actor").all()
        serializer = CaseActivityLogSerializer(qs, many=True, context={"request": request})
        return Response(serializer.data)
