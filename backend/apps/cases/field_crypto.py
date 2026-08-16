from functools import lru_cache

from django.conf import settings


ENCRYPTED_PREFIX = "enc:v1:"
ENCRYPTED_TEXT_UNAVAILABLE = "[Encrypted text unavailable - set FIELD_ENCRYPTION_KEY]"


def is_encrypted_text(value):
    return isinstance(value, str) and value.startswith(ENCRYPTED_PREFIX)


def _configured_keys():
    primary = getattr(settings, "FIELD_ENCRYPTION_KEY", "") or ""
    old_keys = getattr(settings, "FIELD_ENCRYPTION_OLD_KEYS", []) or []
    return [key.strip() for key in [primary, *old_keys] if isinstance(key, str) and key.strip()]


@lru_cache(maxsize=1)
def _fernet_instances():
    try:
        from cryptography.fernet import Fernet
    except Exception:
        return []

    instances = []
    for key in _configured_keys():
        try:
            instances.append(Fernet(key.encode("utf-8")))
        except Exception:
            continue
    return instances


def decrypt_text(value):
    if not is_encrypted_text(value):
        return value

    token = value[len(ENCRYPTED_PREFIX):].encode("utf-8")
    for fernet in _fernet_instances():
        try:
            return fernet.decrypt(token).decode("utf-8")
        except Exception:
            continue
    return ENCRYPTED_TEXT_UNAVAILABLE
