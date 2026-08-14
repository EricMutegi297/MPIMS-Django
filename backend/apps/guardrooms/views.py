from django.utils import timezone
from django.core.mail import send_mail
from django.conf import settings as django_settings
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from .models import Guardroom, GuardPost, DetaineeRequest
from .serializers import GuardroomSerializer, GuardPostSerializer, DetaineeRequestSerializer
from apps.notifications.models import Notification


def _notify(recipient, message, notification_type=Notification.Type.SYSTEM, related_id=None, related_model=""):
    """Create an in-app notification."""
    if not recipient:
        return
    Notification.objects.create(
        recipient=recipient,
        message=message,
        notification_type=notification_type,
        related_model=related_model or "detainee_request",
        related_id=related_id,
    )


def _email(to_user, subject, body):
    """Send email if user has a valid email address."""
    if not to_user or not to_user.email:
        return
    try:
        send_mail(
            subject,
            body,
            django_settings.DEFAULT_FROM_EMAIL,
            [to_user.email],
            fail_silently=True,
        )
    except Exception:
        pass


MANAGE_ROLES = {"admin", "mpc_hqs", "co", "detachment"}


def _is_hqs_admin(user):
    battalion = getattr(user, "battalion", None)
    return (
        not getattr(user, "is_superuser", False)
        and getattr(user, "role", None) == "admin"
        and getattr(battalion, "battalion_type", None) == "hqs"
    )


def _can_manage_guardrooms(user):
    return user.is_superuser or (
        hasattr(user, "role")
        and user.role in MANAGE_ROLES
        and not _is_hqs_admin(user)
    )


