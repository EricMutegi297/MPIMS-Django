from django.db import models
from django.core.validators import RegexValidator
from django.conf import settings
from django.utils import timezone
from apps.common.fields import EncryptedTextField


class InvestigationTeam(models.Model):
    battalion = models.ForeignKey(
        "formations.Battalion",
        on_delete=models.CASCADE,
        related_name="investigation_teams",
    )
    detachment = models.ForeignKey(
        "formations.Detachment",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="investigation_teams",
    )
    name = models.CharField(max_length=100)
    team_ic = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="led_teams",
    )
    members = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        related_name="investigation_teams",
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "investigation_teams"
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.battalion})"
