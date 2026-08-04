from django.db import models
from django.conf import settings

from apps.common.fields import EncryptedTextField


def release_letter_path(instance, filename):
    case_ref = getattr(instance.case, "case_number", None) or "guardroom"
    return f"guardrooms/{case_ref}/release/{filename}"


class Guardroom(models.Model):
    name = models.CharField(max_length=100)
    unit = models.OneToOneField(
        "formations.Unit", null=True, blank=True, on_delete=models.SET_NULL, related_name="guardroom"
    )
    ic = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="guardroom_commanded",
    )
    capacity = models.PositiveIntegerField(default=0)
    location = models.CharField(max_length=150, blank=True)
    phone_no = models.CharField(max_length=30, blank=True)
    current_strength = models.PositiveIntegerField(default=0)
    established_strength = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "guardrooms"
        ordering = ["name"]

    def __str__(self):
        return self.name


class GuardPost(models.Model):
    guardroom = models.ForeignKey(Guardroom, on_delete=models.CASCADE, related_name="posts")
    name = models.CharField(max_length=100)
    assigned_personnel = models.ManyToManyField(
        settings.AUTH_USER_MODEL, blank=True, related_name="guard_posts"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "guard_posts"

    def __str__(self):
        return f"{self.name} ({self.guardroom})"


class GuardroomPlacementRequest(models.Model):
    class Reason(models.TextChoices):
        INVESTIGATION = "investigation", "Investigation"
        LEGAL_COURT_PROCESS = "legal_court_process", "Legal/Court Process"
        POST_CONVICTION = "post_conviction", "Post-Conviction"
        DISCIPLINE_CONDUCT = "discipline_conduct", "Discipline/Conduct"
        ABSENTEE_OFFENCES = "absentee_offences", "Absentee offences"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    class BookOutStatus(models.TextChoices):
        NOT_REQUESTED = "not_requested", "Not Requested"
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    case = models.ForeignKey("cases.Case", on_delete=models.CASCADE, related_name="guardroom_requests")
    guardroom = models.ForeignKey(Guardroom, on_delete=models.PROTECT, related_name="placement_requests")
    reason = models.CharField(max_length=30, choices=Reason.choices)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="guardroom_placement_requests",
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_guardroom_placement_requests",
    )
    booked_in_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="booked_guardroom_placement_requests",
    )
    book_out_requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="book_out_guardroom_placement_requests",
    )
    book_out_reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_book_out_guardroom_placement_requests",
    )
    released_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="released_guardroom_placement_requests",
    )
    reviewer_comments = EncryptedTextField(blank=True)
    rejection_reason = EncryptedTextField(blank=True)
    book_out_status = models.CharField(
        max_length=20,
        choices=BookOutStatus.choices,
        default=BookOutStatus.NOT_REQUESTED,
    )
    book_out_comments = EncryptedTextField(blank=True)
    book_out_rejection_reason = EncryptedTextField(blank=True)
    release_letter = models.FileField(upload_to=release_letter_path, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    booked_in_at = models.DateTimeField(null=True, blank=True)
    book_out_requested_at = models.DateTimeField(null=True, blank=True)
    book_out_reviewed_at = models.DateTimeField(null=True, blank=True)
    released_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "guardroom_placement_requests"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.case} -> {self.guardroom} ({self.status})"
