from django.db import models
from django.core.validators import RegexValidator
from django.conf import settings
from django.utils import timezone
from apps.common.fields import EncryptedTextField

from .case import Case
from .paths import case_back_brief_path, case_brief_path

class CaseBrief(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        FORWARDED = "forwarded", "Forwarded"

    class ForwardRole(models.TextChoices):
        IC_CASES = "ic_cases", "IC Cases"
        HOD = "hod", "HOD"
        CO = "co", "Commanding Officer"
        OC = "oc", "OC"
        CORPS_CMD = "corps_cmd", "Corps Cmd"
        DETACHMENT = "detachment", "Legacy IC Cases"
        DETACHMENT_IC = "detachment_ic", "Detachment IC"
        DETACHMENT_COMMANDER = "detachment_commander", "Detachment Commander"
        ADJ = "adj", "Adjutant"
        TWO_IC = "2ic", "2IC"
        COMPANY_OC = "company_oc", "Company OC"
        COMPANY_TWO_IC = "company_2ic", "Company 2IC"

    case = models.OneToOneField(
        Case,
        on_delete=models.CASCADE,
        related_name="brief",
    )
    file = models.FileField(upload_to=case_brief_path)
    summary = EncryptedTextField(blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    forwarded_to_role = models.CharField(
        max_length=20,
        choices=ForwardRole.choices,
        blank=True,
    )
    forwarded_note = EncryptedTextField(blank=True)
    forwarded_at = models.DateTimeField(null=True, blank=True)
    forwarded_from_role = models.CharField(max_length=20, blank=True)
    forwarded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="forwarded_briefs",
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="approved_case_briefs",
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    approved_note = EncryptedTextField(blank=True)
    revision = models.PositiveIntegerField(default=1)
    attached_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="attached_briefs",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "case_briefs"
        ordering = ["-updated_at"]

    def __str__(self):
        return f"Brief for {self.case.case_number}"
class CaseBriefForward(models.Model):
    brief = models.ForeignKey(
        CaseBrief,
        on_delete=models.CASCADE,
        related_name="forward_history",
    )
    from_role = models.CharField(max_length=20, blank=True)
    to_role = models.CharField(max_length=20, choices=CaseBrief.ForwardRole.choices)
    forwarded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="case_brief_forwards",
    )
    note = EncryptedTextField(blank=True)
    revision = models.PositiveIntegerField(default=1)
    forwarded_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "case_brief_forwards"
        ordering = ["-forwarded_at", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["brief", "revision", "to_role"],
                name="uniq_case_brief_forward_revision_target",
            )
        ]

    def __str__(self):
        return f"{self.brief} to {self.to_role} by {self.forwarded_by}"
class CaseBackBrief(models.Model):
    brief = models.OneToOneField(
        CaseBrief,
        on_delete=models.CASCADE,
        related_name="back_brief",
    )
    file = models.FileField(upload_to=case_back_brief_path)
    note = EncryptedTextField(blank=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="uploaded_back_briefs",
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "case_back_briefs"
        ordering = ["-uploaded_at"]

    def __str__(self):
        return f"Back-brief for {self.brief.case.case_number}"
