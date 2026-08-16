from django.db import models
from django.conf import settings
from django.utils import timezone

from apps.common.fields import EncryptedTextField


def case_attachment_path(instance, filename):
    case_ref = instance.case_number or "draft"
    return f"cases/{case_ref}/{filename}"


def case_extra_attachment_path(instance, filename):
    case_ref = instance.case.case_number or "draft"
    return f"cases/{case_ref}/extra/{filename}"


def court_martial_attachment_path(instance, filename):
    case_ref = instance.milestone.case.case_number or "draft"
    return f"cases/{case_ref}/court-martial/{filename}"


def case_activity_reference_path(instance, filename):
    case_ref = instance.case.case_number or "draft"
    return f"cases/{case_ref}/activity/{filename}"


def case_brief_path(instance, filename):
    case_ref = instance.case.case_number or "draft"
    return f"cases/{case_ref}/brief/{filename}"


def case_back_brief_path(instance, filename):
    case_ref = instance.brief.case.case_number or "draft"
    return f"cases/{case_ref}/back-brief/{filename}"


def exhibit_photo_path(instance, filename):
    case_ref = instance.case.case_number or "draft"
    return f"cases/{case_ref}/exhibits/{filename}"


def exhibit_lifecycle_document_path(instance, filename):
    case_ref = instance.case.case_number or "draft"
    return f"cases/{case_ref}/exhibits/lifecycle/{filename}"


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
    action_taken = EncryptedTextField(blank=True)
    remarks = EncryptedTextField(blank=True)
    chargesheet = models.FileField(upload_to=case_attachment_path, null=True, blank=True)
    part_one_orders = models.FileField(upload_to=case_attachment_path, null=True, blank=True)
    mentioning_date = models.DateField(null=True, blank=True)
    mentioning_remarks = EncryptedTextField(blank=True)
    close_requested = models.BooleanField(default=False)
    close_requested_at = models.DateTimeField(null=True, blank=True)
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


class CaseAccused(models.Model):
    case = models.ForeignKey(
        Case,
        on_delete=models.CASCADE,
        related_name="accused_entries",
    )
    name = models.CharField(max_length=120, blank=True)
    rank = models.CharField(max_length=60, blank=True)
    service_number = models.CharField(max_length=20, blank=True)
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


class CaseBrief(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        FORWARDED = "forwarded", "Forwarded"

    class ForwardRole(models.TextChoices):
        HOD = "hod", "HOD"
        CO = "co", "Commanding Officer"
        OC = "oc", "OC"
        CORPS_CMD = "corps_cmd", "Corps Cmd"
        DETACHMENT = "detachment", "IC COY"
        ADJ = "adj", "Adjutant"
        TWO_IC = "2ic", "2IC"

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


class ExhibitStorageRequest(models.Model):
    class StorageScope(models.TextChoices):
        DETACHMENT = "detachment", "Company"
        BATTALION = "battalion", "Battalion"
        SPECIAL_BATTALION = "special_battalion", "Special Battalion"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        DECLINED = "declined", "Declined"
        STORED = "stored", "Stored"
        RETURN_REQUESTED = "return_requested", "Return Requested"
        DISPOSAL_REQUESTED = "disposal_requested", "Disposal Requested"
        TRANSFER_REQUESTED = "transfer_requested", "Transfer Requested"
        RETENTION_REQUESTED = "retention_requested", "Retention Requested"
        RETURNED = "returned", "Returned"
        DISPOSED = "disposed", "Disposed"
        TRANSFERRED = "transferred", "Transferred"
        RETAINED = "retained", "Retained"

    class LifecycleAction(models.TextChoices):
        RETURN_ACCUSED = "return_accused", "Return to Accused"
        RETURN_OWNER = "return_owner", "Return to Owner/Witness"
        DISPOSE = "dispose", "Dispose/Destroy"
        TRANSFER = "transfer", "Transfer to Another Authority"
        RETAIN = "retain", "Retain for Court Martial"

    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name="exhibit_storage_requests")
    parent_request = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="additional_requests",
    )
    exhibit_name = models.CharField(max_length=150)
    description = EncryptedTextField(blank=True)
    quantity = models.PositiveIntegerField(default=1)
    photo = models.FileField(upload_to=exhibit_photo_path, null=True, blank=True)
    storage_scope = models.CharField(max_length=25, choices=StorageScope.choices)
    target_detachment = models.ForeignKey(
        "formations.Detachment",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="exhibit_storage_requests",
    )
    target_battalion = models.ForeignKey(
        "formations.Battalion",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="exhibit_storage_requests",
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="exhibit_storage_requests",
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="reviewed_exhibit_storage_requests",
    )
    stored_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="stored_exhibit_storage_requests",
    )
    reviewer_comments = EncryptedTextField(blank=True)
    decline_reason = EncryptedTextField(blank=True)
    storage_reference = models.CharField(max_length=100, blank=True)
    physical_location = models.CharField(max_length=200, blank=True)
    lifecycle_action = models.CharField(max_length=25, choices=LifecycleAction.choices, blank=True)
    lifecycle_reason = EncryptedTextField(blank=True)
    lifecycle_recipient_name = models.CharField(max_length=150, blank=True)
    lifecycle_recipient_identifier = models.CharField(max_length=100, blank=True)
    lifecycle_authority = models.CharField(max_length=150, blank=True)
    lifecycle_disposal_mode = models.CharField(max_length=150, blank=True)
    lifecycle_attachment = models.FileField(upload_to=exhibit_lifecycle_document_path, null=True, blank=True)
    lifecycle_requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="requested_exhibit_lifecycle_actions",
    )
    lifecycle_reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="reviewed_exhibit_lifecycle_actions",
    )
    lifecycle_review_comments = EncryptedTextField(blank=True)
    lifecycle_decline_reason = EncryptedTextField(blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    stored_at = models.DateTimeField(null=True, blank=True)
    lifecycle_requested_at = models.DateTimeField(null=True, blank=True)
    lifecycle_reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "exhibit_storage_requests"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.exhibit_name} - {self.case.case_number} ({self.status})"


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


class CaseActivityLog(models.Model):
    class Action(models.TextChoices):
        CASE_CREATED = "case_created", "Case Created"
        STATUS_CHANGED = "status_changed", "Status Changed"
        ATTACHMENT_UPLOADED = "attachment_uploaded", "Attachment Uploaded"
        ATTACHMENT_DELETED = "attachment_deleted", "Attachment Deleted"
        TEAM_ASSIGNED = "team_assigned", "Team Assigned"
        BATTALION_TASKED = "battalion_tasked", "Battalion Tasked"
        DETACHMENT_TASKED = "detachment_tasked", "Company Tasked"
        CASE_UPDATED = "case_updated", "Case Updated"
        BRIEF_ATTACHED = "brief_attached", "Brief Attached"
        BRIEF_UPDATED = "brief_updated", "Brief Updated"
        BRIEF_FORWARDED = "brief_forwarded", "Brief Forwarded"

    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name="activity_logs")
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL
    )
    action = models.CharField(max_length=30, choices=Action.choices)
    detail = EncryptedTextField(blank=True)
    reference_pdf = models.FileField(upload_to=case_activity_reference_path, null=True, blank=True)
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
