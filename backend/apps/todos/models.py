from django.conf import settings
from django.db import models


class TodoEvent(models.Model):
    class Scope(models.TextChoices):
        BATTALION = "battalion", "Battalion"
        CORPS = "corps", "Corps"

    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    event_date = models.DateField()
    event_time = models.TimeField(null=True, blank=True)
    location = models.CharField(max_length=200, blank=True)
    scope = models.CharField(max_length=20, choices=Scope.choices)
    battalion = models.ForeignKey(
        "formations.Battalion",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="todo_events",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_todo_events",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="updated_todo_events",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "todo_events"
        ordering = ["event_date", "event_time", "title"]
        indexes = [
            models.Index(fields=["scope", "event_date"]),
            models.Index(fields=["battalion", "event_date"]),
        ]

    @property
    def is_finished(self):
        from django.utils import timezone
        return self.event_date < timezone.localdate()

    @property
    def days_until(self):
        from django.utils import timezone
        return (self.event_date - timezone.localdate()).days

    def __str__(self):
        return f"{self.title} ({self.event_date})"
