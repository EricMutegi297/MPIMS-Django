from django.db import models
from django.conf import settings


def case_attachment_path(instance, filename):
    case_ref = instance.case_number or "draft"
    return f"cases/{case_ref}/{filename}"


def case_extra_attachment_path(instance, filename):
    case_ref = instance.case.case_number or "draft"
    return f"cases/{case_ref}/extra/{filename}"


class Case(models.Model):
    class Status(models.TextChoices):
        NEW = "new", "New"
        OPEN = "open", "Open"
        TASKED = "tasked", "Tasked"
        UNDER_INVESTIGATION = "under_investigation", "Under Investigation"
        PENDING = "pending", "Pending"
        SERVED = "served", "Served"
        CLOSED = "closed", "Closed"
        REFERRED = "referred", "Referred"

    class Service(models.TextChoices):
        KA = "KA", "KA"
        KAF = "KAF", "KAF"
        KN = "KN", "KN"

    class OffenceType(models.TextChoices):
        SERVICE = "service_offence", "Service Offence"
        CRIMINAL = "criminal_offence", "Criminal Offence"

    class ServiceOffenceSeverity(models.TextChoices):
        SERIOUS = "serious", "Serious"
        MINOR = "minor", "Minor"

    class CriminalOffenceType(models.TextChoices):
        DCI_CIV = "dci_civ_police", "DCI/Civ Police"
        COURT_MARTIAL = "court_martial", "Court Martial"

    case_number = models.CharField(max_length=30, unique=True, blank=True)
    title = models.CharField(max_length=200, blank=True)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=25, choices=Status.choices, default=Status.NEW)
    offence = models.CharField(max_length=200, blank=True)
    offence_ref = models.ForeignKey(
        "offences.Offence", null=True, blank=True, on_delete=models.SET_NULL, related_name="cases"
    )
    offence_type = models.CharField(max_length=20, choices=OffenceType.choices, blank=True)
    service_offence_severity = models.CharField(
        max_length=10, choices=ServiceOffenceSeverity.choices, blank=True
    )
    criminal_offence_type = models.CharField(
        max_length=20, choices=CriminalOffenceType.choices, blank=True
    )
    accused_name = models.CharField(max_length=120, blank=True)
    accused_service_number = models.CharField(max_length=20, blank=True)
    accused_rank = models.CharField(max_length=60, blank=True)
    accused_service = models.CharField(max_length=5, choices=Service.choices, blank=True)
    submitting_unit = models.ForeignKey(
        "formations.Unit", null=True, blank=True, on_delete=models.SET_NULL, related_name="submitted_cases"
    )
    rfi_no = models.CharField(max_length=50, blank=True)
    rfi_date = models.DateField(null=True, blank=True)
    accused_unit = models.ForeignKey(
        "formations.Unit", null=True, blank=True, on_delete=models.SET_NULL, related_name="cases"
    )
    tasked_battalion = models.ForeignKey(
        "formations.Battalion",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="tasked_cases",
    )
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="assigned_cases",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_cases",
    )
    rfi_document = models.FileField(upload_to=case_attachment_path, null=True, blank=True)
    tasking_letter = models.FileField(upload_to=case_attachment_path, null=True, blank=True)
    tasking_date = models.DateTimeField(null=True, blank=True)
    assigned_team = models.ForeignKey(
        "InvestigationTeam",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="assigned_cases",
    )
    team_assigned_at = models.DateTimeField(
        null=True, blank=True,
        help_text="Timestamp when an investigation team was last assigned to this case.",
    )
    tasked_detachment = models.ForeignKey(
        "formations.Detachment",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="tasked_cases",
    )
    action_taken = models.TextField(blank=True)
    remarks = models.TextField(blank=True)
    chargesheet = models.FileField(upload_to=case_attachment_path, null=True, blank=True)
    part_one_orders = models.FileField(upload_to=case_attachment_path, null=True, blank=True)
    mentioning_date = models.DateField(null=True, blank=True)
    mentioning_remarks = models.TextField(blank=True)
    served_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    date_of_offence = models.DateField(null=True, blank=True)
    investigation_deadline = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "cases"
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if not self.case_number:
            from django.utils import timezone
            year = timezone.now().year
            count = Case.objects.filter(created_at__year=year).count() + 1
            self.case_number = f"CASE/{year}/{count:04d}"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.case_number} — {self.title}"


class CaseAttachment(models.Model):
    class DocumentType(models.TextChoices):
        GENERAL = "general", "General"
        JUDGMENT = "judgment", "Judgment"

    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name="extra_attachments")
    document_type = models.CharField(
        max_length=20,
        choices=DocumentType.choices,
        default=DocumentType.GENERAL,
    )
    label = models.CharField(max_length=100, blank=True)
    file = models.FileField(upload_to=case_extra_attachment_path)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "case_attachments"
        ordering = ["-uploaded_at"]

    def __str__(self):
        return f"{self.case.case_number} – {self.label or self.file.name}"


class CaseCourtMartialHearing(models.Model):
    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name="court_martial_hearings")
    hearing_date = models.DateField()
    remarks = models.TextField(blank=True)
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
    planning_comment = models.TextField(blank=True)
    action_remarks = models.TextField(blank=True)
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


class CaseActivityLog(models.Model):
    class Action(models.TextChoices):
        CASE_CREATED = "case_created", "Case Created"
        STATUS_CHANGED = "status_changed", "Status Changed"
        ATTACHMENT_UPLOADED = "attachment_uploaded", "Attachment Uploaded"
        ATTACHMENT_DELETED = "attachment_deleted", "Attachment Deleted"
        TEAM_ASSIGNED = "team_assigned", "Team Assigned"
        BATTALION_TASKED = "battalion_tasked", "Battalion Tasked"
        DETACHMENT_TASKED = "detachment_tasked", "Detachment Tasked"
        CASE_UPDATED = "case_updated", "Case Updated"

    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name="activity_logs")
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL
    )
    action = models.CharField(max_length=30, choices=Action.choices)
    detail = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "case_activity_logs"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.case.case_number} [{self.action}] by {self.actor}"


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
