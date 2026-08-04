from datetime import datetime, time, timedelta

from django.utils import timezone
from rest_framework import serializers
from apps.incidents.serializers import is_incident_belated
from .models import MorningBrief


MORNING_BRIEF_PUBLISH_TIME = time(8, 0)
MORNING_BRIEF_COUNTDOWN_SECONDS = 30 * 60


def next_publish_slot_after(value):
    local_value = timezone.localtime(value)
    due_date = local_value.date()
    if local_value.time() >= MORNING_BRIEF_PUBLISH_TIME:
        due_date = due_date + timedelta(days=1)
    while due_date.weekday() in {5, 6}:
        due_date = due_date + timedelta(days=1)
    due = datetime.combine(due_date, MORNING_BRIEF_PUBLISH_TIME)
    return timezone.make_aware(due, timezone.get_current_timezone())


def morning_brief_publish_due_at(report_date, created_at=None):
    if not report_date:
        return None
    due_date = report_date
    if due_date.weekday() == 5:
        due_date = due_date + timedelta(days=2)
    elif due_date.weekday() == 6:
        due_date = due_date + timedelta(days=1)
    due = datetime.combine(due_date, MORNING_BRIEF_PUBLISH_TIME)
    due_at = timezone.make_aware(due, timezone.get_current_timezone())
    if created_at and due_at < created_at:
        return next_publish_slot_after(created_at)
    return due_at


def is_draft_status(status):
    return status in {MorningBrief.Status.DRAFT, MorningBrief.Status.PENDING, MorningBrief.Status.READY}


class MorningBriefIncidentSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    incident_number = serializers.CharField()
    incident_type = serializers.CharField()
    description = serializers.CharField()
    location = serializers.CharField()
    place = serializers.SerializerMethodField()
    service_vehicle = serializers.SerializerMethodField()
    unit_involved = serializers.SerializerMethodField()
    originating_unit = serializers.SerializerMethodField()
    civilian = serializers.SerializerMethodField()
    service_member = serializers.SerializerMethodField()
    history = serializers.SerializerMethodField()
    injuries = serializers.SerializerMethodField()
    damages = serializers.SerializerMethodField()
    how_occurred = serializers.SerializerMethodField()
    action_taken = serializers.SerializerMethodField()
    police_ob_reference = serializers.SerializerMethodField()
    severity = serializers.CharField()
    status = serializers.CharField()
    date_occurred = serializers.DateTimeField()
    is_belated = serializers.SerializerMethodField()
    source_ob_number = serializers.SerializerMethodField()
    converted_case = serializers.SerializerMethodField()
    converted_case_number = serializers.SerializerMethodField()

    def get_is_belated(self, obj):
        brief = getattr(obj, "morning_brief", None)
        return is_incident_belated(obj, getattr(brief, "date", None))

    def _source_value(self, obj, incident_attr, source_attr=None, fallback=""):
        value = getattr(obj, incident_attr, "")
        if value:
            return value
        source = getattr(obj, "source_ob_entry", None)
        if source:
            return getattr(source, source_attr or incident_attr, "") or fallback
        return fallback

    def get_place(self, obj):
        return self._source_value(obj, "location", "place")

    def get_service_vehicle(self, obj):
        return self._source_value(obj, "service_vehicle")

    def get_unit_involved(self, obj):
        return self._source_value(obj, "unit_involved")

    def get_originating_unit(self, obj):
        value = self._source_value(obj, "originating_unit")
        if value:
            return value
        source = getattr(obj, "source_ob_entry", None)
        if source and source.book:
            if source.book.detachment:
                return source.book.detachment.name
            if source.book.battalion:
                return source.book.battalion.name
        return ""

    def get_civilian(self, obj):
        return self._source_value(obj, "civilian")

    def get_service_member(self, obj):
        return self._source_value(obj, "service_member")

    def get_history(self, obj):
        return self._source_value(obj, "history", fallback=obj.description or "")

    def get_injuries(self, obj):
        return self._source_value(obj, "injuries")

    def get_damages(self, obj):
        return self._source_value(obj, "damages")

    def get_how_occurred(self, obj):
        return self._source_value(obj, "how_occurred")

    def get_action_taken(self, obj):
        return self._source_value(obj, "action_taken")

    def get_police_ob_reference(self, obj):
        return self._source_value(obj, "police_ob_reference")

    def get_source_ob_number(self, obj):
        source = getattr(obj, "source_ob_entry", None)
        if not source or not source.book:
            return None
        return f"{source.book.date}/{source.serial_no}"

    def get_converted_case_number(self, obj):
        return obj.converted_case.case_number if obj.converted_case else None

    def get_converted_case(self, obj):
        return obj.converted_case_id


class MorningBriefSerializer(serializers.ModelSerializer):
    morning_brief_serial = serializers.SerializerMethodField()
    unit_name = serializers.SerializerMethodField()
    battalion_name = serializers.SerializerMethodField()
    detachment_name = serializers.SerializerMethodField()
    submitted_by_name = serializers.SerializerMethodField()
    incidents = MorningBriefIncidentSerializer(many=True, read_only=True)
    incident_count = serializers.SerializerMethodField()
    publish_due_at = serializers.SerializerMethodField()
    seconds_to_publish = serializers.SerializerMethodField()
    publish_countdown_active = serializers.SerializerMethodField()

    class Meta:
        model = MorningBrief
        fields = "__all__"
        read_only_fields = ["created_at"]

    def get_unit_name(self, obj):
        return obj.unit.name if obj.unit else None

    def get_morning_brief_serial(self, obj):
        if not obj.morning_brief_year or not obj.morning_brief_sequence:
            return None
        return f"MPC/{obj.morning_brief_sequence:03d}/{obj.morning_brief_year % 100:02d}"

    def get_battalion_name(self, obj):
        return obj.battalion.name if obj.battalion else None

    def get_detachment_name(self, obj):
        return obj.detachment.name if obj.detachment else None

    def get_submitted_by_name(self, obj):
        return str(obj.submitted_by) if obj.submitted_by else None

    def get_incident_count(self, obj):
        return obj.incidents.count()

    def get_publish_due_at(self, obj):
        return morning_brief_publish_due_at(obj.date, obj.created_at)

    def get_seconds_to_publish(self, obj):
        if not is_draft_status(obj.status):
            return None
        due_at = morning_brief_publish_due_at(obj.date, obj.created_at)
        if not due_at:
            return None
        return int((due_at - timezone.now()).total_seconds())

    def get_publish_countdown_active(self, obj):
        seconds = self.get_seconds_to_publish(obj)
        return seconds is not None and 0 < seconds <= MORNING_BRIEF_COUNTDOWN_SECONDS


class CompileMorningBriefSerializer(serializers.Serializer):
    date = serializers.DateField()
    incident_ids = serializers.ListField(child=serializers.IntegerField(), allow_empty=False)
    remarks = serializers.CharField(required=False, allow_blank=True)


class UpdateMorningBriefDraftSerializer(serializers.Serializer):
    incident_ids = serializers.ListField(child=serializers.IntegerField(), allow_empty=False)
    remarks = serializers.CharField(required=False, allow_blank=True)
