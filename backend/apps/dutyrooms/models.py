from django.conf import settings
from django.db import models
from django.utils import timezone


class DutyRoster(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PENDING_APPROVAL = "pending_approval", "Pending Approval"
        RETURNED = "returned", "Returned for Correction"
        DECLINED = "declined", "Declined"
        APPROVED = "approved", "Approved"
        PUBLISHED = "published", "Published"
        CLOSED = "closed", "Closed"

    title = models.CharField(max_length=150)
    battalion = models.ForeignKey(
        "formations.Battalion",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="duty_rosters",
    )
    detachment = models.ForeignKey(
        "formations.Detachment",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="duty_rosters",
    )
    start_date = models.DateField()
    end_date = models.DateField()
    part_one_order_year = models.PositiveSmallIntegerField(null=True, blank=True, editable=False)
    part_one_order_sequence = models.PositiveIntegerField(null=True, blank=True, editable=False)
    status = models.CharField(max_length=25, choices=Status.choices, default=Status.DRAFT)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_duty_rosters",
    )
    forwarded_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="duty_rosters_for_approval",
    )
    forwarded_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="approved_duty_rosters",
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    approval_note = models.TextField(blank=True)
    returned_reason = models.TextField(blank=True)
    declined_reason = models.TextField(blank=True)
    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="published_duty_rosters",
    )
    published_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "duty_rosters"
        ordering = ["-start_date", "-created_at"]

    def __str__(self):
        return self.title

    @property
    def is_complete(self):
        posts = list(self.posts.all())
        return bool(posts) and all(post.assigned_count >= post.required_personnel for post in posts)

    @property
    def unit_label(self):
        if self.detachment:
            return self.detachment.name
        if self.battalion:
            return self.battalion.name
        return "Unscoped"


class DutyRosterPost(models.Model):
    class DutyType(models.TextChoices):
        TWELVE_HOUR = "12h", "12 Hours"
        TWENTY_FOUR_HOUR = "24h", "24 Hours"
        WEEKLY = "weekly", "Weekly"
        CUSTOM = "custom", "Custom"

    roster = models.ForeignKey(DutyRoster, on_delete=models.CASCADE, related_name="posts")
    post_name = models.CharField(max_length=120)
    duty_type = models.CharField(max_length=20, choices=DutyType.choices, default=DutyType.TWENTY_FOUR_HOUR)
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    required_personnel = models.PositiveSmallIntegerField(default=1)
    notes = models.TextField(blank=True)
    assigned_personnel = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        through="DutyRosterAssignment",
        related_name="duty_roster_posts",
        blank=True,
    )

    class Meta:
        db_table = "duty_roster_posts"
        ordering = ["starts_at", "post_name"]

    def __str__(self):
        return f"{self.post_name} - {self.roster}"

    @property
    def assigned_count(self):
        return self.assignments.count()

    @property
    def is_filled(self):
        return self.assigned_count >= self.required_personnel


class DutyRosterAssignment(models.Model):
    roster_post = models.ForeignKey(DutyRosterPost, on_delete=models.CASCADE, related_name="assignments")
    personnel = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="duty_assignments")
    assigned_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "duty_roster_assignments"
        unique_together = [("roster_post", "personnel")]
        ordering = ["roster_post__starts_at", "personnel__name"]

    def __str__(self):
        return f"{self.personnel} - {self.roster_post}"


class OccurrenceBook(models.Model):
    class Status(models.TextChoices):
        OPEN = "open", "Open"
        CLOSED = "closed", "Closed"

    date = models.DateField(default=timezone.localdate)
    battalion = models.ForeignKey(
        "formations.Battalion",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="occurrence_books",
    )
    detachment = models.ForeignKey(
        "formations.Detachment",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="occurrence_books",
    )
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.OPEN)
    opened_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="opened_occurrence_books",
    )
    closed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="closed_occurrence_books",
    )
    closed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "occurrence_books"
        ordering = ["-date", "-created_at"]

    def __str__(self):
        return f"OB {self.date} - {self.detachment or self.battalion}"


class OccurrenceEntry(models.Model):
    class EntryType(models.TextChoices):
        ROUTINE = "routine", "Routine"
        INCIDENT = "incident", "Incident"
        ROAD_TRAFFIC_ACCIDENT = "road_traffic_accident", "Road Traffic Accident"
        MESSAGE = "message", "Message"
        ORDER = "order", "Order"
        MOVEMENT = "movement", "Movement"
        VISITOR = "visitor", "Visitor"
        GUARDROOM = "guardroom", "Guardroom"
        OTHER = "other", "Other"

    class RoadTrafficType(models.TextChoices):
        INJURY = "injury", "Injury Road Traffic Accident"
        NON_INJURY = "non_injury", "Non-Injury Road Traffic Accident"
        SELF_INVOLVED = "self_involved", "Self Involved Road Traffic Accident"
        FATAL = "fatal", "Fatal Road Traffic Accident"
        HIT_AND_RUN = "hit_and_run", "Hit and Run Road Traffic Accident"

    class InjurySeverity(models.TextChoices):
        MINOR = "minor", "Minor"
        SERIOUS = "serious", "Serious"
        CRITICAL = "critical", "Critical"

    class Status(models.TextChoices):
        RECORDED = "recorded", "Recorded"
        CONVERTED_TO_INCIDENT = "converted_to_incident", "Converted to Incident"

    book = models.ForeignKey(OccurrenceBook, on_delete=models.CASCADE, related_name="entries")
    serial_no = models.PositiveIntegerField()
    occurred_at = models.DateTimeField(default=timezone.now)
    entry_type = models.CharField(max_length=25, choices=EntryType.choices, default=EntryType.ROUTINE)
    road_traffic_type = models.CharField(max_length=30, choices=RoadTrafficType.choices, blank=True)
    injured_count = models.PositiveIntegerField(null=True, blank=True)
    dead_count = models.PositiveIntegerField(null=True, blank=True)
    injury_severity = models.CharField(max_length=20, choices=InjurySeverity.choices, blank=True)
    incident_title = models.CharField(max_length=160, blank=True)
    place = models.CharField(max_length=200, blank=True)
    service_vehicle = models.CharField(max_length=120, blank=True)
    unit_involved = models.CharField(max_length=160, blank=True)
    originating_unit = models.CharField(max_length=160, blank=True)
    civilian = models.CharField(max_length=200, blank=True)
    service_member = models.CharField(max_length=200, blank=True)
    description = models.TextField()
    history = models.TextField(blank=True)
    injuries = models.TextField(blank=True)
    damages = models.TextField(blank=True)
    how_occurred = models.TextField(blank=True)
    action_taken = models.TextField(blank=True)
    police_ob_reference = models.CharField(max_length=160, blank=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="recorded_occurrence_entries",
    )
    requires_investigation = models.BooleanField(default=False)
    status = models.CharField(max_length=30, choices=Status.choices, default=Status.RECORDED)
    linked_incident = models.OneToOneField(
        "incidents.Incident",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="source_ob_entry",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "occurrence_entries"
        unique_together = [("book", "serial_no")]
        ordering = ["-occurred_at", "-serial_no"]

    def __str__(self):
        return f"OB {self.book.date}/{self.serial_no}"
