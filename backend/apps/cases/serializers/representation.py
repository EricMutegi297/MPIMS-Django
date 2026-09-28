import re
from django.utils import timezone
from ..models import CaseActivityLog


class CaseRepresentationMixin:

    def get_abstract_acknowledged_by_name(self, obj):
        return str(obj.abstract_acknowledged_by) if obj.abstract_acknowledged_by else None

    def get_unit_closure_requested_by_name(self, obj):
        return str(obj.unit_closure_requested_by) if obj.unit_closure_requested_by else None

    def get_unit_closure_decided_by_name(self, obj):
        return str(obj.unit_closure_decided_by) if obj.unit_closure_decided_by else None

    def get_clearance_certificate_uploaded_by_name(self, obj):
        return str(obj.clearance_certificate_uploaded_by) if obj.clearance_certificate_uploaded_by else None

    def _latest_transfer_log(self, obj):
        prefetched_logs = getattr(obj, "transfer_history_logs", None)
        if prefetched_logs is not None:
            return prefetched_logs[0] if prefetched_logs else None
        return (
            obj.activity_logs
            .filter(action=CaseActivityLog.Action.CASE_TRANSFERRED)
            .order_by("-created_at", "-id")
            .first()
        )

    def _transfer_detail_parts(self, obj):
        log = self._latest_transfer_log(obj)
        detail = str(log.detail or "") if log else ""
        match = re.match(
            r"Transferred from (?P<source>.*?) to (?P<destination>.*?)\. "
            r"Reason: (?P<reason>.*?)\. Instructions: ",
            detail,
        )
        if not match:
            return {"source": None, "destination": obj.tasked_battalion.name if obj.tasked_battalion else None, "reason": None}
        return match.groupdict()

    def get_transfer_from(self, obj):
        return self._transfer_detail_parts(obj)["source"]

    def get_transfer_to(self, obj):
        return self._transfer_detail_parts(obj)["destination"]

    def get_transfer_reason(self, obj):
        return self._transfer_detail_parts(obj)["reason"]

    def get_assigned_to_name(self, obj):
        return str(obj.assigned_to) if obj.assigned_to else None

    def get_created_by_name(self, obj):
        return str(obj.created_by) if obj.created_by else None

    def get_tasked_battalion_name(self, obj):
        return obj.tasked_battalion.name if obj.tasked_battalion else None

    def get_tasked_company_name(self, obj):
        return obj.tasked_company.name if obj.tasked_company else None

    def get_tasked_battalion_type(self, obj):
        return obj.tasked_battalion.battalion_type if obj.tasked_battalion else None

    def get_offence_name(self, obj):
        return obj.offence_ref.name if obj.offence_ref else None

    def get_accused_unit_name(self, obj):
        if obj.accused_unit:
            return obj.accused_unit.name
        return obj.submitting_unit.name if obj.submitting_unit else None

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

    def get_source_incident_number(self, obj):
        incident = self._source_incident(obj)
        return incident.incident_number if incident else None

    def get_source_incident_type(self, obj):
        incident = self._source_incident(obj)
        return incident.incident_type if incident else None

    def get_source_incident_date(self, obj):
        incident = self._source_incident(obj)
        if not incident or not incident.date_occurred:
            return None
        return timezone.localtime(incident.date_occurred).date().isoformat()

    def get_source_incident_time(self, obj):
        incident = self._source_incident(obj)
        if not incident or not incident.date_occurred:
            return None
        return timezone.localtime(incident.date_occurred).strftime("%H:%M")

    def get_source_incident_place(self, obj):
        incident = self._source_incident(obj)
        return incident.location if incident else None

    def get_source_incident_unit(self, obj):
        incident = self._source_incident(obj)
        return incident.unit_involved if incident else None

    def get_source_incident_originating_unit(self, obj):
        incident = self._source_incident(obj)
        return incident.originating_unit if incident else None

    def get_source_incident_history(self, obj):
        incident = self._source_incident(obj)
        return incident.history if incident else None

    def get_source_incident_how_occurred(self, obj):
        incident = self._source_incident(obj)
        return incident.how_occurred if incident else None

    def get_source_incident_rta_vehicles(self, obj):
        incident = self._source_incident(obj)
        return incident.rta_vehicles if incident else []

    def get_source_incident_rta_casualties(self, obj):
        incident = self._source_incident(obj)
        return incident.rta_casualties if incident else []

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["offence"] = self._resolved_offence_text(
            data.get("offence"),
            instance.offence_ref,
        )
        return data
