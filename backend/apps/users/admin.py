from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ("service_number", "name", "rank", "role", "unit", "is_active", "mfa_enabled")
    list_filter = ("role", "is_active", "mfa_enabled", "formation")
    search_fields = ("service_number", "name", "email")
    ordering = ("name",)
    fieldsets = (
        (None, {"fields": ("service_number", "password")}),
        ("Personal", {"fields": ("name", "rank", "email")}),
        ("Organisation", {"fields": ("role", "unit", "battalion", "formation", "detachment")}),
        ("Flags", {"fields": ("is_active", "is_staff", "is_superuser", "must_change_password", "mfa_enabled")}),
        ("MFA", {"fields": ("mfa_secret",)}),
    )
    add_fieldsets = (
        (None, {
            "classes": ("wide",),
            "fields": ("service_number", "name", "rank", "role", "password1", "password2"),
        }),
    )
