import hashlib
import hmac

from django.conf import settings
from django.db import transaction
from django.db.models import F
from django.utils import timezone
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

from .models import User


def user_credential_version(user):
    return hmac.new(
        settings.SECRET_KEY.encode("utf-8"),
        user.password.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


@transaction.atomic
def revoke_user_sessions(user):
    User.objects.filter(pk=user.pk).update(auth_token_version=F("auth_token_version") + 1)
    user.refresh_from_db(fields=["auth_token_version"])

    outstanding_tokens = OutstandingToken.objects.filter(
        user_id=user.pk,
        expires_at__gt=timezone.now(),
    )
    for outstanding_token in outstanding_tokens.iterator():
        BlacklistedToken.objects.get_or_create(token=outstanding_token)
