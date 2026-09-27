from rest_framework.permissions import BasePermission

from apps.users.access import can_upload_case_attachments


class CanManageUnitServiceCase(BasePermission):
    messages = {
        "acknowledge": "Only the accused unit can acknowledge service on this case.",
        "request_closure": "Only the accused unit can request closure on this case.",
        "clearance_certificate": "Only the accused unit can attach a clearance certificate.",
    }

    def has_object_permission(self, request, view, obj):
        if view._can_manage_unit_service(request.user, obj):
            return True
        self.message = self.messages[view.action]
        return False


class CanUploadCaseAttachments(BasePermission):
    messages = {
        "attachments": "Only authorised Company or Detachment command users can upload case attachments.",
        "delete_attachment": "Only authorised Company or Detachment command users can delete case attachments.",
    }

    def has_object_permission(self, request, view, obj):
        if request.method not in {"POST", "DELETE"}:
            return True
        if can_upload_case_attachments(request.user, obj):
            return True
        self.message = self.messages[view.action]
        return False
