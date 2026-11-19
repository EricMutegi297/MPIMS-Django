from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.admin.forms import AdminAuthenticationForm
from django import forms
from django.core.exceptions import ValidationError
import secrets
from .tokens import revoke_user_sessions
from .models import EmailOTPLoginChallenge, LoginThrottle, TOTPDevice, TOTPLoginChallenge, User
from .views import (
    email_otp_code_length,
    email_otp_hash,
    email_otp_resend_seconds_remaining,
    get_usable_email_otp_challenge,
    masked_email,
    normalize_email_otp_code,
    send_email_otp_login_code,
    create_email_otp_login_challenge,
    verify_totp_device,
)


ADMIN_EMAIL_OTP_SESSION_KEY = "admin_email_otp_challenge"


class MFAAdminAuthenticationForm(AdminAuthenticationForm):
    totp_code = forms.CharField(
        label="Google Authenticator code",
        max_length=6,
        required=False,
        widget=forms.PasswordInput,
    )
    email_otp_code = forms.CharField(
        label="Email verification code",
        max_length=8,
        required=False,
        widget=forms.PasswordInput,
        help_text="Superusers: enter the code sent to your registered email address.",
    )

    def confirm_login_allowed(self, user):
        super().confirm_login_allowed(user)
        if user.is_superuser:
            self._confirm_email_otp(user)
            return

        try:
            device = user.totp_device
        except TOTPDevice.DoesNotExist as exc:
            raise ValidationError("Configure Google Authenticator through MPIMS before using admin.") from exc
        if not device.confirmed:
            raise ValidationError("Confirm Google Authenticator through MPIMS before using admin.")
        valid, message = verify_totp_device(device, self.cleaned_data["totp_code"], self.request)
        if not valid:
            raise ValidationError(message)

    def _confirm_email_otp(self, user):
        session_challenge = self.request.session.get(ADMIN_EMAIL_OTP_SESSION_KEY, {})
        challenge = None
        if session_challenge.get("user_id") == user.pk:
            challenge = get_usable_email_otp_challenge(session_challenge.get("challenge_id"))

        if challenge and challenge.user_id != user.pk:
            challenge = None
        if not user.email:
            self.request.session.pop(ADMIN_EMAIL_OTP_SESSION_KEY, None)
            raise ValidationError("A registered email address is required for superuser sign-in.")

        code = normalize_email_otp_code(self.cleaned_data.get("email_otp_code"))
        if not challenge:
            retry_after = email_otp_resend_seconds_remaining(user)
            if retry_after:
                raise ValidationError(
                    f"A verification code was sent recently. Try again in {retry_after} seconds."
                )
            challenge, generated_code = create_email_otp_login_challenge(user)
            if not send_email_otp_login_code(user, generated_code):
                challenge.delete()
                self.request.session.pop(ADMIN_EMAIL_OTP_SESSION_KEY, None)
                raise ValidationError("Could not send the email verification code. Please try again later.")
            self.request.session[ADMIN_EMAIL_OTP_SESSION_KEY] = {
                "user_id": user.pk,
                "challenge_id": challenge.challenge_id,
            }
            raise ValidationError(
                f"Verification code sent to {masked_email(user.email)}. Enter it and submit your credentials again."
            )

        if len(code) != email_otp_code_length():
            raise ValidationError("Enter the email verification code.")
        expected_hash = email_otp_hash(user, challenge.challenge_id, code)
        if not secrets.compare_digest(expected_hash, challenge.code_hash):
            challenge.attempts = min(99, int(challenge.attempts or 0) + 1)
            challenge.save(update_fields=["attempts"])
            raise ValidationError("Invalid email verification code.")

        challenge.consume()
        self.request.session.pop(ADMIN_EMAIL_OTP_SESSION_KEY, None)
        self.request.session["mfa_method"] = "email_otp"


admin.site.login_form = MFAAdminAuthenticationForm


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
