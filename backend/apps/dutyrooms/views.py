import re

from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.db.models import Count, Max, Q, Sum
from django.utils.dateparse import parse_date
from django.utils import timezone
from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from apps.formations.models import Unit
from apps.incidents.models import Incident
from apps.notifications.models import Notification
from apps.users.access import command_read_only_message, has_global_read_access, is_battalion_command, should_block_command_write
from apps.users.models import User
from .models import DutyRoster, DutyRosterPost, OccurrenceBook, OccurrenceEntry
from .serializers import (
    DutyRosterSerializer,
    OccurrenceBookSerializer,
    OccurrenceEntrySerializer,
    OccurrenceToIncidentSerializer,
    user_label,
)


DUTY_ROOM_POST_NAME = "duty room"
APPROVER_ROLES = {User.Role.DETACHMENT, User.Role.ADJ, User.Role.HOD, User.Role.TWO_IC, User.Role.OC}
MOBILE_USER_AGENT_RE = re.compile(r"Android.*Mobile|iPhone|iPod|IEMobile|Opera Mini|Mobi", re.IGNORECASE)
MOBILE_ALLOWED_ACTIONS = {"active_duty_room", "approvers"}
COMMAND_WRITE_ALLOWED_ACTIONS = {"approve", "return_for_correction", "decline"}


def is_mobile_part_one_orders_client(request):
    user_agent = request.META.get("HTTP_USER_AGENT", "")
    client_hint_mobile = request.META.get("HTTP_SEC_CH_UA_MOBILE", "").strip().lower()
    return client_hint_mobile == "?1" or bool(MOBILE_USER_AGENT_RE.search(user_agent))


class DutyRoomNotificationMixin:
    def _notify(self, users, message, subject, related_model="", related_id=None, notification_type=Notification.Type.SYSTEM):
        recipients = [user for user in users if user and user.is_active]
        if not recipients:
            return
        Notification.objects.bulk_create([
            Notification(
                recipient=user,
                message=message,
                notification_type=notification_type,
                related_model=related_model,
                related_id=related_id,
            )
            for user in recipients
        ])
        email_list = [user.email for user in recipients if user.email]
        if email_list:
            try:
                send_mail(
                    subject=subject,
                    message=message,
                    from_email=settings.DEFAULT_FROM_EMAIL,
                    recipient_list=email_list,
                    fail_silently=True,
                )
            except Exception:
                pass


