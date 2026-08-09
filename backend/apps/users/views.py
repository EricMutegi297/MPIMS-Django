import base64
import hashlib
import hmac
import io
import secrets
from datetime import timedelta

import pyotp
import qrcode
from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework import status, generics, permissions
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from apps.notifications.models import Notification

from .models import LoginThrottle, TOTPDevice, TOTPLoginChallenge, User
from .access import has_global_read_access, is_admin_hqs, is_battalion_admin, is_detachment_ic, is_hqs_admin
from .serializers import (
    ChangePasswordSerializer,
    LoginSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    UserCreateSerializer,
    UserSerializer,
)

# Roles a battalion admin can assign
BATTALION_ADMIN_ROLES = {"co", "oc", "detachment", "personnel", "investigator", "hod", "adj", "2ic", "order_nco"}
# Roles an IC COY can assign
DET_IC_ROLES = {"personnel", "investigator"}
CORPS_COMMANDER_MANAGEMENT_ERROR = (
    "Corps Commander accounts can only be managed by a superuser or HQS Admin."
)


def can_manage_corps_commander_account(user):
    return bool(user and user.is_authenticated and (user.is_superuser or is_admin_hqs(user)))


def password_setup_url(user):
    frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:3000").rstrip("/")
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    return f"{frontend_url}/reset-password/{uid}/{token}"


def send_password_setup_email(user, subject, intro):
    setup_url = password_setup_url(user)
    message = (
        f"Dear {user.rank + ' ' if user.rank else ''}{user.name},\n\n"
        f"{intro}\n\n"
        f"Service number: {user.service_number}\n"
        f"Set password link: {setup_url}\n\n"
        "Open the link and choose your password. If you did not expect this message, contact your MPIMS administrator."
    )
    try:
        return bool(send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=False,
        ))
    except Exception:
        return False


def email_delivery_mode():
    backend = str(getattr(settings, "EMAIL_BACKEND", ""))
    if backend.endswith("console.EmailBackend"):
        return "console"
    return "email"


def totp_required_for_user(user):
    return bool(user and getattr(settings, "TOTP_REQUIRED", True))


def totp_issuer_name():
    return getattr(settings, "TOTP_ISSUER_NAME", "MPIMS")


def totp_code_window():
    return max(0, int(getattr(settings, "TOTP_CODE_WINDOW", 1)))


def totp_setup_lifetime():
    minutes = int(getattr(settings, "TOTP_SETUP_TOKEN_LIFETIME_MINUTES", 30))
    return timedelta(minutes=max(5, minutes))


def totp_lockout_minutes():
    try:
        return max(1, int(getattr(settings, "TOTP_LOCKOUT_MINUTES", 15)))
    except (TypeError, ValueError):
        return 15


def totp_lockout_duration():
    return timedelta(minutes=totp_lockout_minutes())


def totp_lockout_message():
    return f"Too many wrong codes. Try again after {totp_lockout_minutes()} minutes."


def get_totp_device(user):
    try:
        return user.totp_device
    except TOTPDevice.DoesNotExist:
        return None


def get_confirmed_totp_device(user):
    device = get_totp_device(user)
    if device and device.confirmed:
        return device
    return None


def user_has_confirmed_totp(user):
    return get_confirmed_totp_device(user) is not None


def issue_auth_tokens(user, *, mfa_pending=False):
    refresh = RefreshToken.for_user(user)
    if mfa_pending:
        refresh["mfa_pending"] = True
        refresh["mfa_reason"] = "totp_setup"
        refresh.set_exp(lifetime=totp_setup_lifetime())
        access = refresh.access_token
        access["mfa_pending"] = True
        access["mfa_reason"] = "totp_setup"
        access.set_exp(lifetime=totp_setup_lifetime())
        return {
            "access": str(access),
            "refresh": str(refresh),
        }
    return {
        "access": str(refresh.access_token),
        "refresh": str(refresh),
    }


def authenticated_payload(user, *, mfa_pending=False):
    setup_required = totp_required_for_user(user) and not user_has_confirmed_totp(user)
    return {
        "user": UserSerializer(user).data,
        "mustChangePassword": user.must_change_password,
        "requiresTotp": False,
        "totpSetupRequired": setup_required,
        **issue_auth_tokens(user, mfa_pending=mfa_pending),
    }


