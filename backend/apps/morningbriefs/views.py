import re
from datetime import timedelta

from django.utils import timezone
from django.db.models import Max, Q
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from apps.formations.models import Unit
from apps.dutyrooms.models import DutyRoster, DutyRosterPost
from apps.incidents.models import Incident
from apps.incidents.serializers import is_incident_belated
from apps.notifications.models import Notification
from apps.users.models import User
from .models import MorningBrief
from .serializers import (
    CompileMorningBriefSerializer,
    MorningBriefSerializer,
    UpdateMorningBriefDraftSerializer,
    is_draft_status,
    morning_brief_publish_due_at,
)
from apps.users.access import command_read_only_message, has_global_read_access, should_block_command_write


COMMAND_WRITE_ALLOWED_ACTIONS = {"add_incidents", "compile_from_incidents", "publish", "submit"}
DUTY_OFFICER_POST_NAME = "duty officer"
DUTY_OFFICER_COMPILE_GRACE_HOURS = 24


def normalize_post_name(value):
    return re.sub(r"[^a-z0-9]+", " ", str(value or "").lower()).strip()


class MorningBriefViewSet(viewsets.ModelViewSet):
    queryset = MorningBrief.objects.all()
    serializer_class = MorningBriefSerializer
    filterset_fields = ["date", "unit", "status"]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if should_block_command_write(request.user, request.method) and getattr(self, "action", "") not in COMMAND_WRITE_ALLOWED_ACTIONS:
            raise PermissionDenied(command_read_only_message(request.user))

    def get_queryset(self):
        self._auto_publish_due_drafts()
        qs = MorningBrief.objects.select_related("unit", "battalion", "detachment", "submitted_by").prefetch_related(
            "incidents", "incidents__source_ob_entry", "incidents__source_ob_entry__book"
        ).all()
        user = self.request.user
        public_statuses = [MorningBrief.Status.PUBLISHED, MorningBrief.Status.SUBMITTED]
        draft_statuses = [MorningBrief.Status.DRAFT, MorningBrief.Status.PENDING, MorningBrief.Status.READY]
        public_q = Q(status__in=public_statuses)
        duty_post = self._current_duty_officer_post(user)
        if duty_post:
            draft_q = Q(status__in=draft_statuses) & self._brief_scope_for_duty_post(duty_post, user)
            return qs.filter(public_q | draft_q).distinct()
        if has_global_read_access(user):
            return qs.filter(public_q | Q(status__in=draft_statuses, submitted_by=user)).distinct()
        return qs.filter(public_q).distinct()

    def perform_update(self, serializer):
        brief = self.get_object()
        if not self._current_duty_officer_post(self.request.user):
            raise PermissionDenied("Only the assigned Duty Officer can edit a draft morning brief.")
        if not is_draft_status(brief.status):
            raise PermissionDenied("Published morning briefs cannot be edited.")
        serializer.save(status=MorningBrief.Status.DRAFT)

    def perform_destroy(self, instance):
        if not self._current_duty_officer_post(self.request.user):
            raise PermissionDenied("Only the assigned Duty Officer can delete a draft morning brief.")
        if not is_draft_status(instance.status):
            raise PermissionDenied("Published morning briefs cannot be deleted.")
        instance.delete()

    @action(detail=False, methods=["post"], url_path="compile-from-incidents")
    def compile_from_incidents(self, request):
        duty_post = self._current_duty_officer_post(request.user)
        if not duty_post:
            raise PermissionDenied(
                "Only personnel assigned as Duty Officer in published Part 1 Orders can compile incidents during duty or the morning-brief handover window."
            )
        serializer = CompileMorningBriefSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        scope = self._incident_scope(request.user)
        incidents = Incident.objects.filter(scope, id__in=data["incident_ids"]).select_related("morning_brief")
        if incidents.count() != len(set(data["incident_ids"])):
            raise ValidationError({"incident_ids": "One or more selected incidents are outside your scope."})
        already_compiled = [incident.incident_number for incident in incidents if incident.morning_brief_id]
        if already_compiled:
            raise ValidationError({"incident_ids": f"Already compiled: {', '.join(already_compiled)}"})

        unit = request.user.unit
        if not unit and request.user.battalion_id:
            unit = Unit.objects.filter(battalion_id=request.user.battalion_id).order_by("name").first()

        brief, _ = MorningBrief.objects.get_or_create(
            date=data["date"],
            unit=unit,
            battalion=duty_post.roster.battalion or request.user.battalion,
            detachment=duty_post.roster.detachment or request.user.detachment,
            defaults={
                "submitted_by": request.user,
                "status": MorningBrief.Status.DRAFT,
                "remarks": data.get("remarks", ""),
            },
        )
        if not is_draft_status(brief.status):
            raise ValidationError({"status": "This morning brief has already been published and cannot be updated."})
        self._assign_morning_brief_serial(brief)
        if data.get("remarks"):
            brief.remarks = data["remarks"]
        brief.submitted_by = request.user
        brief.status = MorningBrief.Status.DRAFT
        brief.save(update_fields=["remarks", "submitted_by", "status", "morning_brief_year", "morning_brief_sequence"])
        belated_ids = [
            incident.id
            for incident in incidents
            if is_incident_belated(incident, data["date"])
        ]
        if belated_ids:
            Incident.objects.filter(id__in=belated_ids, is_belated=False).update(is_belated=True)
        incidents.update(morning_brief=brief)
        return Response(MorningBriefSerializer(brief, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="add-incidents")
    def add_incidents(self, request, pk=None):
        brief = self.get_object()
        duty_post = self._current_duty_officer_post(request.user)
        if not duty_post:
            raise PermissionDenied(
                "Only personnel assigned as Duty Officer in published Part 1 Orders can update a draft morning brief."
            )
        if not is_draft_status(brief.status):
            raise ValidationError({"status": "This morning brief has already been published and cannot be updated."})

        serializer = UpdateMorningBriefDraftSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        scope = self._incident_scope(request.user)
        incidents = Incident.objects.filter(scope, id__in=data["incident_ids"]).select_related("morning_brief")
        if incidents.count() != len(set(data["incident_ids"])):
            raise ValidationError({"incident_ids": "One or more selected incidents are outside your scope."})

        already_compiled_elsewhere = [
            incident.incident_number
            for incident in incidents
            if incident.morning_brief_id and incident.morning_brief_id != brief.id
        ]
        if already_compiled_elsewhere:
            raise ValidationError({"incident_ids": f"Already compiled elsewhere: {', '.join(already_compiled_elsewhere)}"})

        new_incidents = incidents.exclude(morning_brief_id=brief.id)
        if not new_incidents.exists():
            raise ValidationError({"incident_ids": "Selected incidents are already on this draft morning brief."})

        self._assign_morning_brief_serial(brief)
        if data.get("remarks"):
            brief.remarks = data["remarks"]
        brief.submitted_by = request.user
        brief.status = MorningBrief.Status.DRAFT
        brief.save(update_fields=["remarks", "submitted_by", "status", "morning_brief_year", "morning_brief_sequence"])

        belated_ids = [
            incident.id
            for incident in new_incidents
            if is_incident_belated(incident, brief.date)
        ]
        if belated_ids:
            Incident.objects.filter(id__in=belated_ids, is_belated=False).update(is_belated=True)
        new_incidents.update(morning_brief=brief)
        return Response(MorningBriefSerializer(brief, context={"request": request}).data)

    @action(detail=False, methods=["get"], url_path="compiler-status")
    def compiler_status(self, request):
        post = self._current_duty_officer_post(request.user)
        return Response({
            "can_compile": bool(post),
            "post": self._post_summary(post) if post else None,
            "message": "" if post else (
                "Only personnel assigned as Duty Officer in published Part 1 Orders can compile incidents during duty or the morning-brief handover window."
            ),
        })

    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        return self.publish(request, pk=pk)

    @action(detail=True, methods=["post"], url_path="publish")
    def publish(self, request, pk=None):
        brief = self.get_object()
        if not self._current_duty_officer_post(request.user):
            raise PermissionDenied("Only the assigned Duty Officer can publish a morning brief.")
        if not is_draft_status(brief.status):
            raise ValidationError({"status": "This morning brief has already been published."})
        self._assign_morning_brief_serial(brief)
        brief.status = MorningBrief.Status.READY
        brief.submitted_by = request.user
        brief.submitted_at = None
        brief.save(update_fields=["status", "submitted_by", "submitted_at", "morning_brief_year", "morning_brief_sequence"])
        return Response(MorningBriefSerializer(brief).data)

    def _incident_scope(self, user):
        if self._current_duty_officer_post(user):
            return Q()
        scope = Q()
        if user.detachment_id:
            scope |= Q(unit__battalion_id=user.battalion_id) | Q(battalion_id=user.battalion_id)
        elif user.battalion_id:
            scope |= Q(unit__battalion_id=user.battalion_id) | Q(battalion_id=user.battalion_id)
        return scope or Q(reported_by=user)

    def _brief_scope_for_duty_post(self, duty_post, user):
        if duty_post.roster.detachment_id:
            return Q(detachment_id=duty_post.roster.detachment_id)
        if duty_post.roster.battalion_id:
            return Q(battalion_id=duty_post.roster.battalion_id)
        return Q(submitted_by=user)

    def _current_duty_officer_post(self, user):
        now = timezone.now()
        handover_cutoff = now - timedelta(hours=DUTY_OFFICER_COMPILE_GRACE_HOURS)
        posts = (
            DutyRosterPost.objects.select_related("roster", "roster__battalion", "roster__detachment")
            .filter(
                roster__status=DutyRoster.Status.PUBLISHED,
                assigned_personnel=user,
                starts_at__lte=now,
                ends_at__gt=handover_cutoff,
            )
            .order_by("-ends_at", "post_name")
        )
        for post in posts:
            if normalize_post_name(post.post_name) == DUTY_OFFICER_POST_NAME:
                return post
        return None

    def _post_summary(self, post):
        now = timezone.now()
        return {
            "id": post.id,
            "post_name": post.post_name,
            "roster": post.roster.title,
            "unit_label": post.roster.unit_label,
            "starts_at": post.starts_at,
            "ends_at": post.ends_at,
            "is_current": post.starts_at <= now < post.ends_at,
            "compile_window_ends_at": post.ends_at + timedelta(hours=DUTY_OFFICER_COMPILE_GRACE_HOURS),
        }

    def _auto_publish_due_drafts(self):
        now = timezone.now()
        drafts = MorningBrief.objects.filter(status=MorningBrief.Status.READY)
        for brief in drafts:
            due_at = morning_brief_publish_due_at(brief.date, brief.created_at)
            if due_at and due_at <= now:
                self._publish_brief(brief, automatic=True)

    def _assign_morning_brief_serial(self, brief):
        if brief.morning_brief_year and brief.morning_brief_sequence:
            return
        year = brief.date.year
        last_sequence = (
            MorningBrief.objects.filter(morning_brief_year=year)
            .exclude(id=brief.id)
            .aggregate(value=Max("morning_brief_sequence"))["value"]
            or 0
        )
        brief.morning_brief_year = year
        brief.morning_brief_sequence = last_sequence + 1

    def _publish_brief(self, brief, publisher=None, automatic=False):
        self._assign_morning_brief_serial(brief)
        brief.status = MorningBrief.Status.PUBLISHED
        brief.submitted_at = timezone.now()
        if publisher:
            brief.submitted_by = publisher
        brief.save(update_fields=["status", "submitted_at", "submitted_by", "morning_brief_year", "morning_brief_sequence"])
        self._notify_morning_brief_published(brief, automatic=automatic)

    def _notify_morning_brief_published(self, brief, automatic=False):
        recipients = User.objects.filter(is_active=True)
        if not recipients.exists():
            return
        mode = "automatically published" if automatic else "published"
        message = (
            f"Morning brief for {brief.date} has been {mode} and is available on your dashboard."
        )
        Notification.objects.bulk_create([
            Notification(
                recipient=user,
                message=message,
                notification_type=Notification.Type.MORNING_BRIEF,
                related_model="morning_brief",
                related_id=brief.id,
            )
            for user in recipients
        ])