class DutyRosterViewSet(DutyRoomNotificationMixin, viewsets.ModelViewSet):
    serializer_class = DutyRosterSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields = ["status", "battalion", "detachment", "start_date", "end_date"]
    search_fields = ["title", "posts__post_name"]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if should_block_command_write(request.user, request.method) and getattr(self, "action", "") not in COMMAND_WRITE_ALLOWED_ACTIONS:
            raise PermissionDenied(command_read_only_message(request.user))
        if is_mobile_part_one_orders_client(request) and getattr(self, "action", "") not in MOBILE_ALLOWED_ACTIONS:
            raise PermissionDenied(
                "Part 1 Orders cannot be accessed, downloaded, printed, or captured on mobile phones. "
                "Use an authorised desktop terminal."
            )

    def get_queryset(self):
        qs = DutyRoster.objects.select_related(
            "battalion",
            "detachment",
            "created_by",
            "forwarded_to",
            "approved_by",
            "published_by",
        ).prefetch_related("posts", "posts__assigned_personnel")
        user = self.request.user

        visibility = Q(status=DutyRoster.Status.PUBLISHED)
        if user.role == User.Role.ORDER_NCO:
            visibility |= Q(created_by=user)
        if user.role in APPROVER_ROLES:
            visibility |= Q(forwarded_to=user) | Q(approved_by=user)

        scope = Q()
        if has_global_read_access(user):
            scope = Q()
        else:
            if user.detachment_id:
                scope |= Q(detachment_id=user.detachment_id)
            if user.battalion_id:
                scope |= Q(battalion_id=user.battalion_id) | Q(detachment__battalion_id=user.battalion_id)
            if not scope:
                scope = Q(created_by=user) | Q(posts__assigned_personnel=user)
        return qs.filter(scope).filter(visibility).distinct()

    def perform_create(self, serializer):
        user = self.request.user
        if user.role != User.Role.ORDER_NCO:
            raise PermissionDenied("Only Order NCO can generate Part 1 Orders.")
        battalion = serializer.validated_data.get("battalion") or user.battalion
        detachment = serializer.validated_data.get("detachment") or user.detachment
        if detachment and not battalion:
            battalion = detachment.battalion
        if not battalion and not detachment:
            raise ValidationError({"battalion": "Order NCO must belong to a battalion or company."})
        serializer.save(created_by=user, battalion=battalion, detachment=detachment)

    def perform_update(self, serializer):
        roster = self.get_object()
        if self.request.user.role != User.Role.ORDER_NCO:
            raise PermissionDenied("Only Order NCO can edit Part 1 Orders.")
        if roster.status not in {DutyRoster.Status.DRAFT, DutyRoster.Status.RETURNED, DutyRoster.Status.DECLINED}:
            raise PermissionDenied("Only draft, returned, or declined Part 1 Orders can be edited.")
        serializer.save(
            status=DutyRoster.Status.DRAFT,
            forwarded_to=None,
            forwarded_at=None,
            approved_by=None,
            approved_at=None,
            approval_note="",
            returned_reason="",
            declined_reason="",
        )

    def perform_destroy(self, instance):
        if self.request.user.role != User.Role.ORDER_NCO:
            raise PermissionDenied("Only Order NCO can delete Part 1 Orders drafts.")
        if instance.created_by_id != self.request.user.id:
            raise PermissionDenied("Only the Order NCO who created these Part 1 Orders can delete them.")
        if instance.status != DutyRoster.Status.DRAFT or instance.forwarded_to_id or instance.forwarded_at:
            raise PermissionDenied("Only unforwarded draft Part 1 Orders can be deleted.")
        instance.delete()

    @action(detail=False, methods=["get"], url_path="approvers")
    def approvers(self, request):
        users = self._approver_queryset(request.user)
        return Response([
            {
                "id": user.id,
                "label": user_label(user),
                "role": user.role,
                "email": user.email,
            }
            for user in users
        ])

    @action(detail=False, methods=["get"], url_path="active-duty-room")
    def active_duty_room(self, request):
        post = self._current_duty_room_post(request.user)
        return Response({
            "can_record_ob": bool(post),
            "post": self._post_summary(post) if post else None,
            "message": "" if post else "Only personnel currently assigned to Duty Room duty can record OB entries.",
        })

    @action(detail=True, methods=["post"], url_path="forward")
    def forward(self, request, pk=None):
        roster = self.get_object()
        if request.user.role != User.Role.ORDER_NCO:
            raise PermissionDenied("Only Order NCO can forward Part 1 Orders.")
        if roster.status not in {DutyRoster.Status.DRAFT, DutyRoster.Status.RETURNED, DutyRoster.Status.DECLINED}:
            raise ValidationError({"status": "Only draft, returned, or declined Part 1 Orders can be forwarded."})
        self._validate_roster_complete(roster)

        approver_id = request.data.get("forwarded_to")
        if not approver_id:
            raise ValidationError({"forwarded_to": "Select IC COY, Adjutant, HOD, 2IC, or OC for approval."})
        try:
            approver = self._approver_queryset(request.user).get(id=approver_id)
        except User.DoesNotExist as exc:
            raise ValidationError({"forwarded_to": "Selected approver is not valid for these Part 1 Orders."}) from exc

        self._assign_part_one_order_serial(roster)
        roster.forwarded_to = approver
        roster.forwarded_at = timezone.now()
        roster.status = DutyRoster.Status.PENDING_APPROVAL
        roster.approved_by = None
        roster.approved_at = None
        roster.approval_note = ""
        roster.returned_reason = ""
        roster.declined_reason = ""
        roster.save(update_fields=[
            "forwarded_to",
            "forwarded_at",
            "status",
            "approved_by",
            "approved_at",
            "approval_note",
            "returned_reason",
            "declined_reason",
            "updated_at",
        ])
        message = f"Part 1 Orders '{roster.title}' for {roster.unit_label} have been forwarded to you for approval by {user_label(request.user)}."
        self._notify([approver], message, "[MPIMS] Part 1 Orders approval required", "duty_roster", roster.id)
        return Response(self.get_serializer(roster).data)

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        roster = self.get_object()
        self._require_roster_approver(request.user, roster)
        if roster.status != DutyRoster.Status.PENDING_APPROVAL:
            raise ValidationError({"status": "Only Part 1 Orders pending approval can be approved."})
        roster.status = DutyRoster.Status.APPROVED
        roster.approved_by = request.user
        roster.approved_at = timezone.now()
        roster.approval_note = request.data.get("note", "")
        roster.returned_reason = ""
        roster.declined_reason = ""
        roster.save(update_fields=["status", "approved_by", "approved_at", "approval_note", "returned_reason", "declined_reason", "updated_at"])
        message = f"Part 1 Orders '{roster.title}' for {roster.unit_label} have been approved by {user_label(request.user)}. You may now publish them."
        self._notify([roster.created_by], message, "[MPIMS] Part 1 Orders approved", "duty_roster", roster.id)
        return Response(self.get_serializer(roster).data)

    @action(detail=True, methods=["post"], url_path="return")
    def return_for_correction(self, request, pk=None):
        roster = self.get_object()
        self._require_roster_approver(request.user, roster)
        reason = (request.data.get("reason") or "").strip()
        if not reason:
            raise ValidationError({"reason": "Reason is required when returning Part 1 Orders."})
        roster.status = DutyRoster.Status.RETURNED
        roster.returned_reason = reason
        roster.save(update_fields=["status", "returned_reason", "updated_at"])
        message = f"Part 1 Orders '{roster.title}' for {roster.unit_label} were returned by {user_label(request.user)}. Reason: {reason}"
        self._notify([roster.created_by], message, "[MPIMS] Part 1 Orders returned", "duty_roster", roster.id)
        return Response(self.get_serializer(roster).data)

    @action(detail=True, methods=["post"], url_path="decline")
    def decline(self, request, pk=None):
        roster = self.get_object()
        self._require_roster_approver(request.user, roster)
        reason = (request.data.get("reason") or "").strip()
        if not reason:
            raise ValidationError({"reason": "Reason is required when declining Part 1 Orders."})
        roster.status = DutyRoster.Status.DECLINED
        roster.declined_reason = reason
        roster.save(update_fields=["status", "declined_reason", "updated_at"])
        message = f"Part 1 Orders '{roster.title}' for {roster.unit_label} were declined by {user_label(request.user)}. Reason: {reason}"
        self._notify([roster.created_by], message, "[MPIMS] Part 1 Orders declined", "duty_roster", roster.id)
        return Response(self.get_serializer(roster).data)

    @action(detail=True, methods=["post"], url_path="publish")
    def publish(self, request, pk=None):
        roster = self.get_object()
        if request.user.role != User.Role.ORDER_NCO:
            raise PermissionDenied("Only Order NCO can publish approved Part 1 Orders.")
        if roster.status != DutyRoster.Status.APPROVED:
            raise ValidationError({"status": "Part 1 Orders must be approved before publishing."})
        self._validate_roster_complete(roster)
        roster.status = DutyRoster.Status.PUBLISHED
        roster.published_by = request.user
        roster.published_at = timezone.now()
        roster.save(update_fields=["status", "published_by", "published_at", "updated_at"])

        assigned_users = set()
        for post in roster.posts.prefetch_related("assigned_personnel"):
            assigned_users.update(post.assigned_personnel.filter(is_active=True))
        for user in assigned_users:
            duties = [
                f"{post.post_name} from {timezone.localtime(post.starts_at).strftime('%d/%m/%Y %H:%M')} to {timezone.localtime(post.ends_at).strftime('%d/%m/%Y %H:%M')}"
                for post in roster.posts.all()
                if post.assigned_personnel.filter(id=user.id).exists()
            ]
            message = f"Part 1 Orders '{roster.title}' for {roster.unit_label} have been published. Your duty: {'; '.join(duties)}."
            self._notify([user], message, "[MPIMS] Part 1 Orders published", "duty_roster", roster.id)
        return Response(self.get_serializer(roster).data)

    def _approver_queryset(self, user):
        qs = User.objects.filter(role__in=APPROVER_ROLES, is_active=True).order_by("role", "name")
        if has_global_read_access(user):
            return qs
        if user.detachment_id:
            qs = qs.filter(Q(detachment_id=user.detachment_id) | Q(battalion_id=user.battalion_id))
        elif user.battalion_id:
            qs = qs.filter(battalion_id=user.battalion_id)
        else:
            qs = qs.none()
        return qs

    def _assign_part_one_order_serial(self, roster):
        if roster.part_one_order_year and roster.part_one_order_sequence:
            return
        with transaction.atomic():
            locked_roster = (
                DutyRoster.objects.select_for_update()
                .get(pk=roster.pk)
            )
            if locked_roster.part_one_order_year and locked_roster.part_one_order_sequence:
                roster.part_one_order_year = locked_roster.part_one_order_year
                roster.part_one_order_sequence = locked_roster.part_one_order_sequence
                return

            year = locked_roster.start_date.year
            battalion_id = locked_roster.battalion_id
            if not battalion_id and locked_roster.detachment_id:
                battalion_id = locked_roster.detachment.battalion_id
            serial_qs = DutyRoster.objects.select_for_update().filter(
                part_one_order_year=year,
                part_one_order_sequence__isnull=False,
            )
            if battalion_id:
                serial_qs = serial_qs.filter(Q(battalion_id=battalion_id) | Q(detachment__battalion_id=battalion_id))
            else:
                serial_qs = serial_qs.filter(battalion__isnull=True, detachment__isnull=True)

            locked_roster.part_one_order_year = year
            locked_roster.part_one_order_sequence = (serial_qs.aggregate(value=Max("part_one_order_sequence"))["value"] or 0) + 1
            locked_roster.save(update_fields=["part_one_order_year", "part_one_order_sequence"])
            roster.part_one_order_year = locked_roster.part_one_order_year
            roster.part_one_order_sequence = locked_roster.part_one_order_sequence

    def _validate_roster_complete(self, roster):
        posts = list(roster.posts.prefetch_related("assigned_personnel"))
        if not posts:
            raise ValidationError({"posts": "Add at least one duty post before forwarding."})
        shortfalls = [
            f"{post.post_name} requires {post.required_personnel}; assigned {post.assigned_count}"
            for post in posts
            if post.assigned_count < post.required_personnel
        ]
        if shortfalls:
            raise ValidationError({"posts": shortfalls})

    def _require_roster_approver(self, user, roster):
        if roster.forwarded_to_id == user.id:
            return
        raise PermissionDenied("These Part 1 Orders were not forwarded to you for approval.")

    def _same_scope(self, user, roster):
        if user.role == User.Role.DETACHMENT:
            return bool(roster.detachment_id and user.detachment_id == roster.detachment_id)
        if user.battalion_id:
            return user.battalion_id == roster.battalion_id or user.battalion_id == getattr(roster.detachment, "battalion_id", None)
        return False

    def _current_duty_room_post(self, user):
        now = timezone.now()
        return (
            DutyRosterPost.objects.select_related("roster", "roster__battalion", "roster__detachment")
            .filter(
                roster__status=DutyRoster.Status.PUBLISHED,
                post_name__iexact=DUTY_ROOM_POST_NAME,
                assigned_personnel=user,
                starts_at__lte=now,
                ends_at__gt=now,
            )
            .order_by("ends_at")
            .first()
        )

    def _post_summary(self, post):
        return {
            "id": post.id,
            "post_name": post.post_name,
            "roster": post.roster.title,
            "unit_label": post.roster.unit_label,
            "starts_at": post.starts_at,
            "ends_at": post.ends_at,
        }


class OccurrenceBookViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = OccurrenceBookSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields = ["date", "status", "battalion", "detachment"]

    def get_queryset(self):
        qs = OccurrenceBook.objects.select_related("battalion", "detachment", "opened_by", "closed_by")
        user = self.request.user
        if has_global_read_access(user):
            return qs
        scope = Q()
        if user.detachment_id:
            scope |= Q(detachment_id=user.detachment_id)
        if user.battalion_id:
            scope |= Q(battalion_id=user.battalion_id) | Q(detachment__battalion_id=user.battalion_id)
        if not scope:
            return qs.none()
        return qs.filter(scope).distinct()


class OccurrenceEntryViewSet(DutyRoomNotificationMixin, viewsets.ModelViewSet):
    serializer_class = OccurrenceEntrySerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields = ["entry_type", "road_traffic_type", "status", "requires_investigation", "book"]
    search_fields = ["linked_incident__incident_number"]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if should_block_command_write(request.user, request.method):
            raise PermissionDenied(command_read_only_message(request.user))

    @staticmethod
    def _parse_report_date(value, fallback, field_name):
        if not value:
            return fallback
        parsed = parse_date(str(value))
        if not parsed:
            raise ValidationError({field_name: "Use YYYY-MM-DD format."})
        return parsed

    @action(detail=False, methods=["get"], url_path="traffic-statistics")
    def traffic_statistics(self, request):
        today = timezone.localdate()
        period = request.query_params.get("period") or "range"
        qs = self.get_queryset().filter(
            entry_type=OccurrenceEntry.EntryType.ROAD_TRAFFIC_ACCIDENT
        )

        if period == "as_at":
            as_at = self._parse_report_date(request.query_params.get("as_at"), today, "as_at")
            qs = qs.filter(occurred_at__date__lte=as_at)
            period_payload = {"period": "as_at", "as_at": as_at.isoformat()}
        else:
            if period != "range":
                period = "range"
            month_start = today.replace(day=1)
            date_from = self._parse_report_date(request.query_params.get("date_from"), month_start, "date_from")
            date_to = self._parse_report_date(request.query_params.get("date_to"), today, "date_to")
            if date_from > date_to:
                raise ValidationError({"date_from": "Date from cannot be later than date to."})
            qs = qs.filter(occurred_at__date__gte=date_from, occurred_at__date__lte=date_to)
            period_payload = {
                "period": period,
                "date_from": date_from.isoformat(),
                "date_to": date_to.isoformat(),
            }

        grouped = {
            row["road_traffic_type"] or "not_recorded": row
            for row in qs.values("road_traffic_type").annotate(
                reported=Count("id"),
                yankee=Sum("injured_count"),
                xray=Sum("dead_count"),
            )
        }
        labels = dict(OccurrenceEntry.RoadTrafficType.choices)
        rows = []
        for key, label in OccurrenceEntry.RoadTrafficType.choices:
            row = grouped.pop(key, {})
            rows.append({
                "key": key,
                "label": label,
                "reported": row.get("reported") or 0,
                "yankee": row.get("yankee") or 0,
                "xray": row.get("xray") or 0,
            })
        for key, row in grouped.items():
            rows.append({
                "key": key,
                "label": labels.get(key, "Not recorded" if key == "not_recorded" else key.replace("_", " ").title()),
                "reported": row.get("reported") or 0,
                "yankee": row.get("yankee") or 0,
                "xray": row.get("xray") or 0,
            })

        totals = {
            "reported": sum(row["reported"] for row in rows),
            "yankee": sum(row["yankee"] for row in rows),
            "xray": sum(row["xray"] for row in rows),
        }
        return Response({
            **period_payload,
            "generated_at": timezone.now(),
            "legend": {"yankee": "injured", "xray": "dead"},
            "totals": totals,
            "rows": rows,
        })

    @action(detail=False, methods=["get"], url_path="unit-options")
    def unit_options(self, request):
        search = str(request.query_params.get("search") or "").strip()
        qs = Unit.objects.all().order_by("name")
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(code__icontains=search))
        return Response(list(qs.values("id", "name", "code")))

    def get_queryset(self):
        qs = OccurrenceEntry.objects.select_related(
            "book",
            "book__battalion",
            "book__detachment",
            "recorded_by",
            "linked_incident",
        )
        params = self.request.query_params
        date_from = self._parse_report_date(params.get("date_from"), None, "date_from")
        date_to = self._parse_report_date(params.get("date_to") or params.get("as_at"), None, "date_to")
        if date_from and date_to and date_from > date_to:
            raise ValidationError({"date_from": "Date from cannot be later than date to."})
        if date_from:
            qs = qs.filter(occurred_at__date__gte=date_from)
        if date_to:
            qs = qs.filter(occurred_at__date__lte=date_to)
        road_traffic_type = params.get("road_traffic_type")
        if road_traffic_type:
            qs = qs.filter(road_traffic_type=road_traffic_type)
        metric = params.get("metric")
        if metric == "yankee":
            qs = qs.filter(injured_count__gt=0)
        elif metric == "xray":
            qs = qs.filter(dead_count__gt=0)
        user = self.request.user
        if has_global_read_access(user):
            return qs
        scope = Q()
        if user.detachment_id:
            scope |= Q(book__detachment_id=user.detachment_id)
        if user.battalion_id:
            scope |= Q(book__battalion_id=user.battalion_id) | Q(book__detachment__battalion_id=user.battalion_id)
        if not scope:
            scope = Q(recorded_by=user)
        return qs.filter(scope).distinct()

    def perform_create(self, serializer):
        duty_post = self._current_duty_room_post(self.request.user)
        if not duty_post:
            raise PermissionDenied("Only personnel currently assigned to Duty Room duty can record OB entries.")
        today = timezone.localdate()
        with transaction.atomic():
            book, _ = OccurrenceBook.objects.get_or_create(
                date=today,
                battalion=duty_post.roster.battalion,
                detachment=duty_post.roster.detachment,
                defaults={"opened_by": self.request.user},
            )
            if book.status == OccurrenceBook.Status.CLOSED:
                raise ValidationError({"book": "The daily occurrence book is already closed."})
            next_serial = (book.entries.aggregate(value=Max("serial_no"))["value"] or 0) + 1
            originating_unit = duty_post.roster.unit_label
            if serializer.validated_data.get("entry_type") == OccurrenceEntry.EntryType.INCIDENT:
                originating_unit = self._user_originating_sub_unit_label(self.request.user) or originating_unit
            serializer.save(
                book=book,
                serial_no=next_serial,
                recorded_by=self.request.user,
                originating_unit=originating_unit,
            )

    @action(detail=True, methods=["post"], url_path="create-incident")
    def create_incident(self, request, pk=None):
        entry = self.get_object()
        if entry.linked_incident_id:
            raise ValidationError({"detail": "This OB entry has already been converted to an incident."})
        if not entry.requires_investigation:
            raise ValidationError({"requires_investigation": "Only OB entries marked as requiring investigation can be converted."})
        if not self._can_convert_to_incident(request.user, entry):
            raise PermissionDenied("Only Duty Officer, command users, or current Duty Room personnel can convert this OB entry to an incident.")

        serializer = OccurrenceToIncidentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        incident_type = (entry.incident_title or data.get("incident_type") or "").strip()
        if not incident_type and entry.entry_type == OccurrenceEntry.EntryType.ROAD_TRAFFIC_ACCIDENT:
            incident_type = entry.get_road_traffic_type_display()
        location = (entry.place or data.get("location") or "").strip()
        if not incident_type:
            raise ValidationError({"incident_title": "Incident is required before creating an incident record."})
        if not location:
            raise ValidationError({"place": "Place must be entered on the OB entry before creating an incident record."})
        casualty_summary = self._road_traffic_casualty_summary(entry)
        vehicle_summary = self._road_traffic_vehicle_summary(entry)
        driver_summary = self._road_traffic_driver_summary(entry)
        injuries = entry.injuries or casualty_summary
        description = entry.description or self._road_traffic_description(entry)

        incident = Incident.objects.create(
            incident_type=incident_type,
            description=description,
            location=location,
            service_vehicle=entry.service_vehicle or vehicle_summary,
            unit_involved=entry.unit_involved,
            originating_unit=entry.originating_unit,
            civilian=entry.civilian,
            service_member=entry.service_member or driver_summary,
            history=entry.history,
            injuries=injuries,
            damages=entry.damages,
            how_occurred=entry.how_occurred,
            action_taken=entry.action_taken,
            police_ob_reference=entry.police_ob_reference,
            date_occurred=entry.occurred_at,
            severity=data.get("severity") or Incident.Severity.MEDIUM,
            status=Incident.Status.REPORTED,
            reported_by=request.user,
            unit=getattr(request.user, "unit", None),
            battalion=entry.book.battalion,
        )
        entry.linked_incident = incident
        entry.status = OccurrenceEntry.Status.CONVERTED_TO_INCIDENT
        entry.save(update_fields=["linked_incident", "status", "updated_at"])
        return Response(self.get_serializer(entry).data)

    def _road_traffic_casualty_summary(self, entry):
        if entry.entry_type != OccurrenceEntry.EntryType.ROAD_TRAFFIC_ACCIDENT:
            return ""
        lines = [
            f"Personnel injured: {entry.injured_count or 'Nil'}. Personnel dead: {entry.dead_count or 'Nil'}."
        ]
        casualties = entry.rta_casualties or []
        if casualties:
            detail_lines = []
            for index, casualty in enumerate(casualties, start=1):
                status = "Dead" if casualty.get("casualty_status") == "dead" else "Injured"
                person = self._rta_person_label(casualty, "ID No" if casualty.get("person_type") == "civilian" else "Svc No")
                severity = ""
                if status == "Injured" and casualty.get("injury_severity"):
                    severity = f"; Severity: {dict(OccurrenceEntry.InjurySeverity.choices).get(casualty.get('injury_severity'), casualty.get('injury_severity'))}"
                detail_lines.append(f"{index}. {status}: {person or 'Details not specified'}{severity}")
            lines.append("Onboard personnel / casualties:\n" + "\n".join(detail_lines))
        return "\n".join(lines)

    def _road_traffic_vehicle_summary(self, entry):
        if entry.entry_type != OccurrenceEntry.EntryType.ROAD_TRAFFIC_ACCIDENT:
            return ""
        lines = []
        for index, vehicle in enumerate(entry.rta_vehicles or [], start=1):
            type_label = "Civilian vehicle" if vehicle.get("vehicle_type") == "civilian" else "Service vehicle"
            details = vehicle.get("vehicle_details") or "Not specified"
            lines.append(f"{index}. {type_label}: {details}")
        return "\n".join(lines)

    def _road_traffic_driver_summary(self, entry):
        if entry.entry_type != OccurrenceEntry.EntryType.ROAD_TRAFFIC_ACCIDENT:
            return ""
        lines = []
        for index, vehicle in enumerate(entry.rta_vehicles or [], start=1):
            driver = self._rta_person_label({
                "identifier": vehicle.get("driver_identifier"),
                "rank": vehicle.get("driver_rank"),
                "name": vehicle.get("driver_name"),
                "unit": vehicle.get("driver_unit"),
                "is_unknown": vehicle.get("driver_unknown"),
            }, "ID No" if vehicle.get("driver_person_type") == "civilian" else "Svc No")
            if driver:
                lines.append(f"{index}. Driver: {driver}")
        return "\n".join(lines)

    def _road_traffic_description(self, entry):
        if entry.entry_type != OccurrenceEntry.EntryType.ROAD_TRAFFIC_ACCIDENT:
            return entry.description
        sections = [
            f"{entry.get_road_traffic_type_display() or 'Road Traffic Accident'} recorded at {entry.place or 'place not specified'}.",
            self._road_traffic_casualty_summary(entry),
            self._road_traffic_vehicle_summary(entry),
        ]
        return "\n".join(section for section in sections if section)

    def _rta_person_label(self, person, identifier_label):
        if person.get("is_unknown"):
            return "Unknown civilian"
        parts = []
        if person.get("identifier"):
            parts.append(f"{identifier_label}: {person.get('identifier')}")
        for field in ["rank", "name"]:
            if person.get(field):
                parts.append(str(person.get(field)))
        if person.get("unit"):
            parts.append(f"Unit: {person.get('unit')}")
        return " ".join(parts)

    def _current_duty_room_post(self, user):
        now = timezone.now()
        return (
            DutyRosterPost.objects.select_related("roster", "roster__battalion", "roster__detachment")
            .filter(
                roster__status=DutyRoster.Status.PUBLISHED,
                post_name__iexact=DUTY_ROOM_POST_NAME,
                assigned_personnel=user,
                starts_at__lte=now,
                ends_at__gt=now,
            )
            .order_by("ends_at")
            .first()
        )

    def _user_originating_sub_unit_label(self, user):
        if getattr(user, "detachment_id", None):
            return user.detachment.name
        if getattr(user, "battalion_id", None):
            return user.battalion.name
        return ""

    def _can_convert_to_incident(self, user, entry):
        if user.role == User.Role.DUTY_OFFICER:
            return True
        if is_battalion_command(user):
            return True
        if self._current_duty_room_post(user):
            return True
        if user.role == User.Role.DETACHMENT and user.detachment_id == entry.book.detachment_id:
            return True
        return False
