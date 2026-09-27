from rest_framework import serializers
from ..models import Case
from apps.users.models import User
from .accused import CaseAccusedSerializer
from .briefs import CaseBriefSerializer

from .validation import CaseValidationMixin
from .writes import CaseWriteMixin
from .representation import CaseRepresentationMixin
from ..uploads import CaseDocumentFileField


class CaseSerializer(
    CaseValidationMixin,
    CaseWriteMixin,
    CaseRepresentationMixin,
    serializers.ModelSerializer,
):
    assigned_to = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(is_active=True),
        required=False,
        allow_null=True,
    )
    assigned_to_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    tasked_battalion_name = serializers.SerializerMethodField()
    tasked_company_name = serializers.SerializerMethodField()
    tasked_battalion_type = serializers.SerializerMethodField()
    offence_name = serializers.SerializerMethodField()
    accused_unit_name = serializers.SerializerMethodField()
    submitting_unit_name = serializers.SerializerMethodField()
    assigned_team_name = serializers.SerializerMethodField()
    tasked_detachment_name = serializers.SerializerMethodField()
    extra_attachment_count = serializers.SerializerMethodField()
    latest_update = serializers.SerializerMethodField()
    latest_update_at = serializers.SerializerMethodField()
    source_incident_number = serializers.SerializerMethodField()
    source_incident_type = serializers.SerializerMethodField()
    source_incident_date = serializers.SerializerMethodField()
    source_incident_time = serializers.SerializerMethodField()
    source_incident_place = serializers.SerializerMethodField()
    source_incident_unit = serializers.SerializerMethodField()
    source_incident_originating_unit = serializers.SerializerMethodField()
    source_incident_history = serializers.SerializerMethodField()
    source_incident_how_occurred = serializers.SerializerMethodField()
    source_incident_rta_vehicles = serializers.SerializerMethodField()
    source_incident_rta_casualties = serializers.SerializerMethodField()
    abstract_acknowledged_by_name = serializers.SerializerMethodField()
    unit_closure_requested_by_name = serializers.SerializerMethodField()
    unit_closure_decided_by_name = serializers.SerializerMethodField()
    clearance_certificate_uploaded_by_name = serializers.SerializerMethodField()
    transfer_from = serializers.SerializerMethodField()
    transfer_to = serializers.SerializerMethodField()
    transfer_reason = serializers.SerializerMethodField()
    brief = CaseBriefSerializer(read_only=True)
    accused_entries = CaseAccusedSerializer(many=True, required=False)
    abstract_acknowledgement_form = CaseDocumentFileField(required=False, allow_null=True)
    chargesheet = CaseDocumentFileField(required=False, allow_null=True)
    clearance_certificate = CaseDocumentFileField(required=False, allow_null=True)
    part_one_orders = CaseDocumentFileField(required=False, allow_null=True)
    rfi_document = CaseDocumentFileField(required=False, allow_null=True)
    served_abstract = CaseDocumentFileField(required=False, allow_null=True)
    tasking_letter = CaseDocumentFileField(required=False, allow_null=True)
    traffic_accident_report = CaseDocumentFileField(required=False, allow_null=True)
    rta_damage_authority = CaseDocumentFileField(required=False, allow_null=True)

    class Meta:
        model = Case
        fields = "__all__"
        read_only_fields = [
            "case_number",
            "created_at",
            "updated_at",
            "served_at",
            "abstract_acknowledged_at",
            "abstract_acknowledged_by",
            "unit_closure_status",
            "unit_closure_requested_at",
            "unit_closure_requested_by",
            "unit_closure_request_note",
            "unit_closure_decided_at",
            "unit_closure_decided_by",
            "unit_closure_decision_note",
            "clearance_certificate",
            "clearance_certificate_uploaded_by",
            "clearance_certificate_uploaded_at",
            # Server-authoritative flag indicating a case is ready for an HQ explicit close action.
            # Exposed read-only so clients can render a "Close Case" button but cannot set it.
            "can_be_closed",
        ]
