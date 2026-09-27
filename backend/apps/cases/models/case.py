from django.db import models, transaction
from django.core.validators import RegexValidator
from django.conf import settings
from django.utils import timezone
from apps.common.fields import EncryptedTextField

from .paths import case_attachment_path
from .case_numbers import CaseNumberSequence

class Case(models.Model):
    class CaseType(models.TextChoices):
        RFI = "rfi", "RFI Case"
        INCIDENT = "incident", "Incident Case"
        RTA = "rta", "Road Traffic Accident"

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

    class ClosureBasis(models.TextChoices):
        PART_II_ORDERS = "part_ii_orders", "Part II Orders"
        CANCELLATION_LETTER = "cancellation_letter", "Cancellation Letter"
        SERVICE_HQS_AUTHORITY = "service_hqs_authority", "Authority From Service HQs"

    class RtaDamageAuthoritySource(models.TextChoices):
        HQ_KA_MOVES = "hq_ka_moves", "HQ KA Moves"
        LEGAL = "legal", "Legal"

    class UnitClosureStatus(models.TextChoices):
        PENDING = "pending", "Pending Review"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    case_number = models.CharField(max_length=30, unique=True, blank=True)
    case_type = models.CharField(max_length=25, choices=CaseType.choices, default=CaseType.RFI)
    title = models.CharField(max_length=200, blank=True)
    description = EncryptedTextField(blank=True)
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
    police_station = models.CharField(max_length=200, blank=True, default="")
    place_of_offence = models.CharField(max_length=200, blank=True, default="")
    tasked_battalion = models.ForeignKey(
        "formations.Battalion",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="tasked_cases",
    )
    tasked_company = models.ForeignKey(
        "formations.Company",
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
    tasking_no = models.CharField(max_length=50, blank=True)
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
    action_taken = EncryptedTextField(blank=True)
    remarks = EncryptedTextField(blank=True)
    chargesheet = models.FileField(upload_to=case_attachment_path, null=True, blank=True)
    part_one_orders = models.FileField(upload_to=case_attachment_path, null=True, blank=True)
    closure_basis = models.CharField(max_length=35, choices=ClosureBasis.choices, blank=True)
    part_ii_order_serial_no = models.CharField(max_length=50, blank=True)
    part_ii_order_date = models.DateField(null=True, blank=True)
    traffic_accident_report = models.FileField(upload_to=case_attachment_path, null=True, blank=True)
    traffic_accident_report_uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="uploaded_traffic_accident_reports",
    )
    traffic_accident_report_uploaded_at = models.DateTimeField(null=True, blank=True)
    rta_service_vehicle_damaged = models.BooleanField(default=False)
    rta_damage_authority_source = models.CharField(
        max_length=20,
        choices=RtaDamageAuthoritySource.choices,
        blank=True,
    )
    rta_damage_authority = models.FileField(upload_to=case_attachment_path, null=True, blank=True)
    rta_damage_authority_uploaded_at = models.DateTimeField(null=True, blank=True)
    mentioning_date = models.DateField(null=True, blank=True)
    mentioning_remarks = EncryptedTextField(blank=True)
    close_requested = models.BooleanField(default=False)
    close_requested_at = models.DateTimeField(null=True, blank=True)
    served_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    # Indicates that a Court Martial Judgment milestone has an action recorded
    # and the case is ready to be explicitly closed by an HQ admin. This is
    # server-controlled and should only be set when a Judgment milestone action
    # is recorded. It is cleared when the case is actually closed.
    can_be_closed = models.BooleanField(default=False)
    served_abstract = models.FileField(upload_to=case_attachment_path, null=True, blank=True)
    abstract_acknowledged_at = models.DateTimeField(null=True, blank=True)
    abstract_acknowledged_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="abstract_acknowledged_cases",
    )
    abstract_acknowledgement_form = models.FileField(upload_to=case_attachment_path, null=True, blank=True)
    unit_closure_status = models.CharField(
        max_length=20,
        choices=UnitClosureStatus.choices,
        blank=True,
        default="",
    )
    unit_closure_requested_at = models.DateTimeField(null=True, blank=True)
    unit_closure_requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="unit_closure_requested_cases",
    )
    unit_closure_request_note = EncryptedTextField(blank=True)
    unit_closure_decided_at = models.DateTimeField(null=True, blank=True)
    unit_closure_decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="unit_closure_reviewed_cases",
    )
    unit_closure_decision_note = EncryptedTextField(blank=True)
    clearance_certificate = models.FileField(upload_to=case_attachment_path, null=True, blank=True)
    clearance_certificate_uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="uploaded_clearance_certificates",
    )
    clearance_certificate_uploaded_at = models.DateTimeField(null=True, blank=True)
    date_of_offence = models.DateField(null=True, blank=True)
    investigation_deadline = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "cases"
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if not self.case_number:
            year = timezone.now().year
            using = kwargs.get("using") or self._state.db
            with transaction.atomic(using=using):
                sequence, _ = (
                    CaseNumberSequence.objects.using(using)
                    .get_or_create(year=year, defaults={"last_number": 0})
                )
                sequence = (
                    CaseNumberSequence.objects.using(using)
                    .select_for_update()
                    .get(pk=sequence.pk)
                )
                sequence.last_number += 1
                sequence.save(using=using, update_fields=["last_number"])
                self.case_number = f"CASE/{year}/{sequence.last_number:04d}"
                super().save(*args, **kwargs)
            return
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.case_number} — {self.title}"
class CaseAccused(models.Model):
    case = models.ForeignKey(
        Case,
        on_delete=models.CASCADE,
        related_name="accused_entries",
    )
    name = models.CharField(max_length=120, blank=True)
    rank = models.CharField(max_length=60, blank=True)
    service_number = models.CharField(
        max_length=20,
        blank=True,
        validators=[
            RegexValidator(
                regex=r"^\d+$",
                message="Service number must contain numbers only.",
            )
        ],
    )
    service = models.CharField(max_length=5, choices=Case.Service.choices, blank=True)
    unit = models.ForeignKey(
        "formations.Unit",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="accused_cases",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "case_accused"
        ordering = ["created_at"]

    def __str__(self):
        if self.name:
            return f"{self.name} ({self.service_number or 'No Service No'})"
        return f"Unidentified accused on {self.case.case_number}"
class CaseAccusedOffence(models.Model):
    accused = models.ForeignKey(
        CaseAccused,
        on_delete=models.CASCADE,
        related_name="offences",
    )
    offence = models.ForeignKey(
        "offences.Offence",
        on_delete=models.PROTECT,
        related_name="accused_offences",
    )
    count_number = models.PositiveIntegerField(default=1)
    particulars = models.TextField(blank=True)

    class Meta:
        db_table = "case_accused_offences"
        ordering = ["count_number", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["accused", "offence", "count_number"],
                name="unique_accused_offence_count",
            ),
        ]

    def __str__(self):
        return f"{self.accused} — {self.offence} (Count {self.count_number})"
