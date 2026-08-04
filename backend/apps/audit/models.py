from django.conf import settings
from django.db import models

from apps.common.fields import EncryptedTextField


class AuditLog(models.Model):
    class Action(models.TextChoices):
        LOGIN = "login", "Login"
        LOGIN_FAILED = "login_failed", "Login Failed"
        LOGOUT = "logout", "Logout"
        VIEW = "view", "View"
        CREATE = "create", "Create"
        UPDATE = "update", "Update"
        DELETE = "delete", "Delete"
        ACTION = "action", "Action"
        ERROR = "error", "Error"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="audit_logs",
    )
    service_number = models.CharField(max_length=50, blank=True)
    user_name = models.CharField(max_length=150, blank=True)
    user_rank = models.CharField(max_length=80, blank=True)
    user_role = models.CharField(max_length=50, blank=True)
    battalion = models.ForeignKey(
        "formations.Battalion",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="audit_logs",
    )
    battalion_name = models.CharField(max_length=150, blank=True)
    detachment = models.ForeignKey(
        "formations.Detachment",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="audit_logs",
    )
    detachment_name = models.CharField(max_length=150, blank=True)
    action = models.CharField(max_length=30, choices=Action.choices)
    module = models.CharField(max_length=80, blank=True)
    method = models.CharField(max_length=10, blank=True)
    path = models.CharField(max_length=600, blank=True)
    query_string = EncryptedTextField(blank=True)
    object_id = models.CharField(max_length=120, blank=True)
    description = EncryptedTextField(blank=True)
    status_code = models.PositiveIntegerField(null=True, blank=True)
    success = models.BooleanField(default=False)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = EncryptedTextField(blank=True)
    duration_ms = models.PositiveIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "audit_logs"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["-created_at"]),
            models.Index(fields=["action", "-created_at"]),
            models.Index(fields=["module", "-created_at"]),
            models.Index(fields=["service_number", "-created_at"]),
            models.Index(fields=["user_role", "-created_at"]),
        ]

    def __str__(self):
        actor = self.service_number or self.user_name or "Anonymous"
        return f"{self.created_at:%Y-%m-%d %H:%M:%S} {actor} {self.action} {self.module}"
