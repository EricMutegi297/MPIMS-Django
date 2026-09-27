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

class CaseBackBriefSerializer(serializers.ModelSerializer):
    file = CaseDocumentFileField()
    uploaded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = CaseBackBrief
        fields = [
            "id",
            "brief",
            "file",
            "note",
            "uploaded_by",
            "uploaded_by_name",
            "uploaded_at",
            "updated_at",
        ]
        read_only_fields = [
            "brief",
            "uploaded_by",
            "uploaded_by_name",
            "uploaded_at",
            "updated_at",
        ]

    def get_uploaded_by_name(self, obj):
        return str(obj.uploaded_by) if obj.uploaded_by else None
class CaseBriefSerializer(serializers.ModelSerializer):
    file = CaseDocumentFileField()
    attached_by_name = serializers.SerializerMethodField()
    forwarded_by_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()
    forward_history = serializers.SerializerMethodField()
    back_brief = CaseBackBriefSerializer(read_only=True)

    class Meta:
        model = CaseBrief
        fields = [
            "id",
            "case",
            "file",
            "summary",
            "status",
            "forwarded_to_role",
            "forwarded_note",
            "forwarded_at",
            "forwarded_from_role",
            "forwarded_by",
            "forwarded_by_name",
            "approved_by",
            "approved_by_name",
            "approved_at",
            "approved_note",
            "revision",
            "forward_history",
            "back_brief",
            "attached_by",
            "attached_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "case",
            "status",
            "forwarded_at",
            "forwarded_from_role",
            "forwarded_by",
            "forwarded_by_name",
            "approved_by",
            "approved_by_name",
            "approved_at",
            "approved_note",
            "revision",
            "forward_history",
            "back_brief",
            "attached_by",
            "created_at",
            "updated_at",
        ]

    def get_attached_by_name(self, obj):
        return str(obj.attached_by) if obj.attached_by else None

    def get_forwarded_by_name(self, obj):
        return str(obj.forwarded_by) if obj.forwarded_by else None

    def get_approved_by_name(self, obj):
        return str(obj.approved_by) if obj.approved_by else None

    def get_forward_history(self, obj):
        events = obj.forward_history.select_related("forwarded_by").all()
        return CaseBriefForwardSerializer(events, many=True, context=self.context).data
class CaseBriefForwardSerializer(serializers.ModelSerializer):
    forwarded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = CaseBriefForward
        fields = [
            "id",
            "from_role",
            "to_role",
            "forwarded_by",
            "forwarded_by_name",
            "note",
            "revision",
            "forwarded_at",
        ]
        read_only_fields = fields

    def get_forwarded_by_name(self, obj):
        return str(obj.forwarded_by) if obj.forwarded_by else None