def client_ip(request):
    forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip() or None
    return request.META.get("REMOTE_ADDR") or None


def positive_int_setting(name, default):
    try:
        return max(1, int(getattr(settings, name, default)))
    except (TypeError, ValueError):
        return default


def login_failure_limit(scope):
    if scope == LoginThrottle.Scope.IP:
        return positive_int_setting("LOGIN_IP_FAILURE_LIMIT", 25)
    return positive_int_setting("LOGIN_FAILURE_LIMIT", 5)


def login_failure_window():
    return timedelta(minutes=positive_int_setting("LOGIN_FAILURE_WINDOW_MINUTES", 15))


def login_lockout_duration():
    return timedelta(minutes=positive_int_setting("LOGIN_LOCKOUT_MINUTES", 15))


def normalize_login_service_number(value):
    return str(value or "").strip().lower()


def login_throttle_hash(scope, value):
    secret = str(getattr(settings, "SECRET_KEY", "mpims")).encode("utf-8")
    payload = f"{scope}:{value}".encode("utf-8")
    return hmac.new(secret, payload, hashlib.sha256).hexdigest()


def login_throttle_targets(service_number, ip_address, *, reset_after_success=False):
    service_key = normalize_login_service_number(service_number)
    service_label = str(service_number or "").strip()
    ip_label = str(ip_address or "").strip()
    targets = []

    if service_key:
        targets.append({
            "scope": LoginThrottle.Scope.ACCOUNT,
            "key": service_key,
            "label": f"service number {service_label}",
        })
    if ip_label and not reset_after_success:
        targets.append({
            "scope": LoginThrottle.Scope.IP,
            "key": ip_label,
            "label": f"IP {ip_label}",
        })
    if service_key and ip_label:
        targets.append({
            "scope": LoginThrottle.Scope.ACCOUNT_IP,
            "key": f"{service_key}|{ip_label}",
            "label": f"service number {service_label} from IP {ip_label}",
        })

    for target in targets:
        target["key_hash"] = login_throttle_hash(target["scope"], target["key"])
        target["limit"] = login_failure_limit(target["scope"])
    return targets


def current_login_lockout(service_number, ip_address):
    now = timezone.now()
    locked_until = None
    for target in login_throttle_targets(service_number, ip_address):
        try:
            throttle = LoginThrottle.objects.get(scope=target["scope"], key_hash=target["key_hash"])
        except LoginThrottle.DoesNotExist:
            continue

        if throttle.locked_until and throttle.locked_until <= now:
            throttle.failed_attempts = 0
            throttle.first_failed_at = None
            throttle.locked_until = None
            throttle.save(update_fields=["failed_attempts", "first_failed_at", "locked_until", "updated_at"])
            continue

        if throttle.locked_until and (locked_until is None or throttle.locked_until > locked_until):
            locked_until = throttle.locked_until
    return locked_until


