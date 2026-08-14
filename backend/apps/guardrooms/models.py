from django.db import models
from django.conf import settings


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
    current_strength = models.PositiveIntegerField(default=0)
    established_strength = models.PositiveIntegerField(default=0)
    capacity = models.PositiveIntegerField(default=0, help_text="Total detainee capacity")
    detainee_count = models.PositiveIntegerField(default=0, help_text="Current number of detainees")
    location = models.CharField(max_length=150, blank=True)
    phone_no = models.CharField(max_length=30, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "guardrooms"
        ordering = ["name"]

    @property
    def vacant_slots(self):
        return max(0, self.capacity - self.detainee_count)

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


class DetaineeRequest(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"
        BOOKED_IN = "booked_in", "Booked In"
        BOOKED_OUT = "booked_out", "Booked Out"

    case = models.ForeignKey(
        "cases.Case",
        on_delete=models.CASCADE,
        related_name="detainee_requests",
    )
    guardroom = models.ForeignKey(
        Guardroom,
        on_delete=models.CASCADE,
        related_name="detainee_requests",
    )
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="guardroom_requests_made",
    )

    # ── Committal Receipt 1 fields (filled by investigator when requesting) ───
    accused_no = models.CharField(max_length=30, blank=True)
    accused_rank = models.CharField(max_length=60, blank=True)
    accused_name = models.CharField(max_length=120, blank=True)
    accused_unit = models.CharField(max_length=100, blank=True)
    accused_offence = models.CharField(max_length=200, blank=True)
    guard_commander_date = models.DateField(null=True, blank=True)
    guard_commander_time = models.CharField(max_length=10, blank=True)
    location = models.CharField(max_length=150, blank=True)
    handed_by_name = models.CharField(max_length=120, blank=True)
    handed_by_rank = models.CharField(max_length=60, blank=True)

    # ── Status / approval ────────────────────────────────────────────────────
    status = models.CharField(max_length=15, choices=Status.choices, default=Status.PENDING)
    rejection_reason = models.TextField(blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="guardroom_requests_reviewed",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)

    # ── Committal Receipt 2 fields (filled by Guardroom IC on Book In) ───────
    offence_description = models.CharField(max_length=200, blank=True)
    offence_at = models.CharField(max_length=150, blank=True)
    offence_date = models.DateField(null=True, blank=True)
    offence_time = models.CharField(max_length=10, blank=True)
    book_in_signed_name = models.CharField(max_length=120, blank=True)
    book_in_signed_unit = models.CharField(max_length=100, blank=True)
    book_in_signed_no = models.CharField(max_length=30, blank=True)
    book_in_signed_rank = models.CharField(max_length=60, blank=True)
    book_in_date = models.DateField(null=True, blank=True)
    booked_in_at = models.DateTimeField(null=True, blank=True)

    # ── Book Out ─────────────────────────────────────────────────────────────
    booked_out_at = models.DateTimeField(null=True, blank=True)
    book_out_reason = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "detainee_requests"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Request #{self.id} – {self.case} → {self.guardroom} [{self.status}]"
