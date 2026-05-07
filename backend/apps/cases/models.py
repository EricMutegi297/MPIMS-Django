from django.db import models
from django.conf import settings


def case_attachment_path(instance, filename):
    case_ref = instance.case_number or "draft"
    return f"cases/{case_ref}/{filename}"


def case_abstract_path(instance, filename):
    try:
        case_ref = instance.case.case_number
    except Exception:
        case_ref = "draft"
    return f"cases/{case_ref}/abstract/{filename}"


class Case(models.Model):
    class Status(models.TextChoices):
        NEW = "new", "New"
        OPEN = "open", "Open"
        TASKED = "tasked", "Tasked"
        UNDER_INVESTIGATION = "under_investigation", "Under Investigation"
        CLOSED = "closed", "Closed"
        REFERRED = "referred", "Referred"
        PENDING = "pending", "Pending"
        SERVED = "served", "Served"

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
    brief_document = models.FileField(upload_to=case_attachment_path, null=True, blank=True)
    brief_forwarded_co = models.BooleanField(default=False)
    brief_forwarded_corps = models.BooleanField(default=False)
    served_at = models.DateTimeField(null=True, blank=True)
    assigned_team = models.ForeignKey(
        "InvestigationTeam",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="assigned_cases",
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
    date_of_offence = models.DateField(null=True, blank=True)
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


class CaseAbstractAttachment(models.Model):
    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name="abstracts")
    file = models.FileField(upload_to=case_abstract_path)
    description = models.CharField(max_length=200, blank=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="uploaded_abstracts",
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "case_abstract_attachments"
        ordering = ["uploaded_at"]

    def __str__(self):
        return f"Abstract for {self.case.case_number} — {self.file.name}"


class InvestigationTeam(models.Model):
    battalion = models.ForeignKey(
        "formations.Battalion",
        on_delete=models.CASCADE,
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
