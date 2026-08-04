from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from .models import Guardroom, GuardPost, GuardroomPlacementRequest
from .serializers import GuardroomPlacementRequestSerializer, GuardroomSerializer, GuardPostSerializer
from apps.notifications.models import Notification
from apps.users.access import (
    command_read_only_message,
    has_global_read_access,
    is_battalion_command,
    should_block_command_write,
)
from apps.users.models import User


class GuardroomViewSet(viewsets.ModelViewSet):
    queryset = Guardroom.objects.all()
    serializer_class = GuardroomSerializer
    filterset_fields = ["unit", "is_active"]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if should_block_command_write(request.user, request.method):
            raise PermissionDenied(command_read_only_message(request.user))
        if request.method not in permissions.SAFE_METHODS and not request.user.is_superuser:
            raise PermissionDenied("Only a superuser can manage guardrooms.")

    def get_queryset(self):
        qs = Guardroom.objects.select_related("unit", "ic").prefetch_related("posts").all()
        user = self.request.user
        if has_global_read_access(user):
            return qs
        if self.request.method in permissions.SAFE_METHODS:
            return qs.filter(is_active=True)
        return qs.none()


class GuardPostViewSet(viewsets.ModelViewSet):
    queryset = GuardPost.objects.all()
    serializer_class = GuardPostSerializer
    filterset_fields = ["guardroom"]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if should_block_command_write(request.user, request.method):
            raise PermissionDenied(command_read_only_message(request.user))

    def get_queryset(self):
        qs = GuardPost.objects.select_related("guardroom", "guardroom__unit").prefetch_related("assigned_personnel").all()
        user = self.request.user
        if has_global_read_access(user):
            return qs
        if user.battalion_id:
            return qs.filter(guardroom__unit__battalion_id=user.battalion_id)
        return qs.filter(assigned_personnel=user)


