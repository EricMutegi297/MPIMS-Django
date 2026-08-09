from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication


class MfaJWTAuthentication(JWTAuthentication):
    MFA_EXEMPT_PATH_PREFIXES = (
        "/api/auth/login/",
        "/api/auth/logout/",
        "/api/auth/me/",
        "/api/auth/change-password/",
        "/api/auth/set-password/",
        "/api/auth/mfa/",
        "/api/auth/token/refresh/",
    )

    def authenticate(self, request):
        result = super().authenticate(request)
        if result is None:
            return None

        user, validated_token = result
        path = request.path_info or ""
        if path.startswith(self.MFA_EXEMPT_PATH_PREFIXES):
            return result

        if getattr(user, "must_change_password", False):
            raise AuthenticationFailed("Password change required.")

        if not getattr(user, "mfa_enabled", False):
            raise AuthenticationFailed("Google Authenticator setup required.")

        return user, validated_token
