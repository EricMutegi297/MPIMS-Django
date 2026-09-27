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
from ..uploads import CaseDocumentFileField, IMAGE_EXTENSIONS

class ExhibitStorageRequestSerializer(serializers.ModelSerializer):
    photo = CaseDocumentFileField(
        required=False,
        allow_null=True,
        allowed_extensions=IMAGE_EXTENSIONS,
    )
    lifecycle_attachment = CaseDocumentFileField(read_only=True)
    case_number = serializers.SerializerMethodField()
    case_offence = serializers.SerializerMethodField()
    case_accused = serializers.SerializerMethodField()
    case_accused_service_number = serializers.SerializerMethodField()
    parent_request_label = serializers.SerializerMethodField()
    requested_by_name = serializers.SerializerMethodField()
    reviewed_by_name = serializers.SerializerMethodField()
    stored_by_name = serializers.SerializerMethodField()
    lifecycle_requested_by_name = serializers.SerializerMethodField()
    lifecycle_reviewed_by_name = serializers.SerializerMethodField()
    target_detachment_name = serializers.SerializerMethodField()
    target_detachment_battalion = serializers.SerializerMethodField()
    target_battalion_name = serializers.SerializerMethodField()

    class Meta:
        model = ExhibitStorageRequest
        fields = [
            "id",
            "case",
            "parent_request",
            "parent_request_label",
            "case_number",
            "case_offence",
            "case_accused",
            "case_accused_service_number",
            "exhibit_name",
            "description",
            "quantity",
            "photo",
            "storage_scope",
            "target_detachment",
            "target_detachment_name",
            "target_detachment_battalion",
            "target_battalion",
            "target_battalion_name",
            "status",
            "requested_by",
            "requested_by_name",
            "reviewed_by",
            "reviewed_by_name",
            "stored_by",
            "stored_by_name",
            "reviewer_comments",
            "decline_reason",
            "storage_reference",
            "physical_location",
            "lifecycle_action",
            "lifecycle_reason",
            "lifecycle_recipient_name",
            "lifecycle_recipient_identifier",
            "lifecycle_authority",
            "lifecycle_disposal_mode",
            "lifecycle_attachment",
            "lifecycle_requested_by",
            "lifecycle_requested_by_name",
            "lifecycle_reviewed_by",
            "lifecycle_reviewed_by_name",
            "lifecycle_review_comments",
            "lifecycle_decline_reason",
            "reviewed_at",
            "stored_at",
            "lifecycle_requested_at",
            "lifecycle_reviewed_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "status",
            "requested_by",
            "requested_by_name",
            "reviewed_by",
            "reviewed_by_name",
            "stored_by",
            "stored_by_name",
            "reviewer_comments",
            "decline_reason",
            "storage_reference",
            "physical_location",
            "lifecycle_action",
            "lifecycle_reason",
            "lifecycle_recipient_name",
            "lifecycle_recipient_identifier",
            "lifecycle_authority",
            "lifecycle_disposal_mode",
            "lifecycle_attachment",
            "lifecycle_requested_by",
            "lifecycle_requested_by_name",
            "lifecycle_reviewed_by",
            "lifecycle_reviewed_by_name",
            "lifecycle_review_comments",
            "lifecycle_decline_reason",
            "reviewed_at",
            "stored_at",
            "lifecycle_requested_at",
            "lifecycle_reviewed_at",
            "created_at",
            "updated_at",
            "target_detachment_name",
            "target_detachment_battalion",
            "target_battalion_name",
            "case_accused_service_number",
            "parent_request_label",
        ]

    def get_case_number(self, obj):
        return obj.case.case_number if obj.case else None

    def get_case_offence(self, obj):
        if not obj.case:
            return None
        return obj.case.offence or (obj.case.offence_ref.name if obj.case.offence_ref else None)

    def get_case_accused(self, obj):
        return obj.case.accused_name if obj.case else None

    def get_case_accused_service_number(self, obj):
        return obj.case.accused_service_number if obj.case else None

    def get_parent_request_label(self, obj):
        if not obj.parent_request:
            return None
        case_number = obj.parent_request.case.case_number if obj.parent_request.case else "Case"
        return f"{obj.parent_request.exhibit_name} ({case_number})"

    def get_requested_by_name(self, obj):
        return str(obj.requested_by) if obj.requested_by else None

    def get_reviewed_by_name(self, obj):
        return str(obj.reviewed_by) if obj.reviewed_by else None

    def get_stored_by_name(self, obj):
        return str(obj.stored_by) if obj.stored_by else None

    def get_lifecycle_requested_by_name(self, obj):
        return str(obj.lifecycle_requested_by) if obj.lifecycle_requested_by else None

    def get_lifecycle_reviewed_by_name(self, obj):
        return str(obj.lifecycle_reviewed_by) if obj.lifecycle_reviewed_by else None

    def get_target_detachment_name(self, obj):
        return obj.target_detachment.name if obj.target_detachment else None

    def get_target_detachment_battalion(self, obj):
        return (
            obj.target_detachment.company.battalion_id
            if obj.target_detachment and obj.target_detachment.company_id
            else None
        )

    def get_target_battalion_name(self, obj):
        return obj.target_battalion.name if obj.target_battalion else None

    def _case_assigned_to_user(self, case, user):
        if not case or not user:
            return False
        if case.assigned_to_id == user.id:
            return True
        team = getattr(case, "assigned_team", None)
        if not team:
            return False
        if team.team_ic_id == user.id:
            return True
        return team.members.filter(id=user.id).exists()

    def validate(self, attrs):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        case = attrs.get("case", getattr(self.instance, "case", None))

        if case and case.status == Case.Status.CLOSED:
            is_file_write = self.instance is None or bool(getattr(request, "FILES", None)) or "photo" in attrs
            if is_file_write:
                raise serializers.ValidationError({"case": CLOSED_CASE_FILE_ERROR})

        if self.instance is not None:
            return attrs

        if not user or not user.is_authenticated or user.role != User.Role.INVESTIGATOR:
            raise serializers.ValidationError("Only investigators can request exhibit storage.")

        case = attrs.get("case")
        if not self._case_assigned_to_user(case, user):
            raise serializers.ValidationError({"case": "You can only request exhibit storage for cases assigned to you or your investigation team."})

        parent_request = attrs.get("parent_request")
        if parent_request:
            if parent_request.case_id != case.id:
                raise serializers.ValidationError({"parent_request": "Additional exhibits must belong to the same case as the stored exhibit."})
            if parent_request.status != ExhibitStorageRequest.Status.STORED:
                raise serializers.ValidationError({"parent_request": "Additional exhibits can only be added under an exhibit that has already been stored."})

        storage_scope = attrs.get("storage_scope")
        if storage_scope == ExhibitStorageRequest.StorageScope.DETACHMENT:
            if not user.detachment_id:
                raise serializers.ValidationError({"storage_scope": "You must belong to a detachment to request detachment storage."})
            attrs["target_detachment"] = user.detachment
            attrs["target_battalion"] = None
        elif storage_scope == ExhibitStorageRequest.StorageScope.BATTALION:
            battalion = attrs.get("target_battalion") or user.battalion or getattr(user.detachment, "battalion", None)
            if not battalion:
                raise serializers.ValidationError({"target_battalion": "Select the battalion that will store the exhibit."})
            if battalion.battalion_type == Battalion.BattalionType.SPECIAL:
                attrs["storage_scope"] = ExhibitStorageRequest.StorageScope.SPECIAL_BATTALION
            attrs["target_battalion"] = battalion
            attrs["target_detachment"] = None
        elif storage_scope == ExhibitStorageRequest.StorageScope.SPECIAL_BATTALION:
            target = attrs.get("target_battalion")
            if not target:
                raise serializers.ValidationError({"target_battalion": "Select the special battalion that will store the exhibit."})
            if target.battalion_type != Battalion.BattalionType.SPECIAL:
                raise serializers.ValidationError({"target_battalion": "Selected battalion must be a Special battalion."})
            attrs["target_detachment"] = None
        else:
            raise serializers.ValidationError({"storage_scope": "Select where the exhibit should be stored."})

        quantity = attrs.get("quantity") or 1
        if quantity < 1:
            raise serializers.ValidationError({"quantity": "Quantity must be at least 1."})

        return attrs
