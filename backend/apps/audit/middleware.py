import json
import re
import time

from django.utils import timezone

from .models import AuditLog


SENSITIVE_QUERY_PARTS = ("password", "token", "access", "refresh", "secret", "key", "authorization")
ID_RE = re.compile(r"^[0-9a-fA-F-]{1,64}$")


class AuditLogMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        started = time.perf_counter()
        try:
            response = self.get_response(request)
        except Exception:
            self._write_log(request, 500, round((time.perf_counter() - started) * 1000))
            raise

        self._write_log(request, getattr(response, "status_code", None), round((time.perf_counter() - started) * 1000), response)
        return response

    def _write_log(self, request, status_code=None, duration_ms=None, response=None):
        if not self._should_log(request):
            return

        try:
            user = self._resolve_user(request, response)
            action = self._action_for_request(request, status_code)
            module = self._module_for_path(request.path)
            object_id = self._object_id_for_path(request.path)
            actor = self._actor_payload(user, request, response)
            unit = self._unit_payload(user)
            description = self._description(actor, action, module, request, object_id)
            AuditLog.objects.create(
                user=user if getattr(user, "is_authenticated", False) else None,
                **actor,
                **unit,
                action=action,
                module=module,
                method=request.method,
                path=request.path[:600],
                query_string=self._sanitized_query(request),
                object_id=object_id,
                description=description,
                status_code=status_code,
                success=bool(status_code and 200 <= int(status_code) < 400),
                ip_address=self._client_ip(request),
                user_agent=(request.META.get("HTTP_USER_AGENT") or "")[:1000],
                duration_ms=max(0, int(duration_ms or 0)),
            )
        except Exception:
            # Auditing must never break operational work.
            return

    @staticmethod
    def _should_log(request):
        path = request.path or ""
        if path.startswith(("/static/", "/media/")):
            return False
        return path.startswith("/api/") or path.startswith("/admin/")

    @staticmethod
    def _resolve_user(request, response=None):
        user = getattr(request, "user", None)
        if getattr(user, "is_authenticated", False):
            return user

        auth_header = request.META.get("HTTP_AUTHORIZATION", "")
        if auth_header.lower().startswith("bearer "):
            try:
                from rest_framework_simplejwt.authentication import JWTAuthentication

                authenticated = JWTAuthentication().authenticate(request)
                if authenticated:
                    return authenticated[0]
            except Exception:
                pass

        login_user_id = AuditLogMiddleware._login_response_user_id(request, response)
        if login_user_id:
            try:
                from apps.users.models import User

                return User.objects.select_related("battalion", "detachment").get(pk=login_user_id)
            except Exception:
                return None
        return None

    @staticmethod
    def _login_response_user_id(request, response):
        if request.path != "/api/auth/login/" or not response or getattr(response, "status_code", 500) >= 400:
            return None
        if getattr(response, "streaming", False):
            return None
        try:
            payload = json.loads(response.content.decode("utf-8"))
            return payload.get("user", {}).get("id")
        except Exception:
            return None

    @staticmethod
    def _actor_payload(user, request, response=None):
        if getattr(user, "is_authenticated", False):
            return {
                "service_number": getattr(user, "service_number", "") or "",
                "user_name": getattr(user, "name", "") or str(user),
                "user_rank": getattr(user, "rank", "") or "",
                "user_role": getattr(user, "role", "") or ("superuser" if getattr(user, "is_superuser", False) else ""),
            }

        attempted = ""
        if request.path == "/api/auth/login/":
            attempted = AuditLogMiddleware._login_attempt_service_number(request)
        return {
            "service_number": attempted,
            "user_name": "Anonymous",
            "user_rank": "",
            "user_role": "",
        }

    @staticmethod
    def _unit_payload(user):
        if not getattr(user, "is_authenticated", False):
            return {
                "battalion": None,
                "battalion_name": "",
                "detachment": None,
                "detachment_name": "",
            }

        battalion = getattr(user, "battalion", None)
        detachment = getattr(user, "detachment", None)
        if not battalion and detachment:
            battalion = getattr(detachment, "battalion", None)
        return {
            "battalion": battalion,
            "battalion_name": getattr(battalion, "name", "") or "",
            "detachment": detachment,
            "detachment_name": getattr(detachment, "name", "") or "",
        }

    @staticmethod
    def _login_attempt_service_number(request):
        try:
            body = getattr(request, "_body", b"") or request.body
            payload = json.loads(body.decode("utf-8"))
            return str(payload.get("service_number") or "")[:50]
        except Exception:
            return ""

    @staticmethod
    def _action_for_request(request, status_code=None):
        path = (request.path or "").rstrip("/")
        method = request.method.upper()
        if path == "/api/auth/login":
            return AuditLog.Action.LOGIN if status_code and int(status_code) < 400 else AuditLog.Action.LOGIN_FAILED
        if path == "/api/auth/logout":
            return AuditLog.Action.LOGOUT
        if status_code and int(status_code) >= 500:
            return AuditLog.Action.ERROR
        if method == "GET":
            return AuditLog.Action.VIEW
        if method == "POST":
            return AuditLog.Action.CREATE if AuditLogMiddleware._looks_collection_path(path) else AuditLog.Action.ACTION
        if method in {"PUT", "PATCH"}:
            return AuditLog.Action.UPDATE
        if method == "DELETE":
            return AuditLog.Action.DELETE
        return AuditLog.Action.ACTION

    @staticmethod
    def _looks_collection_path(path):
        segments = [segment for segment in path.split("/") if segment]
        if not segments:
            return False
        if any(ID_RE.match(segment) for segment in segments[2:]):
            return False
        last = segments[-1]
        return not ID_RE.match(last)

    @staticmethod
    def _module_for_path(path):
        segments = [segment for segment in (path or "").split("/") if segment]
        if not segments:
            return "system"
        if segments[0] == "admin":
            return "admin"
        if segments[0] == "api" and len(segments) > 1:
            return segments[1].replace("-", "_")
        return segments[0].replace("-", "_")

    @staticmethod
    def _object_id_for_path(path):
        segments = [segment for segment in (path or "").split("/") if segment]
        for segment in segments[2:]:
            if ID_RE.match(segment):
                return segment[:120]
        return ""

    @staticmethod
    def _sanitized_query(request):
        query = request.GET.copy()
        for key in list(query.keys()):
            lowered = key.lower()
            if any(part in lowered for part in SENSITIVE_QUERY_PARTS):
                query[key] = "[redacted]"
        return query.urlencode()

    @staticmethod
    def _client_ip(request):
        forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
        if forwarded_for:
            return forwarded_for.split(",")[0].strip() or None
        return request.META.get("REMOTE_ADDR") or None

    @staticmethod
    def _description(actor, action, module, request, object_id):
        who = actor.get("service_number") or actor.get("user_name") or "Anonymous"
        target = f"{module}"
        if object_id:
            target = f"{target} #{object_id}"
        return f"{who} {action.replace('_', ' ')} {target} using {request.method} at {timezone.now():%Y-%m-%d %H:%M:%S}"
