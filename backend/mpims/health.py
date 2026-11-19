import logging
import secrets
import socket

from django.conf import settings
from django.core.cache import cache
from django.db import connection
from django.http import JsonResponse
from django.views.decorators.http import require_GET


logger = logging.getLogger(__name__)


def _check_database():
    connection.ensure_connection()


def _check_cache():
    value = secrets.token_urlsafe(16)
    key = f"mpims:healthcheck:{value}"
    cache.set(key, value, timeout=10)
    if cache.get(key) != value:
        raise RuntimeError("Cache read-after-write check failed.")


def _check_clamav():
    with socket.create_connection(
        (settings.CASE_UPLOAD_CLAMAV_HOST, settings.CASE_UPLOAD_CLAMAV_PORT),
        timeout=settings.CASE_UPLOAD_CLAMAV_TIMEOUT,
    ) as scanner:
        scanner.settimeout(settings.CASE_UPLOAD_CLAMAV_TIMEOUT)
        scanner.sendall(b"zPING\0")
        response = bytearray()
        while not response.endswith(b"\0"):
            chunk = scanner.recv(64)
            if not chunk:
                raise OSError("ClamAV closed the connection without a response.")
            response.extend(chunk)
    if bytes(response).rstrip(b"\0") != b"PONG":
        raise OSError("ClamAV returned an unexpected health-check response.")


@require_GET
def readiness_check(request):
    probes = {"database": _check_database, "cache": _check_cache}
    if settings.CASE_UPLOAD_CLAMAV_ENABLED:
        probes["clamav"] = _check_clamav

    checks = {}
    for name, probe in probes.items():
        try:
            probe()
        except Exception:
            logger.exception("MPIMS readiness probe failed: %s", name)
            checks[name] = "unavailable"
        else:
            checks[name] = "ok"

    ready = all(result == "ok" for result in checks.values())
    return JsonResponse(
        {"status": "ok" if ready else "unavailable", "checks": checks},
        status=200 if ready else 503,
    )