class GuardroomViewSet(viewsets.ModelViewSet):
    queryset = Guardroom.objects.select_related("unit", "ic").prefetch_related("posts").all()
    serializer_class = GuardroomSerializer
    filterset_fields = ["unit", "is_active", "ic"]

    def create(self, request, *args, **kwargs):
        if not _can_manage_guardrooms(request.user):
            return Response(
                {"detail": "You do not have permission to create guardrooms."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        if not _can_manage_guardrooms(request.user):
            return Response(
                {"detail": "You do not have permission to edit guardrooms."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        if not _can_manage_guardrooms(request.user):
            return Response(
                {"detail": "You do not have permission to edit guardrooms."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if not _can_manage_guardrooms(request.user):
            return Response(
                {"detail": "You do not have permission to delete guardrooms."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)


class GuardPostViewSet(viewsets.ModelViewSet):
    queryset = GuardPost.objects.select_related("guardroom").prefetch_related("assigned_personnel").all()
    serializer_class = GuardPostSerializer
    filterset_fields = ["guardroom"]

    def create(self, request, *args, **kwargs):
        if not _can_manage_guardrooms(request.user):
            return Response(
                {"detail": "You do not have permission to create guard posts."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        if not _can_manage_guardrooms(request.user):
            return Response(
                {"detail": "You do not have permission to edit guard posts."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        if not _can_manage_guardrooms(request.user):
            return Response(
                {"detail": "You do not have permission to edit guard posts."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if not _can_manage_guardrooms(request.user):
            return Response(
                {"detail": "You do not have permission to delete guard posts."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)


class DetaineeRequestViewSet(viewsets.ModelViewSet):
    serializer_class = DetaineeRequestSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = DetaineeRequest.objects.select_related(
            "case", "guardroom", "requested_by", "reviewed_by"
        )
        # Guardroom IC sees requests for their guardroom(s)
        if user.role == "guardroom_ic":
            managed = Guardroom.objects.filter(ic=user).values_list("id", flat=True)
            return qs.filter(guardroom__id__in=managed)
        if _is_hqs_admin(user):
            return qs.none()
        # Superuser / admin see all
        if user.is_superuser or user.role in ("admin", "mpc_hqs"):
            return qs.all()
        # Investigators see their own requests
        return qs.filter(requested_by=user)

    def create(self, request, *args, **kwargs):
        if _is_hqs_admin(request.user):
            return Response(
                {"detail": "HQ admins do not have permission to create detainee requests."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        case = serializer.validated_data.get("case")
        if not case:
            return

        # Block disallowed statuses / types
        forbidden_statuses = {"served", "closed"}
        if case.status in forbidden_statuses:
            from rest_framework.exceptions import ValidationError
            raise ValidationError(
                {"detail": f"Guardroom cannot be requested for a {case.status} case."}
            )
        if case.criminal_offence_type == "dci_civ_police":
            from rest_framework.exceptions import ValidationError
            raise ValidationError(
                {"detail": "Guardroom cannot be requested for DCI/Civ Police cases."}
            )

        req = serializer.save(requested_by=self.request.user, status="pending")

        # Notify Guardroom IC
        guardroom = req.guardroom
        if guardroom.ic:
            msg = (
                f"New guardroom placement request for Case {case.case_number} "
                f"({case.accused_rank} {case.accused_name}). "
                f"Requested by {self.request.user.rank} {self.request.user.name}."
            )
            _notify(
                guardroom.ic, msg,
                notification_type=Notification.Type.CASE,
                related_id=req.id,
                related_model="detainee_request",
            )

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        req = self.get_object()
        user = request.user
        if user.role != "guardroom_ic" and not user.is_superuser:
            return Response({"detail": "Only Guardroom IC can approve requests."}, status=403)
        if req.status != "pending":
            return Response({"detail": "Only pending requests can be approved."}, status=400)

        req.status = "approved"
        req.reviewed_by = user
        req.reviewed_at = timezone.now()
        req.save(update_fields=["status", "reviewed_by", "reviewed_at"])

        # Notify investigator
        case = req.case
        msg = (
            f"Your guardroom placement request for Case {case.case_number} "
            f"({case.accused_rank} {case.accused_name}) has been APPROVED by "
            f"{req.guardroom.name}. Please present the accused physically."
        )
        _notify(req.requested_by, msg, notification_type=Notification.Type.CASE,
                related_id=req.id, related_model="detainee_request")
        _email(
            req.requested_by,
            f"[MPIMS] Guardroom Request Approved – {case.case_number}",
            msg,
        )
        return Response(DetaineeRequestSerializer(req).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        req = self.get_object()
        user = request.user
        if user.role != "guardroom_ic" and not user.is_superuser:
            return Response({"detail": "Only Guardroom IC can reject requests."}, status=403)
        if req.status != "pending":
            return Response({"detail": "Only pending requests can be rejected."}, status=400)

        reason = request.data.get("rejection_reason", "").strip()
        if not reason:
            return Response({"detail": "A rejection reason is required."}, status=400)

        req.status = "rejected"
        req.rejection_reason = reason
        req.reviewed_by = user
        req.reviewed_at = timezone.now()
        req.save(update_fields=["status", "rejection_reason", "reviewed_by", "reviewed_at"])

        case = req.case
        msg = (
            f"Your guardroom placement request for Case {case.case_number} "
            f"({case.accused_rank} {case.accused_name}) has been REJECTED by "
            f"{req.guardroom.name}. Reason: {reason}"
        )
        _notify(req.requested_by, msg, notification_type=Notification.Type.CASE,
                related_id=req.id, related_model="detainee_request")
        _email(
            req.requested_by,
            f"[MPIMS] Guardroom Request Rejected – {case.case_number}",
            msg,
        )
        return Response(DetaineeRequestSerializer(req).data)

    @action(detail=True, methods=["post"])
    def book_in(self, request, pk=None):
        req = self.get_object()
        user = request.user
        if user.role != "guardroom_ic" and not user.is_superuser:
            return Response({"detail": "Only Guardroom IC can book in detainees."}, status=403)
        if req.status != "approved":
            return Response({"detail": "Request must be approved before booking in."}, status=400)

        # Validate required book-in fields matching MPC 6009
        required = [
            "gc_date", "gc_time", "gc_location",
            "book_in_signed_name", "book_in_signed_unit",
            "book_in_signed_no", "book_in_signed_rank", "book_in_date",
        ]
        errors = {}
        for field in required:
            if not request.data.get(field, ""):
                errors[field] = ["This field is required."]
        if errors:
            return Response(errors, status=400)

        # Update guard commander receipt fields (IC confirms/fills)
        req.guard_commander_date = request.data["gc_date"]
        req.guard_commander_time = request.data["gc_time"]
        req.location = request.data["gc_location"]
        req.handed_by_name = request.data.get("handed_by_name", req.handed_by_name)
        req.handed_by_rank = request.data.get("handed_by_rank", req.handed_by_rank)
        # IC signature block
        req.book_in_signed_name = request.data["book_in_signed_name"]
        req.book_in_signed_unit = request.data["book_in_signed_unit"]
        req.book_in_signed_no = request.data["book_in_signed_no"]
        req.book_in_signed_rank = request.data["book_in_signed_rank"]
        req.book_in_date = request.data["book_in_date"]
        req.status = "booked_in"
        req.booked_in_at = timezone.now()
        req.save()

        # Increase detainee count on guardroom
        guardroom = req.guardroom
        guardroom.detainee_count = guardroom.detainee_count + 1
        guardroom.save(update_fields=["detainee_count"])

        # Notify investigator
        case = req.case
        msg = (
            f"Accused {case.accused_rank} {case.accused_name} (Case {case.case_number}) "
            f"has been successfully BOOKED IN to {guardroom.name}."
        )
        _notify(req.requested_by, msg, notification_type=Notification.Type.CASE,
                related_id=req.id, related_model="detainee_request")

        return Response({"detail": "Book-in successful.", "detainee_count": guardroom.detainee_count,
                         "vacant_slots": guardroom.vacant_slots,
                         "request": DetaineeRequestSerializer(req).data})

    @action(detail=True, methods=["post"])
    def book_out(self, request, pk=None):
        req = self.get_object()
        user = request.user
        if user.role != "guardroom_ic" and not user.is_superuser:
            return Response({"detail": "Only Guardroom IC can book out detainees."}, status=403)
        if req.status != "booked_in":
            return Response({"detail": "Detainee must be booked in first."}, status=400)

        reason = request.data.get("book_out_reason", "").strip()
        req.status = "booked_out"
        req.book_out_reason = reason
        req.booked_out_at = timezone.now()
        req.save(update_fields=["status", "book_out_reason", "booked_out_at"])

        # Reduce detainee count
        guardroom = req.guardroom
        if guardroom.detainee_count > 0:
            guardroom.detainee_count -= 1
            guardroom.save(update_fields=["detainee_count"])

        return Response({"detail": "Book-out successful.", "detainee_count": guardroom.detainee_count,
                         "vacant_slots": guardroom.vacant_slots,
                         "request": DetaineeRequestSerializer(req).data})
