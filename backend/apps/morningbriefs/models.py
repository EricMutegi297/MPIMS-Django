from django.db import models
from django.conf import settings


class MorningBrief(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        SUBMITTED = "submitted", "Submitted"
        LATE = "late", "Late"
        BELATED = "belated", "Belated"

    date = models.DateField()
    unit = models.ForeignKey(
        "formations.Unit", on_delete=models.CASCADE, related_name="morning_briefs"
    )
    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="submitted_briefs",
    )
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    total_strength = models.PositiveIntegerField(default=0)
    present = models.PositiveIntegerField(default=0)
    absent = models.PositiveIntegerField(default=0)
    sick = models.PositiveIntegerField(default=0)
    on_leave = models.PositiveIntegerField(default=0)
    on_duty = models.PositiveIntegerField(default=0)
    remarks = models.TextField(blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "morning_briefs"
        unique_together = [("date", "unit")]
        ordering = ["-date"]

    def __str__(self):
        return f"Brief {self.date} — {self.unit}"
