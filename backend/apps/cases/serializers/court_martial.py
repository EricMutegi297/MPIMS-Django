import json
import re
from collections.abc import Mapping
from django.utils import timezone
from rest_framework import serializers
from django.db.models import Q
from ..models import (
    Case,
    CaseActivityLog,
    CaseAccused,
    CaseAccusedOffence,
    CaseAttachment,
    CaseBackBrief,
    CaseBrief,
    CaseBriefForward,
    CaseCourtMartialHearing,
    CaseCourtMartialMilestone,
    ExhibitStorageRequest,
    InvestigationTeam,
)
from apps.formations.models import Battalion, Unit
from apps.users.access import is_hqs_admin, is_battalion_admin, is_detachment_ic
from apps.users.models import User

from .constants import CASE_FILE_FIELDS, CLOSED_CASE_FILE_ERROR

class CaseCourtMartialHearingSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = CaseCourtMartialHearing
        fields = [
            "id", "case", "hearing_date", "remarks", "created_by", "created_by_name", "created_at", "updated_at",
        ]
        read_only_fields = ["case", "created_by", "created_by_name", "created_at", "updated_at"]
class CaseCourtMartialMilestoneSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()
    action_recorded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = CaseCourtMartialMilestone
        fields = [
            "id",
            "case",
            "milestone_type",
            "scheduled_date",
            "planning_comment",
            "action_remarks",
            "action_recorded_by",
            "action_recorded_by_name",
            "action_recorded_at",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "case",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
            "action_recorded_by",
            "action_recorded_by_name",
            "action_recorded_at",
        ]

    def get_created_by_name(self, obj):
        return str(obj.created_by) if obj.created_by else None

    def get_action_recorded_by_name(self, obj):
        return str(obj.action_recorded_by) if obj.action_recorded_by else None
