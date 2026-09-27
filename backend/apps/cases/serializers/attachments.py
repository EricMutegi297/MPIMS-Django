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

class CaseAttachmentSerializer(serializers.ModelSerializer):
    file = CaseDocumentFileField()
    uploaded_by_name = serializers.SerializerMethodField()
    file_name = serializers.SerializerMethodField()

    class Meta:
        model = CaseAttachment
        fields = ["id", "case", "document_type", "label", "file", "file_name", "uploaded_by", "uploaded_by_name", "uploaded_at"]
        read_only_fields = ["uploaded_by", "uploaded_at", "case"]

    def get_uploaded_by_name(self, obj):
        return str(obj.uploaded_by) if obj.uploaded_by else None

    def get_file_name(self, obj):
        return obj.file.name.split("/")[-1] if obj.file else None

    def validate(self, attrs):
        document_type = attrs.get("document_type", getattr(self.instance, "document_type", CaseAttachment.DocumentType.GENERAL))
        file_obj = attrs.get("file")
        if document_type == CaseAttachment.DocumentType.JUDGMENT and file_obj:
            name = str(getattr(file_obj, "name", "") or "").lower()
            if not name.endswith(".pdf"):
                raise serializers.ValidationError({"file": "Judgment files must be uploaded as PDF."})
        return attrs
