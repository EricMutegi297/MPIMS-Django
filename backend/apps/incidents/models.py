from django.db import models
from django.conf import settings

from apps.common.fields import EncryptedTextField


class Incident(models.Model):
    class Status(models.TextChoices):
        REPORTED = "reported", "Reported"
        UNDER_INVESTIGATION = "under_investigation", "Under Investigation"
        RESOLVED = "resolved", "Resolved"
        CLOSED = "closed", "Closed"

    class Severity(models.TextChoices):
        LOW = "low", "Low"
        MEDIUM = "medium", "Medium"
        HIGH = "high", "High"
        CRITICAL = "critical", "Critical"

    incident_number = models.CharField(max_length=30, unique=True, blank=True)
    incident_type = models.CharField(max_length=100)
    description = EncryptedTextField()
    location = models.CharField(max_length=200, blank=True)
    service_vehicle = models.CharField(max_length=120, blank=True)
    unit_involved = models.CharField(max_length=160, blank=True)
    originating_unit = models.CharField(max_length=160, blank=True)
    civilian = models.CharField(max_length=200, blank=True)
    service_member = models.CharField(max_length=200, blank=True)
    history = EncryptedTextField(blank=True)
    injuries = EncryptedTextField(blank=True)
    damages = EncryptedTextField(blank=True)
    how_occurred = EncryptedTextField(blank=True)
    action_taken = EncryptedTextField(blank=True)
    police_ob_reference = models.CharField(max_length=160, blank=True)
    date_occurred = models.DateTimeField()
    severity = models.CharField(max_length=10, choices=Severity.choices, default=Severity.MEDIUM)
    status = models.CharField(max_length=25, choices=Status.choices, default=Status.REPORTED)
    reported_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="reported_incidents",
    )
    unit = models.ForeignKey(
        "formations.Unit", null=True, blank=True, on_delete=models.SET_NULL, related_name="incidents"
    )
    battalion = models.ForeignKey(
        "formations.Battalion", null=True, blank=True, on_delete=models.SET_NULL
    )
    morning_brief = models.ForeignKey(
        "morningbriefs.MorningBrief",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="incidents",
    )
    converted_case = models.OneToOneField(
        "cases.Case",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="source_incident",
    )
    is_belated = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "incidents"
        ordering = ["-date_occurred"]

    def save(self, *args, **kwargs):
        if not self.incident_number:
            from django.utils import timezone
            year = timezone.now().year
            count = Incident.objects.filter(created_at__year=year).count() + 1
            self.incident_number = f"INC/{year}/{count:04d}"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.incident_number} — {self.incident_type}"