class GuardroomPlacementRequestViewSet(viewsets.ModelViewSet):
    serializer_class = GuardroomPlacementRequestSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields = ["status", "case", "guardroom", "requested_by"]

    def get_queryset(self):
        qs = GuardroomPlacementRequest.objects.select_related(
            "case",
            "case__accused_unit",
            "case__assigned_to",
            "case__assigned_team",
            "case__assigned_team__battalion",
            "case__assigned_team__detachment",
            "case__assigned_team__team_ic",
            "case__tasked_battalion",
            "case__tasked_detachment",
            "guardroom",
            "requested_by",
            "reviewed_by",
            "booked_in_by",
            "book_out_requested_by",
            "book_out_reviewed_by",
            "released_by",
            "requested_by__battalion",
            "requested_by__detachment",
        ).prefetch_related("case__assigned_team__members")
        user = self.request.user
        if self.request.query_params.get("scope") == "guardroom_status":
            return self._guardroom_status_queryset(qs, user)
        if has_global_read_access(user):
            return qs
        if user.role == User.Role.DETACHMENT and user.detachment_id:
            return qs.filter(self._detachment_request_scope(user.detachment_id)).distinct()
        if user.role == User.Role.ADJ and user.battalion_id:
            return qs.filter(self._battalion_request_scope(user.battalion_id)).distinct()
        if user.role == User.Role.INVESTIGATOR:
            return self._investigator_requests_queryset(qs, user)
        if user.role == User.Role.GUARDROOM_IC:
            return qs.filter(Q(guardroom__ic=user) | Q(requested_by=user)).distinct()
        return qs.filter(requested_by=user)

    def perform_create(self, serializer):
        placement = serializer.save(requested_by=self.request.user)
        self._notify_placement_reviewers(placement)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        placement = self.get_object()
        self._ensure_can_review(request.user, placement)
        if placement.status != GuardroomPlacementRequest.Status.PENDING:
            raise ValidationError({"status": "Only pending requests can be approved."})

        comments = str(request.data.get("comments") or "").strip()
        placement.status = GuardroomPlacementRequest.Status.APPROVED
        placement.reviewed_by = request.user
        placement.reviewed_at = timezone.now()
        placement.reviewer_comments = comments
        placement.rejection_reason = ""
        placement.save(update_fields=[
            "status", "reviewed_by", "reviewed_at", "reviewer_comments", "rejection_reason", "updated_at",
        ])
        self._notify_requester(placement)
        return Response(self.get_serializer(placement).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        placement = self.get_object()
        self._ensure_can_review(request.user, placement)
        if placement.status != GuardroomPlacementRequest.Status.PENDING:
            raise ValidationError({"status": "Only pending requests can be rejected."})

        rejection_reason = str(request.data.get("rejection_reason") or request.data.get("comments") or "").strip()
        if not rejection_reason:
            raise ValidationError({"rejection_reason": "Reason for rejection is required."})

        placement.status = GuardroomPlacementRequest.Status.REJECTED
        placement.reviewed_by = request.user
        placement.reviewed_at = timezone.now()
        placement.reviewer_comments = str(request.data.get("comments") or "").strip()
        placement.rejection_reason = rejection_reason
        placement.save(update_fields=[
            "status", "reviewed_by", "reviewed_at", "reviewer_comments", "rejection_reason", "updated_at",
        ])
        self._notify_requester(placement)
        return Response(self.get_serializer(placement).data)

    @action(detail=True, methods=["post"], url_path="book-in")
    def book_in(self, request, pk=None):
        placement = self.get_object()
        self._ensure_can_book_in(request.user, placement)
        if placement.status != GuardroomPlacementRequest.Status.APPROVED:
            raise ValidationError({"status": "Only approved requests can be booked in."})
        if placement.booked_in_at:
            raise ValidationError({"booked_in_at": "This offender has already been booked into guardroom."})

        with transaction.atomic():
            placement = (
                GuardroomPlacementRequest.objects.select_for_update()
                .select_related("guardroom")
                .get(pk=placement.pk)
            )
            if placement.status != GuardroomPlacementRequest.Status.APPROVED:
                raise ValidationError({"status": "Only approved requests can be booked in."})
            if placement.booked_in_at:
                raise ValidationError({"booked_in_at": "This offender has already been booked into guardroom."})
            guardroom = Guardroom.objects.select_for_update().get(pk=placement.guardroom_id)
            if guardroom.capacity and guardroom.current_strength >= guardroom.capacity:
                raise ValidationError({"guardroom": "Selected guardroom is already at capacity."})

            placement.booked_in_by = request.user
            placement.booked_in_at = timezone.now()
            placement.save(update_fields=["booked_in_by", "booked_in_at", "updated_at"])
            guardroom.current_strength = (guardroom.current_strength or 0) + 1
            guardroom.save(update_fields=["current_strength", "updated_at"])

        placement = self.get_queryset().get(pk=placement.pk)
        return Response(self.get_serializer(placement).data)

    @action(detail=True, methods=["post"], url_path="request-book-out")
    def request_book_out(self, request, pk=None):
        placement = self.get_object()
        self._ensure_can_book_out(request.user, placement)
        if not placement.booked_in_at:
            raise ValidationError({"booked_in_at": "This offender has not been booked into guardroom."})
        if placement.released_at:
            raise ValidationError({"released_at": "This offender has already been released from guardroom."})
        if placement.book_out_status == GuardroomPlacementRequest.BookOutStatus.PENDING:
            raise ValidationError({"book_out_status": "A book-out request is already awaiting Adjutant approval."})
        if placement.book_out_status == GuardroomPlacementRequest.BookOutStatus.APPROVED:
            raise ValidationError({"book_out_status": "Book-out is already approved. Attach the release letter to free the offender."})

        placement.book_out_status = GuardroomPlacementRequest.BookOutStatus.PENDING
        placement.book_out_requested_by = request.user
        placement.book_out_requested_at = timezone.now()
        placement.book_out_reviewed_by = None
        placement.book_out_reviewed_at = None
        placement.book_out_comments = ""
        placement.book_out_rejection_reason = ""
        placement.save(update_fields=[
            "book_out_status",
            "book_out_requested_by",
            "book_out_requested_at",
            "book_out_reviewed_by",
            "book_out_reviewed_at",
            "book_out_comments",
            "book_out_rejection_reason",
            "updated_at",
        ])
        self._notify_book_out_requested(placement)
        return Response(self.get_serializer(placement).data)

    @action(detail=True, methods=["post"], url_path="approve-book-out")
    def approve_book_out(self, request, pk=None):
        placement = self.get_object()
        self._ensure_can_review_book_out(request.user, placement)
        if placement.book_out_status != GuardroomPlacementRequest.BookOutStatus.PENDING:
            raise ValidationError({"book_out_status": "Only pending book-out requests can be approved."})
        if placement.released_at:
            raise ValidationError({"released_at": "This offender has already been released from guardroom."})

        placement.book_out_status = GuardroomPlacementRequest.BookOutStatus.APPROVED
        placement.book_out_reviewed_by = request.user
        placement.book_out_reviewed_at = timezone.now()
        placement.book_out_comments = str(request.data.get("comments") or "").strip()
        placement.book_out_rejection_reason = ""
        placement.save(update_fields=[
            "book_out_status",
            "book_out_reviewed_by",
            "book_out_reviewed_at",
            "book_out_comments",
            "book_out_rejection_reason",
            "updated_at",
        ])
        self._notify_book_out_reviewed(placement)
        return Response(self.get_serializer(placement).data)

    @action(detail=True, methods=["post"], url_path="free")
    def free(self, request, pk=None):
        placement = self.get_object()
        self._ensure_can_book_out(request.user, placement)
        if placement.book_out_status != GuardroomPlacementRequest.BookOutStatus.APPROVED:
            raise ValidationError({"book_out_status": "Book-out must be approved before freeing this offender."})
        if placement.released_at:
            raise ValidationError({"released_at": "This offender has already been released from guardroom."})

        release_letter = request.FILES.get("release_letter") or request.data.get("release_letter")
        if not release_letter:
            raise ValidationError({"release_letter": "Attach a release letter before freeing this offender."})

        with transaction.atomic():
            placement = (
                GuardroomPlacementRequest.objects.select_for_update()
                .select_related("guardroom")
                .get(pk=placement.pk)
            )
            if placement.book_out_status != GuardroomPlacementRequest.BookOutStatus.APPROVED:
                raise ValidationError({"book_out_status": "Book-out must be approved before freeing this offender."})
            if placement.released_at:
                raise ValidationError({"released_at": "This offender has already been released from guardroom."})

            guardroom = Guardroom.objects.select_for_update().get(pk=placement.guardroom_id)
            placement.release_letter = release_letter
            placement.released_by = request.user
            placement.released_at = timezone.now()
            placement.save(update_fields=["release_letter", "released_by", "released_at", "updated_at"])
            guardroom.current_strength = max((guardroom.current_strength or 0) - 1, 0)
            guardroom.save(update_fields=["current_strength", "updated_at"])

        placement = self.get_queryset().get(pk=placement.pk)
        self._notify_released(placement)
        return Response(self.get_serializer(placement).data)

    def _investigator_requests_queryset(self, qs, user):
        team_scope = Q(case__assigned_team__team_ic=user) | Q(case__assigned_team__members=user)
        scope = Q(requested_by=user) | Q(case__assigned_to=user) | team_scope
        if user.detachment_id:
            scope |= self._detachment_request_scope(user.detachment_id)
        elif user.battalion_id:
            scope |= self._battalion_request_scope(user.battalion_id)
        return qs.filter(scope).distinct()

    def _guardroom_status_queryset(self, qs, user):
        qs = qs.filter(booked_in_at__isnull=False, released_at__isnull=True)
        if has_global_read_access(user):
            return qs
        if user.role == User.Role.DETACHMENT and user.detachment_id:
            return qs.filter(self._guardroom_status_detachment_scope(user.detachment_id)).distinct()
        if is_battalion_command(user):
            return qs.filter(self._guardroom_status_battalion_scope(user.battalion_id)).distinct()
        if user.role == User.Role.GUARDROOM_IC:
            return qs.filter(Q(guardroom__ic=user) | Q(requested_by=user)).distinct()
        return self._investigator_requests_queryset(qs, user)

    def _guardroom_status_detachment_scope(self, detachment_id):
        return Q(
            requested_by__role=User.Role.INVESTIGATOR,
            requested_by__detachment_id=detachment_id,
        )

    def _guardroom_status_battalion_scope(self, battalion_id):
        return Q(requested_by__role=User.Role.INVESTIGATOR) & (
            Q(requested_by__battalion_id=battalion_id)
            | Q(requested_by__detachment__battalion_id=battalion_id)
        )

    def _detachment_request_scope(self, detachment_id):
        return (
            Q(case__assigned_team__detachment_id=detachment_id)
            | Q(case__tasked_detachment_id=detachment_id)
            | Q(requested_by__detachment_id=detachment_id)
            | Q(case__assigned_to__detachment_id=detachment_id)
            | Q(case__assigned_team__team_ic__detachment_id=detachment_id)
            | Q(case__assigned_team__members__detachment_id=detachment_id)
        )

    def _battalion_request_scope(self, battalion_id):
        return (
            Q(case__assigned_team__battalion_id=battalion_id)
            | Q(case__assigned_team__detachment__battalion_id=battalion_id)
            | Q(case__tasked_battalion_id=battalion_id)
            | Q(case__tasked_detachment__battalion_id=battalion_id)
            | Q(requested_by__battalion_id=battalion_id)
            | Q(requested_by__detachment__battalion_id=battalion_id)
            | Q(case__assigned_to__battalion_id=battalion_id)
            | Q(case__assigned_to__detachment__battalion_id=battalion_id)
            | Q(case__assigned_team__team_ic__battalion_id=battalion_id)
            | Q(case__assigned_team__team_ic__detachment__battalion_id=battalion_id)
            | Q(case__assigned_team__members__battalion_id=battalion_id)
            | Q(case__assigned_team__members__detachment__battalion_id=battalion_id)
        )

    def _placement_detachment_id(self, placement):
        case = placement.case
        team = getattr(case, "assigned_team", None)
        requester_detachment_id = getattr(placement.requested_by, "detachment_id", None)
        if requester_detachment_id:
            return requester_detachment_id
        team_ic_detachment_id = getattr(getattr(team, "team_ic", None), "detachment_id", None)
        if team_ic_detachment_id:
            return team_ic_detachment_id
        member_detachment_id = None
        if team:
            member_detachment_id = (
                team.members.filter(detachment_id__isnull=False)
                .values_list("detachment_id", flat=True)
                .first()
            )
        return (
            case.tasked_detachment_id
            or getattr(team, "detachment_id", None)
            or getattr(case.assigned_to, "detachment_id", None)
            or member_detachment_id
            or getattr(placement.requested_by, "detachment_id", None)
        )

    def _placement_battalion_id(self, placement):
        case = placement.case
        team = getattr(case, "assigned_team", None)
        return (
            case.tasked_battalion_id
            or getattr(getattr(case, "tasked_detachment", None), "battalion_id", None)
            or getattr(team, "battalion_id", None)
            or getattr(getattr(team, "detachment", None), "battalion_id", None)
            or getattr(placement.requested_by, "battalion_id", None)
            or getattr(getattr(placement.requested_by, "detachment", None), "battalion_id", None)
            or getattr(case.assigned_to, "battalion_id", None)
            or getattr(getattr(case.assigned_to, "detachment", None), "battalion_id", None)
            or getattr(getattr(team, "team_ic", None), "battalion_id", None)
            or getattr(getattr(getattr(team, "team_ic", None), "detachment", None), "battalion_id", None)
        )

    def _ensure_can_review(self, user, placement):
        if user.is_superuser:
            return
        detachment_id = self._placement_detachment_id(placement)
        if user.role == User.Role.DETACHMENT and detachment_id and user.detachment_id == detachment_id:
            return
        if user.role == User.Role.ADJ:
            battalion_id = self._placement_battalion_id(placement)
            if user.battalion_id == battalion_id:
                return
        raise PermissionDenied("Only the IC COY or tasked battalion Adjutant can review this guardroom request.")

    def _ensure_can_review_book_out(self, user, placement):
        if user.is_superuser:
            return
        if user.role == User.Role.ADJ:
            battalion_id = self._placement_battalion_id(placement)
            if user.battalion_id == battalion_id:
                return
        raise PermissionDenied("Only the tasked battalion Adjutant can review this book-out request.")

    def _ensure_can_book_in(self, user, placement):
        if user.is_superuser:
            return
        if placement.requested_by_id == user.id:
            return
        case = placement.case
        if case.assigned_to_id == user.id:
            return
        team = getattr(case, "assigned_team", None)
        if team and (team.team_ic_id == user.id or team.members.filter(id=user.id).exists()):
            return
        if user.role == User.Role.INVESTIGATOR and user.battalion_id:
            if (
                case.tasked_battalion_id == user.battalion_id
                or getattr(case.tasked_detachment, "battalion_id", None) == user.battalion_id
                or getattr(placement.requested_by, "battalion_id", None) == user.battalion_id
                or getattr(team, "battalion_id", None) == user.battalion_id
                or getattr(getattr(team, "detachment", None), "battalion_id", None) == user.battalion_id
            ):
                return
        if user.role == User.Role.GUARDROOM_IC and placement.guardroom.ic_id == user.id:
            return
        raise PermissionDenied("Only the requester, team IO, team members, or guardroom IC can book in this offender.")

    def _ensure_can_book_out(self, user, placement):
        try:
            self._ensure_can_book_in(user, placement)
        except PermissionDenied:
            raise PermissionDenied("Only the requester, team IO, team members, or guardroom IC can manage book-out for this offender.")

    def _case_team_recipients(self, placement):
        recipients = set()
        for user in [placement.requested_by, placement.book_out_requested_by, placement.case.assigned_to]:
            if user and user.is_active:
                recipients.add(user)
        team = getattr(placement.case, "assigned_team", None)
        if team:
            if team.team_ic and team.team_ic.is_active:
                recipients.add(team.team_ic)
            for member in team.members.filter(is_active=True):
                recipients.add(member)
        return recipients

    def _adjutants_for_placement(self, placement):
        battalion_id = self._placement_battalion_id(placement)
        if not battalion_id:
            return []
        return list(User.objects.filter(role=User.Role.ADJ, battalion_id=battalion_id, is_active=True))

    def _detachment_ics_for_placement(self, placement):
        detachment_id = self._placement_detachment_id(placement)
        if not detachment_id:
            return []
        return list(User.objects.filter(role=User.Role.DETACHMENT, detachment_id=detachment_id, is_active=True))

    def _notify_placement_reviewers(self, placement):
        detachment_recipients = self._detachment_ics_for_placement(placement)
        recipients = detachment_recipients or self._adjutants_for_placement(placement)
        if not recipients:
            return
        reviewer_label = "IC COY" if detachment_recipients else "Adjutant"

        message = (
            f"Guardroom placement request for {placement.case.case_number} "
            f"({placement.get_reason_display()}) awaits {reviewer_label} review."
        )
        Notification.objects.bulk_create([
            Notification(
                recipient=user,
                message=message,
                notification_type=Notification.Type.CASE,
                related_model="guardroom_placement_request",
                related_id=placement.id,
            )
            for user in recipients
        ])
        self._send_email(
            recipients,
            subject=f"[MPIMS] Guardroom request {placement.case.case_number}",
            message=message,
        )

    def _notify_book_out_requested(self, placement):
        recipients = self._adjutants_for_placement(placement)
        if not recipients:
            return
        accused = placement.case.accused_name or "accused"
        message = (
            f"Book-out request for {placement.case.case_number} "
            f"({accused}) "
            f"awaits Adjutant approval."
        )
        Notification.objects.bulk_create([
            Notification(
                recipient=user,
                message=message,
                notification_type=Notification.Type.CASE,
                related_model="guardroom_placement_request",
                related_id=placement.id,
            )
            for user in recipients
        ])
        self._send_email(
            recipients,
            subject=f"[MPIMS] Book-out request {placement.case.case_number}",
            message=message,
        )

    def _notify_book_out_reviewed(self, placement):
        recipients = self._case_team_recipients(placement)
        if placement.book_out_reviewed_by:
            recipients.discard(placement.book_out_reviewed_by)
        if not recipients:
            return
        message = (
            f"Book-out request for {placement.case.case_number} was approved. "
            f"Attach the release letter to free the offender from {placement.guardroom.name}."
        )
        if placement.book_out_comments:
            message += f" Comments: {placement.book_out_comments}"
        Notification.objects.bulk_create([
            Notification(
                recipient=user,
                message=message,
                notification_type=Notification.Type.CASE,
                related_model="guardroom_placement_request",
                related_id=placement.id,
            )
            for user in recipients
        ])
        self._send_email(
            list(recipients),
            subject=f"[MPIMS] Book-out approved {placement.case.case_number}",
            message=message,
        )

    def _notify_released(self, placement):
        recipients = self._case_team_recipients(placement)
        recipients.update(self._adjutants_for_placement(placement))
        if placement.released_by:
            recipients.discard(placement.released_by)
        if not recipients:
            return
        message = (
            f"{placement.case.case_number} was released from {placement.guardroom.name} "
            f"after release letter attachment."
        )
        Notification.objects.bulk_create([
            Notification(
                recipient=user,
                message=message,
                notification_type=Notification.Type.CASE,
                related_model="guardroom_placement_request",
                related_id=placement.id,
            )
            for user in recipients
        ])
        self._send_email(
            list(recipients),
            subject=f"[MPIMS] Guardroom release {placement.case.case_number}",
            message=message,
        )

    def _notify_requester(self, placement):
        requester = placement.requested_by
        if not requester:
            return
        if placement.status == GuardroomPlacementRequest.Status.APPROVED:
            message = (
                f"Guardroom placement request for {placement.case.case_number} was approved"
                f" for {placement.guardroom.name}."
            )
            if placement.reviewer_comments:
                message += f" Comments: {placement.reviewer_comments}"
        else:
            message = (
                f"Guardroom placement request for {placement.case.case_number} was rejected. "
                f"Reason: {placement.rejection_reason}"
            )

        Notification.objects.create(
            recipient=requester,
            message=message,
            notification_type=Notification.Type.CASE,
            related_model="guardroom_placement_request",
            related_id=placement.id,
        )
        self._send_email(
            [requester],
            subject=f"[MPIMS] Guardroom request {placement.get_status_display()}",
            message=message,
        )

    def _send_email(self, users, subject, message):
        recipients = [user.email for user in users if getattr(user, "email", "")]
        if not recipients:
            return
        try:
            send_mail(
                subject=subject,
                message=message,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=recipients,
                fail_silently=True,
            )
        except Exception:
            pass
