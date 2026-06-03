from rest_framework import serializers
from django.db.models import Q
from .models import (
    Case,
    CaseActivityLog,
    CaseAttachment,
    CaseCourtMartialAttachment,
    CaseCourtMartialHearing,
    CaseCourtMartialMilestone,
    InvestigationTeam,
)
from apps.formations.models import Battalion
from apps.users.models import User


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


class CaseCourtMartialAttachmentSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.SerializerMethodField()
    file_url = serializers.SerializerMethodField()
    file_name_display = serializers.SerializerMethodField()

    class Meta:
        model = CaseCourtMartialAttachment
        fields = [
            "id",
            "milestone",
            "file",
            "file_name",
            "file_url",
            "file_name_display",
            "uploaded_by",
            "uploaded_by_name",
            "uploaded_at",
        ]
        read_only_fields = ["milestone", "uploaded_by", "uploaded_by_name", "uploaded_at"]

    def get_uploaded_by_name(self, obj):
        return str(obj.uploaded_by) if obj.uploaded_by else None

    def get_file_url(self, obj):
        return obj.file.url if obj.file else None

    def get_file_name_display(self, obj):
        if obj.file_name:
            return obj.file_name
        return obj.file.name.split("/")[-1] if obj.file else None


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
    extra_attachments = CaseAttachmentSerializer(many=True, read_only=True)
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

    class Meta:
        model = Case
        fields = "__all__"
        read_only_fields = ["case_number", "created_at", "updated_at", "served_at"]

    @staticmethod
    def _resolved_offence_text(raw_offence, offence_ref):
        if offence_ref and getattr(offence_ref, "name", None):
            return offence_ref.name.strip()
        offence_text = (raw_offence or "").strip()
        if offence_text:
            return offence_text
        return ""

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
        target_status = attrs.get("status", getattr(instance, "status", None))
        prev_status = getattr(instance, "status", None)
        mentioning_date = attrs.get("mentioning_date", getattr(instance, "mentioning_date", None))
        mentioning_remarks = attrs.get("mentioning_remarks", getattr(instance, "mentioning_remarks", ""))

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

        if tasked_battalion and tasked_battalion.battalion_type not in {
            Battalion.BattalionType.SPECIAL,
            Battalion.BattalionType.NORMAL,
        }:
            raise serializers.ValidationError(
                {"tasked_battalion": "Cases can only be tasked to Special or Normal battalions."}
            )

        if tasked_battalion and not tasking_letter:
            raise serializers.ValidationError(
                {"tasking_letter": "Attach a tasking letter before completing tasking."}
            )

        if tasked_battalion and not tasking_date:
            raise serializers.ValidationError(
                {"tasking_date": "Tasking date and time is required when tasking a battalion."}
            )

        is_court_martial = criminal_offence_type == Case.CriminalOffenceType.COURT_MARTIAL

        if target_status == Case.Status.CLOSED:
            if not instance:
                raise serializers.ValidationError(
                    {"status": "Cases can only be closed after creation and service workflow."}
                )

            # RFI is mandatory before closing a case.
            rfi_no_val = (attrs.get("rfi_no", None) if "rfi_no" in attrs else getattr(instance, "rfi_no", "")) or ""
            rfi_doc_val = attrs.get("rfi_document", None) if "rfi_document" in attrs else getattr(instance, "rfi_document", None)
            if not rfi_no_val.strip() and not rfi_doc_val:
                raise serializers.ValidationError(
                    {"rfi_no": "RFI number or RFI document is required before closing this case."}
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

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["offence"] = self._resolved_offence_text(
            data.get("offence"),
            instance.offence_ref,
        )
        # Always include extra_attachments (including judgment files)
        data["extra_attachments"] = CaseAttachmentSerializer(
            instance.extra_attachments.all(), many=True, context=self.context
        ).data
        return data
