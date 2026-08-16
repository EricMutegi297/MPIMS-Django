import base64
import hashlib

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.db import models

try:
    from cryptography.fernet import Fernet, InvalidToken
except ImportError:  # pragma: no cover - exercised only when dependency is missing.
    Fernet = None
    InvalidToken = Exception


ENCRYPTED_PREFIX = "enc:v1:"
_fernet_cache = {}


def _fernet_key_from_secret(secret):
    return base64.urlsafe_b64encode(hashlib.sha256(secret.encode("utf-8")).digest())


def _fernet_for_secret(secret):
    global Fernet, InvalidToken
    if secret in _fernet_cache:
        return _fernet_cache[secret]
    if Fernet is None:
        try:
            from cryptography.fernet import Fernet as ImportedFernet, InvalidToken as ImportedInvalidToken
        except ImportError as exc:
            raise ImproperlyConfigured("Install cryptography to use encrypted model fields.") from exc
        Fernet = ImportedFernet
        InvalidToken = ImportedInvalidToken

    if not secret:
        raise ImproperlyConfigured("Set FIELD_ENCRYPTION_KEY for encrypted model fields.")

    try:
        fernet = Fernet(secret.encode("ascii"))
    except Exception:
        fernet = Fernet(_fernet_key_from_secret(secret))
    _fernet_cache[secret] = fernet
    return fernet


def _configured_key_sources():
    active_key = (getattr(settings, "FIELD_ENCRYPTION_KEY", "") or "").strip()
    secret_key = getattr(settings, "SECRET_KEY", "")
    old_keys = [
        key.strip()
        for key in (getattr(settings, "FIELD_ENCRYPTION_OLD_KEYS", "") or "").split(",")
        if key.strip()
    ]

    sources = [active_key or secret_key, *old_keys]
    if active_key and secret_key:
        sources.append(secret_key)
    return [source for index, source in enumerate(sources) if source and source not in sources[:index]]


def get_fernet():
    sources = _configured_key_sources()
    if not sources:
        raise ImproperlyConfigured("Set FIELD_ENCRYPTION_KEY for encrypted model fields.")
    return _fernet_for_secret(sources[0])


def get_decryption_fernets():
    sources = _configured_key_sources()
    if not sources:
        raise ImproperlyConfigured("Set FIELD_ENCRYPTION_KEY for encrypted model fields.")
    return [_fernet_for_secret(source) for source in sources]


def encrypt_value(value):
    if value is None or value == "":
        return value
    text = str(value)
    if text.startswith(ENCRYPTED_PREFIX):
        return text
    token = get_fernet().encrypt(text.encode("utf-8")).decode("ascii")
    return f"{ENCRYPTED_PREFIX}{token}"


def decrypt_value(value):
    if not isinstance(value, str) or not value.startswith(ENCRYPTED_PREFIX):
        return value
    token = value[len(ENCRYPTED_PREFIX) :].encode("ascii")
    for fernet in get_decryption_fernets():
        try:
            return fernet.decrypt(token).decode("utf-8")
        except InvalidToken:
            continue
    raise ImproperlyConfigured("FIELD_ENCRYPTION_KEY cannot decrypt existing encrypted data.")


class EncryptedFieldMixin:
    encrypted = True

    def get_prep_value(self, value):
        value = super().get_prep_value(value)
        return encrypt_value(value)

    def from_db_value(self, value, expression, connection):
        return decrypt_value(value)

    def to_python(self, value):
        value = super().to_python(value)
        return decrypt_value(value)


class EncryptedTextField(EncryptedFieldMixin, models.TextField):
    description = "Text stored encrypted with Fernet"
