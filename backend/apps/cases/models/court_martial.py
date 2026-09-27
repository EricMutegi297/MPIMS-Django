from django.db import models
from django.core.validators import RegexValidator
from django.conf import settings
from django.utils import timezone
from apps.common.fields import EncryptedTextField

from .case import Case

class CaseCourtMartialHearing(models.Model):
    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name="court_martial_hearings")
    hearing_date = models.DateField()
    remarks = EncryptedTextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "case_court_martial_hearings"
        ordering = ["hearing_date", "created_at"]

    def __str__(self):
        return f"{self.case.case_number} hearing on {self.hearing_date}"
class CaseCourtMartialMilestone(models.Model):
    class MilestoneType(models.TextChoices):
        MENTIONING = "mentioning", "Mentioning"
        HEARING = "hearing", "Hearing"
        DEFENCE = "defence", "Defence"
        RULING = "ruling", "Ruling"
        JUDGMENT = "judgment", "Judgment"

    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name="court_martial_milestones")
    milestone_type = models.CharField(max_length=20, choices=MilestoneType.choices)
    scheduled_date = models.DateField()
    planning_comment = EncryptedTextField(blank=True)
    action_remarks = EncryptedTextField(blank=True)
    action_recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="court_martial_actions_recorded",
    )
    action_recorded_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="court_martial_milestones_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "case_court_martial_milestones"
        ordering = ["scheduled_date", "created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["case", "milestone_type", "scheduled_date"],
                name="uniq_case_milestone_type_date",
            )
        ]

    def __str__(self):
        return f"{self.case.case_number} {self.milestone_type} on {self.scheduled_date}"
