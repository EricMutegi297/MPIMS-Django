from rest_framework.exceptions import PermissionDenied
from rest_framework_simplejwt.authentication import JWTAuthentication


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
        if validated_token.get("mfa_pending") and not self._path_allowed(request.path):
            raise PermissionDenied("Authenticator setup or verification is required before accessing MPIMS.")
        return user, validated_token

    @staticmethod
    def _path_allowed(path):
        normalized = path if path.endswith("/") else f"{path}/"
        return any(normalized.startswith(allowed) for allowed in MFA_PENDING_ALLOWED_PATHS)