def login_lockout_response(locked_until):
    remaining_seconds = max(1, int((locked_until - timezone.now()).total_seconds())) if locked_until else 1
    remaining_minutes = max(1, (remaining_seconds + 59) // 60)
    return Response(
        {
            "detail": f"Too many failed login attempts. Try again after {remaining_minutes} minutes.",
            "retry_after_seconds": remaining_seconds,
        },
        status=status.HTTP_429_TOO_MANY_REQUESTS,
    )


def record_login_failure(service_number, ip_address):
    now = timezone.now()
    window_start = now - login_failure_window()
    newly_locked_until = None

    with transaction.atomic():
        for target in login_throttle_targets(service_number, ip_address):
            try:
                throttle = LoginThrottle.objects.select_for_update().get(
                    scope=target["scope"],
                    key_hash=target["key_hash"],
                )
            except LoginThrottle.DoesNotExist:
                throttle = LoginThrottle(scope=target["scope"], key_hash=target["key_hash"])

            if throttle.locked_until and throttle.locked_until > now:
                continue

            throttle.label = target["label"]
            if not throttle.first_failed_at or throttle.first_failed_at < window_start:
                throttle.failed_attempts = 1
                throttle.first_failed_at = now
                throttle.locked_until = None
            else:
                throttle.failed_attempts = min(99, int(throttle.failed_attempts or 0) + 1)

            throttle.last_failed_at = now
            if throttle.failed_attempts >= target["limit"]:
                throttle.locked_until = now + login_lockout_duration()
                if newly_locked_until is None or throttle.locked_until > newly_locked_until:
                    newly_locked_until = throttle.locked_until
            throttle.save()

    return newly_locked_until


def reset_login_failures(service_number, ip_address):
    now = timezone.now()
    for target in login_throttle_targets(service_number, ip_address, reset_after_success=True):
        LoginThrottle.objects.filter(
            scope=target["scope"],
            key_hash=target["key_hash"],
        ).update(
            failed_attempts=0,
            first_failed_at=None,
            locked_until=None,
            last_success_at=now,
            updated_at=now,
        )


def current_throttle_lockout(targets):
    now = timezone.now()
    locked_until = None
    for target in targets:
        try:
            throttle = LoginThrottle.objects.get(scope=target["scope"], key_hash=target["key_hash"])
        except LoginThrottle.DoesNotExist:
            continue

        if throttle.locked_until and throttle.locked_until <= now:
            throttle.failed_attempts = 0
            throttle.first_failed_at = None
            throttle.locked_until = None
            throttle.save(update_fields=["failed_attempts", "first_failed_at", "locked_until", "updated_at"])
            continue

        if throttle.locked_until and (locked_until is None or throttle.locked_until > locked_until):
            locked_until = throttle.locked_until
    return locked_until


def record_throttle_attempt(targets, *, window, lockout_duration, lock_when_exceeded=False):
    now = timezone.now()
    window_start = now - window
    newly_locked_until = None

    with transaction.atomic():
        for target in targets:
            try:
                throttle = LoginThrottle.objects.select_for_update().get(
                    scope=target["scope"],
                    key_hash=target["key_hash"],
                )
            except LoginThrottle.DoesNotExist:
                throttle = LoginThrottle(scope=target["scope"], key_hash=target["key_hash"])

            if throttle.locked_until and throttle.locked_until > now:
                continue

            throttle.label = target["label"]
            if not throttle.first_failed_at or throttle.first_failed_at < window_start:
                throttle.failed_attempts = 1
                throttle.first_failed_at = now
                throttle.locked_until = None
            else:
                throttle.failed_attempts = min(99, int(throttle.failed_attempts or 0) + 1)

            throttle.last_failed_at = now
            if lock_when_exceeded:
                over_limit = throttle.failed_attempts > target["limit"]
            else:
                over_limit = throttle.failed_attempts >= target["limit"]
            if over_limit:
                throttle.locked_until = now + lockout_duration
                if newly_locked_until is None or throttle.locked_until > newly_locked_until:
                    newly_locked_until = throttle.locked_until
            throttle.save()

    return newly_locked_until


def reset_throttle_attempts(targets):
    now = timezone.now()
    for target in targets:
        LoginThrottle.objects.filter(
            scope=target["scope"],
            key_hash=target["key_hash"],
        ).update(
            failed_attempts=0,
            first_failed_at=None,
            locked_until=None,
            last_success_at=now,
            updated_at=now,
        )


def throttle_lockout_response(message, locked_until):
    remaining_seconds = max(1, int((locked_until - timezone.now()).total_seconds())) if locked_until else 1
    remaining_minutes = max(1, (remaining_seconds + 59) // 60)
    response = Response(
        {
            "detail": f"{message} Try again after {remaining_minutes} minutes.",
            "retry_after_seconds": remaining_seconds,
        },
        status=status.HTTP_429_TOO_MANY_REQUESTS,
    )
    response["Retry-After"] = str(remaining_seconds)
    return response


def normalize_password_reset_email(value):
    return str(value or "").strip().lower()


def password_reset_request_limit(scope):
    if scope == LoginThrottle.Scope.PASSWORD_RESET_IP:
        return positive_int_setting("PASSWORD_RESET_IP_RATE_LIMIT", 10)
    return positive_int_setting("PASSWORD_RESET_RATE_LIMIT", 3)


def password_reset_request_window():
    return timedelta(minutes=positive_int_setting("PASSWORD_RESET_RATE_WINDOW_MINUTES", 15))


def password_reset_request_lockout_duration():
    return timedelta(minutes=positive_int_setting("PASSWORD_RESET_LOCKOUT_MINUTES", 15))


def password_reset_request_targets(email, ip_address):
    email_key = normalize_password_reset_email(email)
    email_label = str(email or "").strip()
    ip_label = str(ip_address or "").strip()
    targets = []

    if email_key:
        targets.append({
            "scope": LoginThrottle.Scope.PASSWORD_RESET_EMAIL,
            "key": email_key,
            "label": f"password reset email {email_label}",
        })
    if ip_label:
        targets.append({
            "scope": LoginThrottle.Scope.PASSWORD_RESET_IP,
            "key": ip_label,
            "label": f"password reset IP {ip_label}",
        })

    for target in targets:
        target["key_hash"] = login_throttle_hash(target["scope"], target["key"])
        target["limit"] = password_reset_request_limit(target["scope"])
    return targets


def current_password_reset_request_lockout(email, ip_address):
    return current_throttle_lockout(password_reset_request_targets(email, ip_address))


def record_password_reset_request(email, ip_address):
    return record_throttle_attempt(
        password_reset_request_targets(email, ip_address),
        window=password_reset_request_window(),
        lockout_duration=password_reset_request_lockout_duration(),
        lock_when_exceeded=True,
    )


def password_reset_confirm_limit(scope):
    if scope == LoginThrottle.Scope.PASSWORD_RESET_CONFIRM_IP:
        return positive_int_setting("PASSWORD_RESET_CONFIRM_IP_FAILURE_LIMIT", 50)
    return positive_int_setting("PASSWORD_RESET_CONFIRM_FAILURE_LIMIT", 10)


def password_reset_confirm_window():
    return timedelta(minutes=positive_int_setting("PASSWORD_RESET_CONFIRM_WINDOW_MINUTES", 15))


def password_reset_confirm_lockout_duration():
    return timedelta(minutes=positive_int_setting("PASSWORD_RESET_CONFIRM_LOCKOUT_MINUTES", 15))


def normalize_password_reset_uid(value):
    return str(value or "").strip().lower()


def password_reset_confirm_targets(uid, ip_address):
    uid_key = normalize_password_reset_uid(uid)
    uid_label = str(uid or "").strip()[:120]
    ip_label = str(ip_address or "").strip()
    targets = []

    if uid_key:
        targets.append({
            "scope": LoginThrottle.Scope.PASSWORD_RESET_CONFIRM_UID,
            "key": uid_key,
            "label": f"password reset UID {uid_label}",
        })
    if ip_label:
        targets.append({
            "scope": LoginThrottle.Scope.PASSWORD_RESET_CONFIRM_IP,
            "key": ip_label,
            "label": f"password reset confirm IP {ip_label}",
        })

    for target in targets:
        target["key_hash"] = login_throttle_hash(target["scope"], target["key"])
        target["limit"] = password_reset_confirm_limit(target["scope"])
    return targets


def current_password_reset_confirm_lockout(uid, ip_address):
    return current_throttle_lockout(password_reset_confirm_targets(uid, ip_address))


def record_password_reset_confirm_failure(uid, ip_address):
    return record_throttle_attempt(
        password_reset_confirm_targets(uid, ip_address),
        window=password_reset_confirm_window(),
        lockout_duration=password_reset_confirm_lockout_duration(),
    )


def reset_password_reset_confirm_failures(uid, ip_address):
    reset_throttle_attempts(password_reset_confirm_targets(uid, ip_address))


def security_alert_recipients():
    return User.objects.filter(is_active=True).filter(
        Q(is_superuser=True)
        | Q(role=User.Role.MPC_HQS)
        | Q(role=User.Role.ADMIN, battalion__battalion_type="hqs")
    ).distinct()


def notify_login_lockout(service_number, ip_address, locked_until):
    recipients = list(security_alert_recipients())
    if not recipients:
        return

    remaining_seconds = max(1, int((locked_until - timezone.now()).total_seconds())) if locked_until else 1
    remaining_minutes = max(1, (remaining_seconds + 59) // 60)
    service_label = str(service_number or "").strip() or "unknown service number"
    ip_label = str(ip_address or "").strip() or "unknown IP"
    message = (
        "Security alert: repeated failed login attempts temporarily locked sign-in "
        f"for {service_label} from {ip_label} for {remaining_minutes} minutes."
    )
    Notification.objects.bulk_create([
        Notification(
            recipient=recipient,
            message=message,
            notification_type=Notification.Type.ALERT,
            related_model="LoginThrottle",
        )
        for recipient in recipients
    ])


def notify_totp_lockout(user, ip_address, locked_until):
    recipients = list(security_alert_recipients())
    if not recipients:
        return

    remaining_seconds = max(1, int((locked_until - timezone.now()).total_seconds())) if locked_until else 1
    remaining_minutes = max(1, (remaining_seconds + 59) // 60)
    service_label = getattr(user, "service_number", "") or "unknown service number"
    ip_label = str(ip_address or "").strip() or "unknown IP"
    message = (
        "Security alert: repeated wrong Google Authenticator codes temporarily locked MFA "
        f"for {service_label} from {ip_label} for {remaining_minutes} minutes."
    )
    Notification.objects.bulk_create([
        Notification(
            recipient=recipient,
            message=message,
            notification_type=Notification.Type.ALERT,
            related_model="User",
            related_id=getattr(user, "id", None),
        )
        for recipient in recipients
    ])


def create_totp_login_challenge(user):
    TOTPLoginChallenge.objects.filter(
        user=user,
        consumed_at__isnull=True,
        expires_at__lte=timezone.now(),
    ).delete()
    return TOTPLoginChallenge.objects.create(
        user=user,
        challenge_id=secrets.token_urlsafe(32),
        expires_at=timezone.now() + timedelta(minutes=5),
    )


def get_usable_totp_challenge(challenge_id):
    try:
        challenge = TOTPLoginChallenge.objects.select_related("user").get(challenge_id=challenge_id)
    except (TypeError, ValueError, TOTPLoginChallenge.DoesNotExist):
        return None
    if not challenge.is_usable or challenge.attempts >= 5:
        return None
    return challenge


def normalize_totp_code(value):
    return "".join(ch for ch in str(value or "") if ch.isdigit())[:6]


def totp_counter_for_time(moment):
    return int(moment.timestamp()) // 30


def totp_provisioning_uri(user, secret):
    account = f"{user.service_number} - {user.name}".strip()
    return pyotp.TOTP(secret).provisioning_uri(name=account, issuer_name=totp_issuer_name())


def truthy_request_value(value):
    return str(value or "").strip().lower() in {"1", "true", "yes", "on"}


def totp_setup_payload(user, device):
    uri = totp_provisioning_uri(user, device.secret)
    return {
        "issuer": totp_issuer_name(),
        "account": f"{user.service_number} - {user.name}".strip(),
        "secret": device.secret,
        "provisioning_uri": uri,
        "qr_code": qr_data_uri(uri),
    }


def qr_data_uri(text):
    image = qrcode.make(text)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def mark_totp_failure(device):
    was_locked = device.is_locked
    device.failed_attempts = min(99, int(device.failed_attempts or 0) + 1)
    fields = ["failed_attempts"]
    newly_locked = False
    if device.failed_attempts >= 5:
        device.locked_until = timezone.now() + totp_lockout_duration()
        fields.append("locked_until")
        newly_locked = not was_locked
    device.save(update_fields=fields)
    return newly_locked


def verify_totp_device(device, code, request=None):
    code = normalize_totp_code(code)
    if device.is_locked:
        return False, totp_lockout_message()
    if len(code) != 6:
        if mark_totp_failure(device):
            notify_totp_lockout(device.user, client_ip(request) if request else None, device.locked_until)
            return False, totp_lockout_message()
        return False, "Enter the 6-digit code from Google Authenticator."

    totp = pyotp.TOTP(device.secret)
    now = timezone.now()
    current_counter = totp_counter_for_time(now)
    matched_counter = None
    for offset in range(-totp_code_window(), totp_code_window() + 1):
        counter = current_counter + offset
        expected = totp.at(counter * 30)
        if secrets.compare_digest(expected, code):
            matched_counter = counter
            break

    if matched_counter is None:
        if mark_totp_failure(device):
            notify_totp_lockout(device.user, client_ip(request) if request else None, device.locked_until)
            return False, totp_lockout_message()
        return False, "Invalid authenticator code."
    if device.last_verified_counter is not None and matched_counter <= device.last_verified_counter:
        if mark_totp_failure(device):
            notify_totp_lockout(device.user, client_ip(request) if request else None, device.locked_until)
            return False, totp_lockout_message()
        return False, "This authenticator code has already been used."

    device.failed_attempts = 0
    device.locked_until = None
    device.last_verified_counter = matched_counter
    device.last_used_at = timezone.now()
    device.last_used_ip = client_ip(request) if request else None
    device.save(update_fields=[
        "failed_attempts", "locked_until", "last_verified_counter",
        "last_used_at", "last_used_ip",
    ])
    return True, ""


@api_view(["POST"])
@authentication_classes([])
@permission_classes([permissions.AllowAny])
def login_view(request):
    service_number = str(request.data.get("service_number") or "").strip()
    ip_address = client_ip(request)
    locked_until = current_login_lockout(service_number, ip_address)
    if locked_until:
        return login_lockout_response(locked_until)

    serializer = LoginSerializer(data=request.data)
    if not serializer.is_valid():
        newly_locked_until = record_login_failure(service_number, ip_address)
        if newly_locked_until:
            notify_login_lockout(service_number, ip_address, newly_locked_until)
            return login_lockout_response(newly_locked_until)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    user = serializer.validated_data["user"]
    reset_login_failures(service_number, ip_address)
    totp_required = totp_required_for_user(user)
    device = get_confirmed_totp_device(user)

    if totp_required and device:
        challenge = create_totp_login_challenge(user)
        return Response({
            "user": UserSerializer(user).data,
            "mustChangePassword": user.must_change_password,
            "requiresTotp": True,
            "totpSetupRequired": False,
            "totpChallenge": {
                "challenge_id": challenge.challenge_id,
                "expires_at": challenge.expires_at,
            },
        })

    return Response(authenticated_payload(
        user,
        mfa_pending=totp_required and not device,
    ))


@api_view(["POST"])
def logout_view(request):
    # JWT is stateless — client discards the tokens
    return Response({"detail": "Logged out successfully."})


@api_view(["GET"])
def me(request):
    return Response(UserSerializer(request.user).data)


@api_view(["POST"])
def change_password(request):
    serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
    serializer.is_valid(raise_exception=True)
    request.user.set_password(serializer.validated_data["new_password"])
    request.user.must_change_password = False
    request.user.save(update_fields=["password", "must_change_password"])
    mfa_pending = totp_required_for_user(request.user) and not user_has_confirmed_totp(request.user)
    return Response({
        "detail": "Password changed successfully.",
        **authenticated_payload(request.user, mfa_pending=mfa_pending),
    })


@api_view(["POST"])
@authentication_classes([])
@permission_classes([permissions.AllowAny])
def password_reset_request(request):
    serializer = PasswordResetRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    email = serializer.validated_data["email"].strip()
    ip_address = client_ip(request)
    locked_until = current_password_reset_request_lockout(email, ip_address)
    if locked_until:
        return throttle_lockout_response("Too many password reset requests.", locked_until)

    newly_locked_until = record_password_reset_request(email, ip_address)
    if newly_locked_until:
        return throttle_lockout_response("Too many password reset requests.", newly_locked_until)

    users = User.objects.filter(email__iexact=email, is_active=True)
    for user in users:
        send_password_setup_email(
            user,
            subject="MPIMS Password Reset",
            intro="A password reset was requested for your MPIMS account.",
        )

    return Response({
        "detail": "If that email belongs to an active MPIMS account, password reset instructions have been sent."
    })


@api_view(["POST"])
@authentication_classes([])
@permission_classes([permissions.AllowAny])
def password_reset_confirm(request):
    uid = str(request.data.get("uid") or "").strip()
    ip_address = client_ip(request)
    locked_until = current_password_reset_confirm_lockout(uid, ip_address)
    if locked_until:
        return throttle_lockout_response("Too many invalid password reset attempts.", locked_until)

    serializer = PasswordResetConfirmSerializer(data=request.data)
    if not serializer.is_valid():
        if "uid" in serializer.errors or "token" in serializer.errors:
            newly_locked_until = record_password_reset_confirm_failure(uid, ip_address)
            if newly_locked_until:
                return throttle_lockout_response("Too many invalid password reset attempts.", newly_locked_until)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    user = serializer.validated_data["user"]
    user.set_password(serializer.validated_data["new_password"])
    user.must_change_password = False
    user.save(update_fields=["password", "must_change_password"])
    reset_password_reset_confirm_failures(uid, ip_address)
    return Response({"detail": "Password reset successfully. You can now sign in."})


@api_view(["GET"])
def totp_status(request):
    device = get_totp_device(request.user)
    return Response({
        "required": totp_required_for_user(request.user),
        "configured": bool(device and device.confirmed),
        "pending": bool(device and not device.confirmed),
        "locked_until": device.locked_until if device else None,
        "last_used_at": device.last_used_at if device else None,
    })


@api_view(["POST"])
def totp_setup(request):
    existing = get_totp_device(request.user)
    if existing and existing.confirmed:
        return Response(
            {"detail": "Google Authenticator is already configured for this account."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    regenerate = truthy_request_value(request.data.get("regenerate")) or truthy_request_value(
        request.query_params.get("regenerate")
    )
    if existing and not regenerate:
        return Response(totp_setup_payload(request.user, existing))

    secret = pyotp.random_base32()
    device, _ = TOTPDevice.objects.update_or_create(
        user=request.user,
        defaults={
            "secret": secret,
            "confirmed": False,
            "failed_attempts": 0,
            "locked_until": None,
            "last_verified_counter": None,
        },
    )
    return Response(totp_setup_payload(request.user, device))


@api_view(["POST"])
def totp_setup_confirm(request):
    device = get_totp_device(request.user)
    if not device:
        return Response({"detail": "Start authenticator setup first."}, status=status.HTTP_400_BAD_REQUEST)

    ok, message = verify_totp_device(device, request.data.get("code"), request)
    if not ok:
        return Response({"detail": message}, status=status.HTTP_400_BAD_REQUEST)

    device.confirmed = True
    device.confirmed_at = timezone.now()
    device.save(update_fields=["confirmed", "confirmed_at"])
    return Response({
        "detail": "Google Authenticator configured successfully.",
        **authenticated_payload(request.user, mfa_pending=False),
    })


@api_view(["POST"])
@authentication_classes([])
@permission_classes([permissions.AllowAny])
def totp_login_verify(request):
    challenge = get_usable_totp_challenge(request.data.get("challenge_id"))
    if not challenge:
        return Response({"detail": "Authenticator login expired. Please sign in again."}, status=status.HTTP_400_BAD_REQUEST)

    device = get_confirmed_totp_device(challenge.user)
    if not device:
        return Response({"detail": "Google Authenticator is not configured for this account."}, status=status.HTTP_400_BAD_REQUEST)

    ok, message = verify_totp_device(device, request.data.get("code"), request)
    if not ok:
        challenge.attempts = min(99, int(challenge.attempts or 0) + 1)
        challenge.save(update_fields=["attempts"])
        return Response({"detail": message}, status=status.HTTP_400_BAD_REQUEST)

    challenge.consume()
    return Response({
        "detail": "Authenticator code verified.",
        **authenticated_payload(challenge.user, mfa_pending=False),
    })


@api_view(["POST"])
def user_totp_reset(request, pk):
    actor = request.user
    if not (actor.is_superuser or is_hqs_admin(actor)):
        raise PermissionDenied("Only Superuser or HQS Admin can reset Google Authenticator.")

    try:
        user = User.objects.get(pk=pk)
    except User.DoesNotExist:
        return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)

    TOTPDevice.objects.filter(user=user).delete()
    TOTPLoginChallenge.objects.filter(user=user).delete()
    return Response({"detail": "Google Authenticator reset. The user will set it up at next login."})


class UserListCreateView(generics.ListCreateAPIView):
    serializer_class = UserSerializer

    def get_queryset(self):
        actor = self.request.user
        qs = User.objects.select_related("unit", "battalion", "formation", "detachment").all()

        # Scope by actor's access level
        if has_global_read_access(actor):
            pass  # full access
        elif is_battalion_admin(actor):
            qs = qs.filter(battalion=actor.battalion)
        elif is_detachment_ic(actor):
            qs = qs.filter(detachment=actor.detachment)
        else:
            qs = qs.filter(battalion=actor.battalion) if actor.battalion else qs.none()

        # Additional filters from query params
        role = self.request.query_params.get("role")
        battalion = self.request.query_params.get("battalion")
        detachment = self.request.query_params.get("detachment")
        search = self.request.query_params.get("search")
        if role:
            qs = qs.filter(role=role)
        if battalion:
            qs = qs.filter(battalion_id=battalion)
        if detachment:
            qs = qs.filter(detachment_id=detachment)
        if search:
            qs = qs.filter(name__icontains=search) | qs.filter(service_number__icontains=search)
        return qs.order_by("name")

    def get_serializer_class(self):
        if self.request.method == "POST":
            return UserCreateSerializer
        return UserSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = self.perform_create(serializer)
        activation_email_sent = send_password_setup_email(
            user,
            subject="MPIMS Account Activation",
            intro="An MPIMS account has been created for you.",
        )
        payload = UserSerializer(user, context=self.get_serializer_context()).data
        delivery_mode = email_delivery_mode() if activation_email_sent else "failed"
        payload["activation_email"] = user.email
        payload["activation_email_sent"] = activation_email_sent
        payload["activation_delivery"] = delivery_mode
        if delivery_mode == "console":
            payload["detail"] = f"Account created. Activation link printed in the backend terminal for {user.email}."
        elif delivery_mode == "email":
            payload["detail"] = f"Account created. Activation email sent to {user.email}."
        else:
            payload["detail"] = f"Account created, but activation email could not be sent to {user.email}."
        headers = self.get_success_headers(payload)
        return Response(payload, status=status.HTTP_201_CREATED, headers=headers)

    def perform_create(self, serializer):
        actor = self.request.user
        new_role = serializer.validated_data.get("role", "")

        if new_role == User.Role.CORPS_CMD and not can_manage_corps_commander_account(actor):
            raise PermissionDenied(CORPS_COMMANDER_MANAGEMENT_ERROR)

        if actor.is_superuser or is_hqs_admin(actor):
            return serializer.save()
        if is_battalion_admin(actor):
            if new_role not in BATTALION_ADMIN_ROLES:
                raise PermissionDenied(f"Battalion admin cannot create users with role '{new_role}'.")
            return serializer.save(battalion=actor.battalion)
        if is_detachment_ic(actor):
            if new_role not in DET_IC_ROLES:
                raise PermissionDenied("IC COY can only create personnel or investigator users.")
            return serializer.save(battalion=actor.battalion, detachment=actor.detachment)
        raise PermissionDenied("You do not have permission to create users.")


class UserDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = User.objects.select_related("unit", "battalion", "formation", "detachment").all()
    serializer_class = UserSerializer

    def perform_update(self, serializer):
        actor = self.request.user
        current_role = getattr(serializer.instance, "role", "")
        new_role = serializer.validated_data.get("role", current_role)

        if (
            (current_role == User.Role.CORPS_CMD or new_role == User.Role.CORPS_CMD)
            and not can_manage_corps_commander_account(actor)
        ):
            raise PermissionDenied(CORPS_COMMANDER_MANAGEMENT_ERROR)

        serializer.save()

    def perform_destroy(self, instance):
        actor = self.request.user
        if instance.role == User.Role.CORPS_CMD and not can_manage_corps_commander_account(actor):
            raise PermissionDenied(CORPS_COMMANDER_MANAGEMENT_ERROR)
        instance.delete()

    def check_object_permissions(self, request, obj):
        super().check_object_permissions(request, obj)
        actor = request.user

        if has_global_read_access(actor):
            if actor.role == User.Role.CORPS_CMD and request.method not in permissions.SAFE_METHODS:
                raise PermissionDenied("Corps Commander has read-only command oversight access.")
            return

        if is_battalion_admin(actor):
            if obj.battalion != actor.battalion:
                raise PermissionDenied("Cannot manage users outside your battalion.")
            if request.method in ("PUT", "PATCH", "DELETE") and obj.role not in BATTALION_ADMIN_ROLES:
                raise PermissionDenied(f"Cannot manage users with role '{obj.role}'.")
        elif is_detachment_ic(actor):
            if obj.detachment != actor.detachment:
                raise PermissionDenied("Cannot manage users outside your company.")
            if request.method in ("PUT", "PATCH", "DELETE") and obj.role not in DET_IC_ROLES:
                raise PermissionDenied(f"Cannot manage users with role '{obj.role}'.")
        elif request.method in permissions.SAFE_METHODS and actor.battalion_id and obj.battalion_id == actor.battalion_id:
            return
        else:
            raise PermissionDenied("You do not have permission to manage users.")

