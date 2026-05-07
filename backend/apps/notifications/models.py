from django.db import models
from django.conf import settings


class Notification(models.Model):
    class Type(models.TextChoices):
        INCIDENT = "incident", "Incident"
        CASE = "case", "Case"
        MORNING_BRIEF = "morning_brief", "Morning Brief"
        SYSTEM = "system", "System"
        ALERT = "alert", "Alert"

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    message = models.TextField()
    notification_type = models.CharField(max_length=20, choices=Type.choices, default=Type.SYSTEM)
    is_read = models.BooleanField(default=False)
    related_model = models.CharField(max_length=50, blank=True)
    related_id = models.PositiveIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "notifications"
        ordering = ["-created_at"]

    def __str__(self):
        return f"[{self.notification_type}] → {self.recipient}"
