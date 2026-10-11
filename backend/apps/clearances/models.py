from django.conf import settings
from django.db import models
from django.db.models import Q


class ClearanceRequest(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending HQ Approval"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    requester = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="submitted_clearance_requests",
    )
    subject = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="clearance_requests",
    )
    status = models.CharField(
        max_length=12,
        choices=Status.choices,
        default=Status.PENDING,
    )
    requested_at = models.DateTimeField(auto_now_add=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="reviewed_clearance_requests",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    invalidated_at = models.DateTimeField(null=True, blank=True)
    invalidating_case = models.ForeignKey(
        "cases.Case",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="invalidated_clearance_certificates",
    )
    decision_note = models.TextField(blank=True)
    certificate_number = models.CharField(
        max_length=40,
        null=True,
        blank=True,
        unique=True,
    )

    class Meta:
        db_table = "clearance_requests"
        ordering = ["-requested_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["subject"],
                condition=Q(status="pending"),
                name="unique_pending_clearance_per_subject",
            ),
        ]
        indexes = [
            models.Index(fields=["status", "requested_at"]),
        ]

    def __str__(self):
        return f"Clearance {self.pk} for {self.subject.service_number} ({self.status})"
