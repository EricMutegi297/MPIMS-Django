from django.db import models
from django.conf import settings

from apps.common.fields import EncryptedTextField


class MorningBrief(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        READY = "ready", "Ready for Auto Publish"
        PUBLISHED = "published", "Published"
        PENDING = "pending", "Pending"
        SUBMITTED = "submitted", "Submitted"
        LATE = "late", "Late"
        BELATED = "belated", "Belated"

    date = models.DateField()
    morning_brief_year = models.PositiveSmallIntegerField(null=True, blank=True, editable=False)
    morning_brief_sequence = models.PositiveIntegerField(null=True, blank=True, editable=False)
    unit = models.ForeignKey(
        "formations.Unit", null=True, blank=True, on_delete=models.CASCADE, related_name="morning_briefs"
    )
    battalion = models.ForeignKey(
        "formations.Battalion", null=True, blank=True, on_delete=models.SET_NULL, related_name="morning_briefs"
    )
    detachment = models.ForeignKey(
        "formations.Detachment", null=True, blank=True, on_delete=models.SET_NULL, related_name="morning_briefs"
    )
    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="submitted_briefs",
    )
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    total_strength = models.PositiveIntegerField(default=0)
    present = models.PositiveIntegerField(default=0)
    absent = models.PositiveIntegerField(default=0)
    sick = models.PositiveIntegerField(default=0)
    on_leave = models.PositiveIntegerField(default=0)
    on_duty = models.PositiveIntegerField(default=0)
    remarks = EncryptedTextField(blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "morning_briefs"
        unique_together = [("date", "unit")]
        ordering = ["-date"]

    def __str__(self):
        return f"Brief {self.date} — {self.unit}"
