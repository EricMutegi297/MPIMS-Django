from rest_framework import viewsets

from ..models import Case
from ..serializers import CaseSerializer
from .case_lookup_transfer import CaseLookupTransferMixin
from .case_queries import CaseQueriesMixin
from .case_access import CaseAccessMixin
from .case_actions import CaseActionsMixin
from .case_workflows import CaseWorkflowsMixin
from .case_analytics import CaseAnalyticsMixin
from .case_records import CaseRecordsMixin
from .permissions import CanManageUnitServiceCase, CanUploadCaseAttachments


class CaseViewSet(
    CaseLookupTransferMixin,
    CaseQueriesMixin,
    CaseAccessMixin,
    CaseActionsMixin,
    CaseWorkflowsMixin,
    CaseAnalyticsMixin,
    CaseRecordsMixin,
    viewsets.ModelViewSet,
):
    filterset_fields = ["status", "criminal_offence_type"]
    queryset = Case.objects.select_related("assigned_to", "created_by", "accused_unit", "source_incident").prefetch_related(
        "extra_attachments", "court_martial_hearings", "court_martial_milestones", "accused_entries"
    ).all()
    serializer_class = CaseSerializer
    action_permission_classes = {
        "acknowledge": CanManageUnitServiceCase,
        "request_closure": CanManageUnitServiceCase,
        "clearance_certificate": CanManageUnitServiceCase,
        "attachments": CanUploadCaseAttachments,
        "delete_attachment": CanUploadCaseAttachments,
    }

    def get_permissions(self):
        permissions = super().get_permissions()
        permission_class = self.action_permission_classes.get(getattr(self, "action", None))
        if permission_class:
            permissions.append(permission_class())
        return permissions
