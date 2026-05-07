from django.db import models
from django.conf import settings


class Guardroom(models.Model):
    name = models.CharField(max_length=100)
    unit = models.OneToOneField(
        "formations.Unit", null=True, blank=True, on_delete=models.SET_NULL, related_name="guardroom"
    )
    capacity = models.PositiveIntegerField(default=0)
    location = models.CharField(max_length=150, blank=True)
    phone_no = models.CharField(max_length=30, blank=True)
    ic = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="guardroom_commanded",
    )
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
