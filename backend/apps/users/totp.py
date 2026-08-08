import base64
import hashlib
import hmac
import os
import time
from urllib.parse import quote, urlencode


ISSUER = "MPIMS"
INTERVAL_SECONDS = 30
DIGITS = 6


def generate_secret():
    return base64.b32encode(os.urandom(20)).decode("ascii").rstrip("=")


def _decode_secret(secret):
    cleaned = "".join(str(secret or "").split()).upper()
    padding = "=" * ((8 - len(cleaned) % 8) % 8)
    return base64.b32decode(f"{cleaned}{padding}", casefold=True)


def hotp(secret, counter, digits=DIGITS):
    key = _decode_secret(secret)
    counter_bytes = int(counter).to_bytes(8, "big")
    digest = hmac.new(key, counter_bytes, hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    truncated = int.from_bytes(digest[offset:offset + 4], "big") & 0x7FFFFFFF
    return str(truncated % (10 ** digits)).zfill(digits)


def totp(secret, for_time=None, interval=INTERVAL_SECONDS, digits=DIGITS):
    timestamp = int(time.time() if for_time is None else for_time)
    return hotp(secret, timestamp // interval, digits=digits)


def verify_totp(secret, code, valid_window=1):
    normalized = "".join(str(code or "").split())
    if not normalized.isdigit() or len(normalized) != DIGITS:
        return False

    current_step = int(time.time()) // INTERVAL_SECONDS
    for offset in range(-valid_window, valid_window + 1):
        expected = hotp(secret, current_step + offset)
        if hmac.compare_digest(expected, normalized):
            return True
    return False


def provisioning_uri(secret, account_name, issuer=ISSUER):
    label = quote(f"{issuer}:{account_name}")
    params = urlencode({
        "secret": secret,
        "issuer": issuer,
        "algorithm": "SHA1",
        "digits": DIGITS,
        "period": INTERVAL_SECONDS,
    })
    return f"otpauth://totp/{label}?{params}"
