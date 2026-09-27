from django.db import models
from django.core.validators import RegexValidator
from django.conf import settings
from django.utils import timezone
from apps.common.fields import EncryptedTextField

from .case import Case
from .paths import case_activity_reference_path, case_extra_attachment_path

class CaseAttachment(models.Model):
    class DocumentType(models.TextChoices):
        GENERAL = "general", "General"
        JUDGMENT = "judgment", "Judgment"

    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name="extra_attachments")
    document_type = models.CharField(
        max_length=20,
        choices=DocumentType.choices,
        default=DocumentType.GENERAL,
    )
    label = models.CharField(max_length=100, blank=True)
    file = models.FileField(upload_to=case_extra_attachment_path)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "case_attachments"
        ordering = ["-uploaded_at"]

    def __str__(self):
        return f"{self.case.case_number} – {self.label or self.file.name}"
class CaseActivityLog(models.Model):
    class Action(models.TextChoices):
        CASE_CREATED = "case_created", "Case Created"
        STATUS_CHANGED = "status_changed", "Status Changed"
        ATTACHMENT_UPLOADED = "attachment_uploaded", "Attachment Uploaded"
        ATTACHMENT_DELETED = "attachment_deleted", "Attachment Deleted"
        TEAM_ASSIGNED = "team_assigned", "Team Assigned"
        BATTALION_TASKED = "battalion_tasked", "Battalion Tasked"
        DETACHMENT_TASKED = "detachment_tasked", "Company Tasked"
        CASE_UPDATED = "case_updated", "Case Updated"
        BRIEF_ATTACHED = "brief_attached", "Brief Attached"
        BRIEF_UPDATED = "brief_updated", "Brief Updated"
        BRIEF_FORWARDED = "brief_forwarded", "Brief Forwarded"
        CASE_TRANSFERRED = "case_transferred", "Case Transferred"

    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name="activity_logs")
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL
    )
    action = models.CharField(max_length=30, choices=Action.choices)
    detail = EncryptedTextField(blank=True)
    reference_pdf = models.FileField(upload_to=case_activity_reference_path, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "case_activity_logs"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.case.case_number} [{self.action}] by {self.actor}"
