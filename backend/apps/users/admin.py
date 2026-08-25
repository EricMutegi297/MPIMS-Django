from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import EmailOTPLoginChallenge, LoginThrottle, TOTPDevice, TOTPLoginChallenge, User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = (
        "service_number", "name", "rank", "role", "unit",
        "is_active", "mfa_exempt", "email_otp_enabled",
    )
    list_filter = ("role", "is_active", "mfa_exempt", "email_otp_enabled", "formation")
    search_fields = ("service_number", "name", "email")
    ordering = ("name",)
    fieldsets = (
        (None, {"fields": ("service_number", "password")}),
        ("Personal", {"fields": ("name", "rank", "email")}),
        ("Organisation", {"fields": ("role", "unit", "battalion", "formation", "detachment")}),
        ("Flags", {"fields": ("is_active", "is_staff", "is_superuser", "must_change_password")}),
        ("MFA", {"fields": ("mfa_exempt", "email_otp_enabled")}),
    )
    add_fieldsets = (
        (None, {
            "classes": ("wide",),
            "fields": ("service_number", "name", "rank", "role", "password1", "password2"),
        }),
    )


@admin.register(TOTPDevice)
class TOTPDeviceAdmin(admin.ModelAdmin):
    list_display = ("user", "confirmed", "failed_attempts", "locked_until", "created_at", "last_used_at")
    list_filter = ("confirmed", "locked_until")
    search_fields = ("user__service_number", "user__name")
    readonly_fields = (
        "user", "confirmed", "failed_attempts", "locked_until", "created_at",
        "confirmed_at", "last_used_at", "last_used_ip",
    )


@admin.register(TOTPLoginChallenge)
class TOTPLoginChallengeAdmin(admin.ModelAdmin):
    list_display = ("user", "expires_at", "attempts", "consumed_at", "created_at")
    list_filter = ("consumed_at",)
    search_fields = ("user__service_number", "user__name")
    readonly_fields = ("user", "challenge_id", "expires_at", "attempts", "consumed_at", "created_at")


@admin.register(EmailOTPLoginChallenge)
class EmailOTPLoginChallengeAdmin(admin.ModelAdmin):
    list_display = ("user", "sent_to", "expires_at", "attempts", "consumed_at", "created_at")
    list_filter = ("consumed_at",)
    search_fields = ("user__service_number", "user__name", "sent_to")
    readonly_fields = (
        "user", "challenge_id", "code_hash", "sent_to",
        "expires_at", "attempts", "consumed_at", "created_at",
    )


@admin.register(LoginThrottle)
class LoginThrottleAdmin(admin.ModelAdmin):
    list_display = ("scope", "failed_attempts", "locked_until", "first_failed_at", "last_failed_at", "last_success_at")
    list_filter = ("scope", "locked_until")
    search_fields = ("label", "key_hash")
    readonly_fields = (
        "scope", "key_hash", "label", "failed_attempts", "first_failed_at",
        "last_failed_at", "locked_until", "last_success_at", "created_at", "updated_at",
    )
