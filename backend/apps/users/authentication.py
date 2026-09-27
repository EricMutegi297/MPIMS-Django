from rest_framework.exceptions import AuthenticationFailed, PermissionDenied
from rest_framework.authentication import SessionAuthentication
from rest_framework_simplejwt.authentication import JWTAuthentication

from .models import TOTPDevice
from .tokens import user_credential_version


MFA_PENDING_ALLOWED_PATHS = (
    "/api/auth/me/",
    "/api/auth/logout/",
    "/api/auth/change-password/",
    "/api/auth/totp/status/",
    "/api/auth/totp/setup/",
    "/api/auth/totp/setup/confirm/",
)


class MPIMSJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        result = super().authenticate(request)
        if result is None:
            return None

        user, validated_token = result
        if (
            validated_token.get("auth_version") != user.auth_token_version
            or validated_token.get("credential_version") != user_credential_version(user)
        ):
            raise AuthenticationFailed("Session has been revoked. Sign in again.")
        if validated_token.get("mfa_pending") and not self._path_allowed(request.path):
            raise PermissionDenied("Authenticator setup or verification is required before accessing MPIMS.")
        if not self._user_has_confirmed_totp(user) and not self._path_allowed(request.path):
            raise PermissionDenied("Google Authenticator setup is required before accessing MPIMS.")
        return user, validated_token

    @staticmethod
    def _user_has_confirmed_totp(user):
        try:
            return bool(user.totp_device.confirmed)
        except TOTPDevice.DoesNotExist:
            return False

    @staticmethod
    def _path_allowed(path):
        normalized = path if path.endswith("/") else f"{path}/"
        return any(normalized.startswith(allowed) for allowed in MFA_PENDING_ALLOWED_PATHS)


class MPIMSSessionAuthentication(SessionAuthentication):
    def authenticate(self, request):
        result = super().authenticate(request)
        if result is None:
            return None

        user, auth = result
        if (
            not MPIMSJWTAuthentication._user_has_confirmed_totp(user)
            and not MPIMSJWTAuthentication._path_allowed(request.path)
        ):
            raise PermissionDenied("Google Authenticator setup is required before accessing MPIMS.")
        return user, auth
