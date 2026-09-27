from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.admin.forms import AdminAuthenticationForm
from django import forms
from django.core.exceptions import ValidationError
from .tokens import revoke_user_sessions
from .models import EmailOTPLoginChallenge, LoginThrottle, TOTPDevice, TOTPLoginChallenge, User
from .views import verify_totp_device


class TOTPAdminAuthenticationForm(AdminAuthenticationForm):
    totp_code = forms.CharField(
        label="Google Authenticator code",
        max_length=6,
        widget=forms.PasswordInput,
    )

    def confirm_login_allowed(self, user):
        super().confirm_login_allowed(user)
        try:
            device = user.totp_device
        except TOTPDevice.DoesNotExist as exc:
            raise ValidationError("Configure Google Authenticator through MPIMS before using admin.") from exc
        if not device.confirmed:
            raise ValidationError("Confirm Google Authenticator through MPIMS before using admin.")
        valid, message = verify_totp_device(device, self.cleaned_data["totp_code"], self.request)
        if not valid:
            raise ValidationError(message)


admin.site.login_form = TOTPAdminAuthenticationForm


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = (
        "service_number", "name", "rank", "role", "unit", "is_active",
    )
    list_filter = ("role", "is_active", "formation")
    search_fields = ("service_number", "name", "email")
    ordering = ("name",)
    fieldsets = (
        (None, {"fields": ("service_number", "password")}),
        ("Personal", {"fields": ("name", "rank", "email")}),
        ("Organisation", {"fields": ("role", "unit", "battalion", "formation", "detachment")}),
        ("Flags", {"fields": ("is_active", "is_staff", "is_superuser", "must_change_password")}),
    )
    add_fieldsets = (
        (None, {
            "classes": ("wide",),
            "fields": ("service_number", "name", "rank", "role", "password1", "password2"),
        }),
    )

    def save_model(self, request, obj, form, change):
        previous = (
            User.objects.filter(pk=obj.pk)
            .values("is_active")
            .first()
            if change
            else None
        )
        super().save_model(request, obj, form, change)
        if previous and previous["is_active"] and not obj.is_active:
            revoke_user_sessions(obj)


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
