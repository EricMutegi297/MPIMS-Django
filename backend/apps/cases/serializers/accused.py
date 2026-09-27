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

class CaseAccusedOffenceSerializer(serializers.ModelSerializer):
    offence_name = serializers.CharField(source="offence.name", read_only=True)

    class Meta:
        model = CaseAccusedOffence
        fields = ["id", "offence", "offence_name", "count_number", "particulars"]
        extra_kwargs = {
            "count_number": {"min_value": 1},
        }
class CaseAccusedSerializer(serializers.ModelSerializer):
    unit_name = serializers.SerializerMethodField()
    offences = CaseAccusedOffenceSerializer(many=True, required=False)

    class Meta:
        model = CaseAccused
        fields = ["id", "name", "rank", "service_number", "service", "unit", "unit_name", "offences"]
        extra_kwargs = {
            "unit": {"required": False, "allow_null": True},
        }

    def get_unit_name(self, obj):
        return obj.unit.name if obj.unit else None
