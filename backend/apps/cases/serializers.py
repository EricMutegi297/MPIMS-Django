import json
from collections.abc import Mapping

from django.utils import timezone
from rest_framework import serializers
from django.db.models import Q
from .models import (
    Case,
    CaseActivityLog,
    CaseAccused,
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
from apps.users.models import User


CLOSED_CASE_FILE_ERROR = "Closed cases do not allow further uploads or attachment changes."
CASE_FILE_FIELDS = {"tasking_letter", "rfi_document", "chargesheet", "part_one_orders"}


class CaseAttachmentSerializer(serializers.ModelSerializer):
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


class CaseCourtMartialHearingSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = CaseCourtMartialHearing
        fields = [
            "id", "case", "hearing_date", "remarks", "created_by", "created_by_name", "created_at", "updated_at",
        ]
        read_only_fields = ["case", "created_by", "created_by_name", "created_at", "updated_at"]


class CaseAccusedSerializer(serializers.ModelSerializer):
    unit_name = serializers.SerializerMethodField()

    class Meta:
        model = CaseAccused
        fields = ["id", "name", "rank", "service_number", "service", "unit", "unit_name"]
        extra_kwargs = {
            "unit": {"required": False, "allow_null": True},
        }

    def get_unit_name(self, obj):
        return obj.unit.name if obj.unit else None

    def get_created_by_name(self, obj):
        return str(obj.created_by) if obj.created_by else None


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


class CaseBackBriefSerializer(serializers.ModelSerializer):
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


class ExhibitStorageRequestSerializer(serializers.ModelSerializer):
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
        return obj.target_detachment.battalion_id if obj.target_detachment else None

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


class CaseActivityLogSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()
    actor_rank = serializers.SerializerMethodField()
    actor_service_number = serializers.SerializerMethodField()
    actor_display_name = serializers.SerializerMethodField()
    reference_pdf_url = serializers.SerializerMethodField()
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

    def get_reference_pdf_url(self, obj):
        request = self.context.get("request")
        if not obj.reference_pdf:
            return None
        url = obj.reference_pdf.url
        if request is not None:
            return request.build_absolute_uri(url)
        return url

    def get_reference_pdf_name(self, obj):
        if not obj.reference_pdf:
            return None
        return obj.reference_pdf.name.split("/")[-1]


class InvestigationTeamSerializer(serializers.ModelSerializer):
    members = serializers.PrimaryKeyRelatedField(
        many=True, queryset=User.objects.filter(is_active=True)
    )
    team_ic_detail = serializers.SerializerMethodField()
    members_detail = serializers.SerializerMethodField()

    class Meta:
        model = InvestigationTeam
        fields = "__all__"
        read_only_fields = ["created_at", "battalion"]

    def validate(self, attrs):
        members = attrs.get("members", None)
        if members is not None and len(members) < 2:
            raise serializers.ValidationError(
                {"members": "A team must have at least 2 members."}
            )
        return attrs

    def create(self, validated_data):
        members = validated_data.pop("members", [])
        team = InvestigationTeam.objects.create(**validated_data)
        team.members.set(members)
        return team

    def update(self, instance, validated_data):
        members = validated_data.pop("members", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if members is not None:
            instance.members.set(members)
        return instance

    def get_team_ic_detail(self, obj):
        if obj.team_ic:
            return {
                "id": obj.team_ic.id,
                "name": str(obj.team_ic),
                "rank": obj.team_ic.rank,
                "service_number": obj.team_ic.service_number,
            }
        return None

    def get_members_detail(self, obj):
        return [
            {
                "id": m.id,
                "name": str(m),
                "rank": m.rank,
                "service_number": m.service_number,
            }
            for m in obj.members.all()
        ]


class CaseSerializer(serializers.ModelSerializer):
    assigned_to = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(is_active=True),
        required=False,
        allow_null=True,
    )
    assigned_to_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    tasked_battalion_name = serializers.SerializerMethodField()
    tasked_battalion_type = serializers.SerializerMethodField()
    offence_name = serializers.SerializerMethodField()
    accused_unit_name = serializers.SerializerMethodField()
    submitting_unit_name = serializers.SerializerMethodField()
    assigned_team_name = serializers.SerializerMethodField()
    tasked_detachment_name = serializers.SerializerMethodField()
    extra_attachment_count = serializers.SerializerMethodField()
    latest_update = serializers.SerializerMethodField()
    latest_update_at = serializers.SerializerMethodField()
    brief = CaseBriefSerializer(read_only=True)
    accused_entries = CaseAccusedSerializer(many=True, required=False)

    def __init__(self, *args, **kwargs):
        data = kwargs.get("data")
        if isinstance(data, Mapping):
            normalized = {}
            if hasattr(data, "lists"):
                for key, values in data.lists():
                    normalized[key] = values[0] if len(values) == 1 else values
            else:
                for key, value in data.items():
                    normalized[key] = value[0] if isinstance(value, list) and len(value) == 1 else value
            kwargs["data"] = normalized
        super().__init__(*args, **kwargs)

    class Meta:
        model = Case
        fields = "__all__"
        read_only_fields = ["case_number", "created_at", "updated_at", "served_at"]

    def to_internal_value(self, data):
        if isinstance(data, Mapping):
            accused_entries = data.get("accused_entries")
            if isinstance(accused_entries, str):
                try:
                    data = dict(data)
                    data["accused_entries"] = json.loads(accused_entries)
                except (ValueError, TypeError):
                    raise serializers.ValidationError({"accused_entries": "Invalid JSON format."})
        return super().to_internal_value(data)

    @staticmethod
    def _resolved_offence_text(raw_offence, offence_ref):
        if offence_ref and getattr(offence_ref, "name", None):
            return offence_ref.name.strip()
        offence_text = (raw_offence or "").strip()
        if offence_text:
            return offence_text
        return ""

    @staticmethod
    def _user_battalion_id(user):
        if not user:
            return None
        return getattr(user, "battalion_id", None) or getattr(
            getattr(user, "detachment", None),
            "battalion_id",
            None,
        )

    @staticmethod
    def _team_battalion_id(team):
        if not team:
            return None
        return getattr(team, "battalion_id", None) or getattr(
            getattr(team, "detachment", None),
            "battalion_id",
            None,
        )

    def _validate_assignment_scope(self, assigned_team, assigned_to, tasked_battalion, tasked_detachment):
        errors = {}

        if assigned_team:
            if tasked_detachment and assigned_team.detachment_id != tasked_detachment.id:
                errors["assigned_team"] = "Selected team must belong to the tasked company."
            elif tasked_battalion and self._team_battalion_id(assigned_team) != tasked_battalion.id:
                errors["assigned_team"] = "Selected team must belong to the tasked battalion."

        if assigned_to:
            if assigned_to.role != User.Role.INVESTIGATOR:
                errors["assigned_to"] = "Select an active investigator as the IO."
            elif tasked_detachment and assigned_to.detachment_id != tasked_detachment.id:
                errors["assigned_to"] = "Selected IO must belong to the tasked company."
            elif tasked_battalion and self._user_battalion_id(assigned_to) != tasked_battalion.id:
                errors["assigned_to"] = "Selected IO must belong to the tasked battalion."

        if errors:
            raise serializers.ValidationError(errors)

    @staticmethod
    def _blank(value):
        return not str(value or "").strip()

    def _validate_required_create_fields(self, attrs):
        errors = {}

        if not attrs.get("offence_ref") and self._blank(attrs.get("offence")):
            errors["offence"] = "Offence is required."
        if not attrs.get("offence_type"):
            errors["offence_type"] = "Offence type is required."
        if attrs.get("offence_type") == Case.OffenceType.SERVICE and not attrs.get("service_offence_severity"):
            errors["service_offence_severity"] = "Severity is required for service offences."
        if attrs.get("offence_type") == Case.OffenceType.CRIMINAL and not attrs.get("criminal_offence_type"):
            errors["criminal_offence_type"] = "Criminal offence type is required."
        if not attrs.get("submitting_unit"):
            errors["submitting_unit"] = "Submitting unit is required."
        if not attrs.get("date_of_offence"):
            errors["date_of_offence"] = "Date of offence is required."
        if self._blank(attrs.get("place_of_offence")):
            errors["place_of_offence"] = "Place of offence is required."
        if self._blank(attrs.get("description")):
            errors["description"] = "Description is required."

        accused_entries = attrs.get("accused_entries") or []
        entry_errors = []
        for item in accused_entries:
            missing = []
            if self._blank(item.get("name")):
                missing.append("name")
            if self._blank(item.get("rank")):
                missing.append("rank")
            if self._blank(item.get("service_number")):
                missing.append("service number")
            if self._blank(item.get("service")):
                missing.append("service")
            if not item.get("unit"):
                missing.append("unit")
            if missing:
                entry_errors.append(f"Accused entry requires {', '.join(missing)}.")
        if entry_errors:
            errors["accused_entries"] = entry_errors

        if errors:
            raise serializers.ValidationError(errors)

    def validate(self, attrs):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        instance = getattr(self, "instance", None)

        tasked_battalion = attrs.get(
            "tasked_battalion",
            getattr(instance, "tasked_battalion", None),
        )
        tasking_letter = attrs.get(
            "tasking_letter",
            getattr(instance, "tasking_letter", None),
        )
        tasking_date = attrs.get(
            "tasking_date",
            getattr(instance, "tasking_date", None),
        )
        tasking_no = attrs.get(
            "tasking_no",
            getattr(instance, "tasking_no", ""),
        )
        tasked_detachment = attrs.get(
            "tasked_detachment",
            getattr(instance, "tasked_detachment", None),
        )
        assigned_team_in_payload = "assigned_team" in attrs
        assigned_to_in_payload = "assigned_to" in attrs
        assigned_team = attrs.get(
            "assigned_team",
            getattr(instance, "assigned_team", None),
        )
        assigned_to = attrs.get(
            "assigned_to",
            getattr(instance, "assigned_to", None),
        )
        close_requested_in_payload = "close_requested" in attrs
        close_requested = attrs.get(
            "close_requested",
            getattr(instance, "close_requested", False),
        )
        offence_ref = attrs.get(
            "offence_ref",
            getattr(instance, "offence_ref", None),
        )
        offence_text = attrs.get(
            "offence",
            getattr(instance, "offence", ""),
        )
        criminal_offence_type = attrs.get(
            "criminal_offence_type",
            getattr(instance, "criminal_offence_type", ""),
        )
        status_in_payload = "status" in attrs
        target_status = attrs.get("status", getattr(instance, "status", None))
        prev_status = getattr(instance, "status", None)
        mentioning_date = attrs.get("mentioning_date", getattr(instance, "mentioning_date", None))
        mentioning_remarks = attrs.get("mentioning_remarks", getattr(instance, "mentioning_remarks", ""))
        rfi_document = attrs.get("rfi_document", getattr(instance, "rfi_document", None))
        rfi_no = attrs.get("rfi_no", getattr(instance, "rfi_no", ""))
        rfi_date = attrs.get("rfi_date", getattr(instance, "rfi_date", None))
        tasking_requested = any(
            field in attrs
            for field in ("tasked_battalion", "tasked_detachment", "tasking_letter", "tasking_date")
        )

        if instance and instance.status == Case.Status.CLOSED:
            blocked_file_fields = sorted(field for field in CASE_FILE_FIELDS if field in attrs)
            if blocked_file_fields:
                raise serializers.ValidationError({
                    field: CLOSED_CASE_FILE_ERROR for field in blocked_file_fields
                })

        accused_entries = attrs.get("accused_entries")
        if isinstance(accused_entries, str):
            try:
                accused_entries = json.loads(accused_entries)
            except (ValueError, TypeError):
                raise serializers.ValidationError({"accused_entries": "Invalid JSON format."})
            attrs["accused_entries"] = accused_entries

        if accused_entries is not None:
            if not isinstance(accused_entries, list):
                raise serializers.ValidationError({"accused_entries": "Must be a list of accused entries."})
            filtered_entries = []
            for item in accused_entries:
                if not isinstance(item, dict):
                    raise serializers.ValidationError({"accused_entries": "Each accused entry must be an object."})
                if any(
                    str(item.get(field, "") or "").strip()
                    for field in ["name", "rank", "service_number", "service", "unit"]
                ):
                    filtered_entries.append(item)
            attrs["accused_entries"] = filtered_entries

        if self.instance is None:
            # Force status to "new" on creation
            attrs["status"] = Case.Status.NEW
            if not user or not user.is_authenticated:
                raise serializers.ValidationError("Authentication is required.")
            is_hqs_admin = (
                user.role == "admin"
                and user.battalion
                and user.battalion.battalion_type == Battalion.BattalionType.HQS
            )
            if not (user.is_superuser or is_hqs_admin):
                raise serializers.ValidationError(
                    "Only a superuser or HQ battalion admin can create a new case."
                )
            self._validate_required_create_fields(attrs)

        if tasked_battalion and tasked_battalion.battalion_type not in {
            Battalion.BattalionType.SPECIAL,
            Battalion.BattalionType.NORMAL,
        }:
            raise serializers.ValidationError(
                {"tasked_battalion": "Cases can only be tasked to Special or Normal battalions."}
            )

        if rfi_document:
            rfi_errors = {}
            if self._blank(rfi_no):
                rfi_errors["rfi_no"] = "RFI number is required when an RFI attachment is uploaded."
            if not rfi_date:
                rfi_errors["rfi_date"] = "RFI date is required when an RFI attachment is uploaded."
            if rfi_errors:
                raise serializers.ValidationError(rfi_errors)

        tasking_validation_requested = tasking_requested or (status_in_payload and target_status == Case.Status.TASKED)
        if tasking_validation_requested and not tasked_battalion:
            raise serializers.ValidationError(
                {"tasked_battalion": "Select a battalion before completing tasking."}
            )

        if tasking_validation_requested and tasked_battalion and not tasking_letter:
            raise serializers.ValidationError(
                {"tasking_letter": "Attach a tasking letter before completing tasking."}
            )

        if tasking_validation_requested and tasked_battalion and not tasking_date:
            raise serializers.ValidationError(
                {"tasking_date": "Tasking date and time is required when tasking a battalion."}
            )

        if tasking_validation_requested and tasked_battalion and self._blank(tasking_no):
            raise serializers.ValidationError(
                {"tasking_no": "Tasking number is required before this case can be tasked."}
            )

        if (
            tasking_requested
            and tasked_battalion
            and tasking_letter
            and tasking_date
            and not self._blank(tasking_no)
            and not status_in_payload
            and target_status in {Case.Status.NEW, Case.Status.OPEN}
        ):
            attrs["status"] = Case.Status.TASKED
            target_status = Case.Status.TASKED

        assignment_requested = assigned_team_in_payload or assigned_to_in_payload
        if assigned_team_in_payload and assigned_to_in_payload and assigned_team and assigned_to:
            raise serializers.ValidationError(
                {"assignment": "Assign the case to either one IO or one team, not both."}
            )

        if assigned_team_in_payload and assigned_team:
            attrs["assigned_to"] = None
            assigned_to = None
        elif assigned_to_in_payload and assigned_to:
            attrs["assigned_team"] = None
            assigned_team = None

        if assignment_requested and user and user.is_authenticated:
            can_assign_case = (
                user.is_superuser
                or user.role in {User.Role.ADMIN, User.Role.CO, User.Role.DETACHMENT}
            )
            if not can_assign_case:
                raise serializers.ValidationError({"assignment": "You are not allowed to assign cases for investigation."})
            self._validate_assignment_scope(
                assigned_team,
                assigned_to,
                tasked_battalion,
                tasked_detachment,
            )

        is_court_martial = criminal_offence_type == Case.CriminalOffenceType.COURT_MARTIAL
        assignment_target = assigned_team or assigned_to
        if assignment_target and assignment_requested and not attrs.get("team_assigned_at"):
            attrs["team_assigned_at"] = timezone.now()
        if (
            assignment_target
            and assignment_requested
            and not is_court_martial
            and not status_in_payload
            and target_status in {Case.Status.NEW, Case.Status.OPEN, Case.Status.TASKED}
        ):
            attrs["status"] = Case.Status.UNDER_INVESTIGATION
            target_status = Case.Status.UNDER_INVESTIGATION
        if (
            assignment_target
            and close_requested_in_payload
            and close_requested
            and not is_court_martial
            and not status_in_payload
            and target_status == Case.Status.TASKED
        ):
            attrs["status"] = Case.Status.UNDER_INVESTIGATION
            target_status = Case.Status.UNDER_INVESTIGATION
        if (
            close_requested_in_payload
            and close_requested
            and instance
            and not getattr(instance, "close_requested", False)
            and not attrs.get("close_requested_at")
        ):
            attrs["close_requested_at"] = timezone.now()

        if target_status == Case.Status.SERVED and not getattr(instance, "served_at", None):
            attrs["served_at"] = timezone.now()

        if target_status == Case.Status.CLOSED:
            if not instance:
                raise serializers.ValidationError(
                    {"status": "Cases can only be closed after creation and service workflow."}
                )

            if not str(attrs.get("action_taken") or getattr(instance, "action_taken", "") or "").strip():
                raise serializers.ValidationError(
                    {"action_taken": "Action taken is required before closing this case."}
                )

            if not (
                attrs.get("chargesheet") or getattr(instance, "chargesheet", None)
                or attrs.get("part_one_orders") or getattr(instance, "part_one_orders", None)
            ):
                raise serializers.ValidationError(
                    {"chargesheet": "Attach a Chargesheet or report before closing this case."}
                )

            if not (attrs.get("rfi_document") or getattr(instance, "rfi_document", None)):
                raise serializers.ValidationError(
                    {"rfi_document": "Upload the RFI document before closing this case."}
                )

            has_judgment_file = instance.extra_attachments.filter(
                document_type=CaseAttachment.DocumentType.JUDGMENT
            ).exists()
            if not has_judgment_file:
                raise serializers.ValidationError(
                    {"status": "Attach at least one Judgment PDF file before closing this case."}
                )

            if is_court_martial:
                judgment_qs = instance.court_martial_milestones.filter(
                    milestone_type=CaseCourtMartialMilestone.MilestoneType.JUDGMENT
                )
                if not judgment_qs.exists():
                    raise serializers.ValidationError(
                        {"status": "Add a Judgment milestone date before closing a Court Martial case."}
                    )
                has_judgment_comment = judgment_qs.filter(
                    Q(action_remarks__gt="") | Q(planning_comment__gt="")
                ).exists()
                if not has_judgment_comment:
                    raise serializers.ValidationError(
                        {"status": "Judgment remarks/comment are required before closing a Court Martial case."}
                    )

        # Keep offence text populated from offence reference when free text is not provided.
        resolved_offence = self._resolved_offence_text(offence_text, offence_ref)
        if resolved_offence:
            attrs["offence"] = resolved_offence

        return attrs

    def _sync_legacy_accused_fields(self, case):
        first_accused = case.accused_entries.order_by("created_at").first()
        if first_accused:
            case.accused_name = first_accused.name or ""
            case.accused_rank = first_accused.rank or ""
            case.accused_service_number = first_accused.service_number or ""
            case.accused_service = first_accused.service or ""
            case.accused_unit = first_accused.unit
        else:
            case.accused_name = ""
            case.accused_rank = ""
            case.accused_service_number = ""
            case.accused_service = ""
            case.accused_unit = None
        case.save(update_fields=[
            "accused_name",
            "accused_rank",
            "accused_service_number",
            "accused_service",
            "accused_unit",
        ])

    def _create_or_update_accused_entries(self, case, accused_entries):
        case.accused_entries.all().delete()
        for entry in accused_entries:
            case.accused_entries.create(
                name=(entry.get("name") or "").strip(),
                rank=(entry.get("rank") or "").strip(),
                service_number=(entry.get("service_number") or "").strip(),
                service=(entry.get("service") or "").strip(),
                unit=entry.get("unit") or None,
            )
        self._sync_legacy_accused_fields(case)

    def create(self, validated_data):
        accused_entries = validated_data.pop("accused_entries", None)
        case = super().create(validated_data)
        if accused_entries is not None:
            self._create_or_update_accused_entries(case, accused_entries)
        return case

    def update(self, instance, validated_data):
        accused_entries = validated_data.pop("accused_entries", None)
        case = super().update(instance, validated_data)
        if accused_entries is not None:
            self._create_or_update_accused_entries(case, accused_entries)
        return case

    def get_assigned_to_name(self, obj):
        return str(obj.assigned_to) if obj.assigned_to else None

    def get_created_by_name(self, obj):
        return str(obj.created_by) if obj.created_by else None

    def get_tasked_battalion_name(self, obj):
        return obj.tasked_battalion.name if obj.tasked_battalion else None

    def get_tasked_battalion_type(self, obj):
        return obj.tasked_battalion.battalion_type if obj.tasked_battalion else None

    def get_offence_name(self, obj):
        return obj.offence_ref.name if obj.offence_ref else None

    def get_accused_unit_name(self, obj):
        return obj.accused_unit.name if obj.accused_unit else None

    def get_submitting_unit_name(self, obj):
        return obj.submitting_unit.name if obj.submitting_unit else None

    def get_assigned_team_name(self, obj):
        return obj.assigned_team.name if obj.assigned_team else None

    def get_tasked_detachment_name(self, obj):
        return obj.tasked_detachment.name if obj.tasked_detachment else None

    def get_extra_attachment_count(self, obj):
        return obj.extra_attachments.count()

    def _latest_case_update_log(self, obj):
        prefetched = getattr(obj, "case_update_logs", None)
        if prefetched is not None:
            return prefetched[0] if prefetched else None
        return obj.activity_logs.filter(
            action=CaseActivityLog.Action.CASE_UPDATED
        ).order_by("-created_at").first()

    def get_latest_update(self, obj):
        latest = self._latest_case_update_log(obj)
        if latest and latest.detail:
            return latest.detail
        return obj.action_taken or obj.mentioning_remarks or obj.remarks or ""

    def get_latest_update_at(self, obj):
        latest = self._latest_case_update_log(obj)
        if latest:
            return latest.created_at
        return obj.mentioning_date or obj.updated_at

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["offence"] = self._resolved_offence_text(
            data.get("offence"),
            instance.offence_ref,
        )
        return data
