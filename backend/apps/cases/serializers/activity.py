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
from ..uploads import CaseDocumentFileField

class CaseActivityLogSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()
    actor_rank = serializers.SerializerMethodField()
    actor_service_number = serializers.SerializerMethodField()
    actor_display_name = serializers.SerializerMethodField()
    reference_pdf_url = CaseDocumentFileField(source="reference_pdf", read_only=True)
    reference_pdf_name = serializers.SerializerMethodField()

    class Meta:
        model = CaseActivityLog
        fields = [
            "id",
            "action",
            "detail",
            "actor",
            "actor_name",
            "actor_rank",
            "actor_service_number",
            "actor_display_name",
            "reference_pdf_url",
            "reference_pdf_name",
            "created_at",
        ]
        read_only_fields = fields

    def get_actor_name(self, obj):
        if not obj.actor:
            return "System"
        rank = getattr(obj.actor, "rank", "") or ""
        name = str(obj.actor)
        return f"{rank} {name}".strip() if rank else name

    def get_actor_rank(self, obj):
        if not obj.actor:
            return ""
        return getattr(obj.actor, "rank", "") or ""

    def get_actor_service_number(self, obj):
        if not obj.actor:
            return ""
        return getattr(obj.actor, "service_number", "") or ""

    def get_actor_display_name(self, obj):
        if not obj.actor:
            return "System"
        return getattr(obj.actor, "name", "") or str(obj.actor)

    def get_reference_pdf_name(self, obj):
        if not obj.reference_pdf:
            return None
        return obj.reference_pdf.name.split("/")[-1]
