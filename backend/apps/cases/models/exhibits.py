from django.db import models
from django.core.validators import RegexValidator
from django.conf import settings
from django.utils import timezone
from apps.common.fields import EncryptedTextField

from .case import Case
from .paths import exhibit_lifecycle_document_path, exhibit_photo_path

class ExhibitStorageRequest(models.Model):
    class StorageScope(models.TextChoices):
        DETACHMENT = "detachment", "Company"
        BATTALION = "battalion", "Battalion"
        SPECIAL_BATTALION = "special_battalion", "Special Battalion"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        DECLINED = "declined", "Declined"
        STORED = "stored", "Stored"
        RETURN_REQUESTED = "return_requested", "Return Requested"
        DISPOSAL_REQUESTED = "disposal_requested", "Disposal Requested"
        TRANSFER_REQUESTED = "transfer_requested", "Transfer Requested"
        RETENTION_REQUESTED = "retention_requested", "Retention Requested"
        RETURNED = "returned", "Returned"
        DISPOSED = "disposed", "Disposed"
        TRANSFERRED = "transferred", "Transferred"
        RETAINED = "retained", "Retained"

    class LifecycleAction(models.TextChoices):
        RETURN_ACCUSED = "return_accused", "Return to Accused"
        RETURN_OWNER = "return_owner", "Return to Owner/Witness"
        DISPOSE = "dispose", "Dispose/Destroy"
        TRANSFER = "transfer", "Transfer to Another Authority"
        RETAIN = "retain", "Retain for Court Martial"

    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name="exhibit_storage_requests")
    parent_request = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="additional_requests",
    )
    exhibit_name = models.CharField(max_length=150)
    description = EncryptedTextField(blank=True)
    quantity = models.PositiveIntegerField(default=1)
    photo = models.FileField(upload_to=exhibit_photo_path, null=True, blank=True)
    storage_scope = models.CharField(max_length=25, choices=StorageScope.choices)
    target_detachment = models.ForeignKey(
        "formations.Detachment",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="exhibit_storage_requests",
    )
    target_battalion = models.ForeignKey(
        "formations.Battalion",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="exhibit_storage_requests",
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="exhibit_storage_requests",
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="reviewed_exhibit_storage_requests",
    )
    stored_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="stored_exhibit_storage_requests",
    )
    reviewer_comments = EncryptedTextField(blank=True)
    decline_reason = EncryptedTextField(blank=True)
    storage_reference = models.CharField(max_length=100, blank=True)
    physical_location = models.CharField(max_length=200, blank=True)
    lifecycle_action = models.CharField(max_length=25, choices=LifecycleAction.choices, blank=True)
    lifecycle_reason = EncryptedTextField(blank=True)
    lifecycle_recipient_name = models.CharField(max_length=150, blank=True)
    lifecycle_recipient_identifier = models.CharField(max_length=100, blank=True)
    lifecycle_authority = models.CharField(max_length=150, blank=True)
    lifecycle_disposal_mode = models.CharField(max_length=150, blank=True)
    lifecycle_attachment = models.FileField(upload_to=exhibit_lifecycle_document_path, null=True, blank=True)
    lifecycle_requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="requested_exhibit_lifecycle_actions",
    )
    lifecycle_reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="reviewed_exhibit_lifecycle_actions",
    )
    lifecycle_review_comments = EncryptedTextField(blank=True)
    lifecycle_decline_reason = EncryptedTextField(blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    stored_at = models.DateTimeField(null=True, blank=True)
    lifecycle_requested_at = models.DateTimeField(null=True, blank=True)
    lifecycle_reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "exhibit_storage_requests"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.exhibit_name} - {self.case.case_number} ({self.status})"
