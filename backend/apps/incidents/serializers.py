from rest_framework import serializers
from django.utils import timezone
from .models import Incident


def incident_local_date(value):
    if not value:
        return None
    if timezone.is_aware(value):
        return timezone.localtime(value).date()
    return value.date()


def is_incident_belated(obj, brief_date=None):
    if obj.is_belated:
        return True
    occurred_on = incident_local_date(obj.date_occurred)
    if not occurred_on:
        return False
    if brief_date:
        return brief_date > occurred_on
    brief = getattr(obj, "morning_brief", None)
    if brief and brief.date:
        return brief.date > occurred_on
    return occurred_on < timezone.localdate()


class IncidentSerializer(serializers.ModelSerializer):
    is_belated = serializers.SerializerMethodField()
    reported_by_name = serializers.SerializerMethodField()
    source_ob_entry_id = serializers.SerializerMethodField()
    source_ob_number = serializers.SerializerMethodField()
    requires_investigation = serializers.SerializerMethodField()
    converted_case_number = serializers.SerializerMethodField()

    class Meta:
        model = Incident
        fields = "__all__"
        read_only_fields = ["incident_number", "created_at", "updated_at"]

    def get_reported_by_name(self, obj):
        return str(obj.reported_by) if obj.reported_by else None

    def get_source_ob_entry_id(self, obj):
        source = getattr(obj, "source_ob_entry", None)
        return source.id if source else None

    def get_source_ob_number(self, obj):
        source = getattr(obj, "source_ob_entry", None)
        if not source or not source.book:
            return None
        return f"{source.book.date}/{source.serial_no}"

    def get_requires_investigation(self, obj):
        source = getattr(obj, "source_ob_entry", None)
        return bool(source and source.requires_investigation)

    def get_is_belated(self, obj):
        return is_incident_belated(obj)

    def get_converted_case_number(self, obj):
        return obj.converted_case.case_number if obj.converted_case else None
