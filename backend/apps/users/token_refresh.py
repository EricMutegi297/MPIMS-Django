from django.contrib.auth import get_user_model
from rest_framework_simplejwt.exceptions import InvalidToken
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.views import TokenRefreshView

from .tokens import user_credential_version


class MPIMSTokenRefreshSerializer(TokenRefreshSerializer):
    def validate(self, attrs):
        refresh = self.token_class(attrs["refresh"])
        user_model = get_user_model()
        user_id = refresh.get(api_settings.USER_ID_CLAIM)
        if user_id is None or not str(user_id).strip():
            raise InvalidToken("Token is invalid or the account no longer exists.")
        try:
            user = user_model.objects.get(**{api_settings.USER_ID_FIELD: user_id})
        except (user_model.DoesNotExist, TypeError, ValueError) as exc:
            raise InvalidToken("Token is invalid or the account no longer exists.") from exc

        if (
            not user.is_active
            or refresh.get("auth_version") != user.auth_token_version
            or refresh.get("credential_version") != user_credential_version(user)
        ):
            raise InvalidToken("Session has been revoked. Sign in again.")
        return super().validate(attrs)


class MPIMSTokenRefreshView(TokenRefreshView):
    serializer_class = MPIMSTokenRefreshSerializer
