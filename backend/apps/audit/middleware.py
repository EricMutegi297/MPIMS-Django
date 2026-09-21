import json
import re
import time

from django.utils import timezone
from django.urls import resolve

from .models import AuditLog


SENSITIVE_QUERY_PARTS = ("password", "token", "access", "refresh", "secret", "key", "authorization")
SENSITIVE_FIELD_PARTS = SENSITIVE_QUERY_PARTS + ("totp", "otp", "pin")
ID_RE = re.compile(r"^[0-9a-fA-F-]{1,64}$")


class AuditLogMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        started = time.perf_counter()
        before = self._target_snapshot(request)
        try:
            response = self.get_response(request)
        except Exception:
            self._write_log(
                request,
                500,
                round((time.perf_counter() - started) * 1000),
                before=before,
            )
            raise

        self._write_log(
            request,
            getattr(response, "status_code", None),
            round((time.perf_counter() - started) * 1000),
            response,
            before=before,
        )
        return response

    def _write_log(self, request, status_code=None, duration_ms=None, response=None, before=None):
        if not self._should_log(request):
            return

        try:
            user = self._resolve_user(request, response)
            action = self._action_for_request(request, status_code)
            module = self._module_for_path(request.path)
            object_id = self._object_id_for_path(request.path)
            actor = self._actor_payload(user, request, response)
            unit = self._unit_payload(user)
            description = self._description(
                actor, action, module, request, object_id, before, response, unit
            )
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
    def _request_values(request):
        try:
            if request.content_type and "multipart" in request.content_type:
                source = request.POST
                values = {key: source.get(key) for key in source}
                values.update({
                    key: f"attached file: {file.name}"
                    for key, file in request.FILES.items()
                })
                return values
            if request.body:
                payload = json.loads(request.body.decode("utf-8"))
                return payload if isinstance(payload, dict) else {}
        except (AttributeError, UnicodeDecodeError, ValueError, json.JSONDecodeError):
            return {}
        return {}

    @classmethod
    def _target_snapshot(cls, request):
        if request.method not in {"PUT", "PATCH", "DELETE"}:
            return {}
        try:
            match = resolve(request.path)
            view_class = getattr(match.func, "cls", None)
            model = getattr(getattr(view_class, "queryset", None), "model", None)
            object_id = next(
                (value for key, value in match.kwargs.items() if key in {"pk", "id"}), None
            )
            if not model or not object_id:
                return {}
            instance = model.objects.filter(pk=object_id).first()
            if not instance:
                return {}
            fields = cls._request_values(request)
            return {
                key: cls._safe_value(getattr(instance, key, None), key)
                for key in fields
                if hasattr(instance, key)
            }
        except Exception:
            return {}

    @staticmethod
    def _safe_value(value, field_name=""):
        if any(part in field_name.lower() for part in SENSITIVE_FIELD_PARTS):
            return "[redacted]"
        if value is None:
            return ""
        text = str(value)
        return text if len(text) <= 120 else f"{text[:117]}..."

    @classmethod
    def _change_details(cls, request, before):
        values = cls._request_values(request)
        changes = []
        for field, new_value in values.items():
            if any(part in field.lower() for part in SENSITIVE_FIELD_PARTS):
                continue
            old_value = before.get(field, "") if before else ""
            new_text = cls._safe_value(new_value, field)
            if field in before and old_value != new_text:
                changes.append(f"{field.replace('_', ' ')} changed from '{old_value}' to '{new_text}'")
            elif field not in before and new_text:
                changes.append(f"{field.replace('_', ' ')} set to '{new_text}'")
        return changes[:8]

    @staticmethod
    def _client_ip(request):
        forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
        if forwarded_for:
            return forwarded_for.split(",")[0].strip() or None
        return request.META.get("REMOTE_ADDR") or None

    @staticmethod
    def _description(
        actor, action, module, request, object_id, before=None, response=None, unit=None
    ):
        identity = " ".join(
            part for part in [actor.get("user_rank"), actor.get("user_name")] if part
        ) or "Anonymous"
        who = " ".join(
            part for part in [
                identity,
                actor.get("service_number"),
                actor.get("user_role"),
                (unit or {}).get("battalion_name") or (unit or {}).get("detachment_name"),
            ] if part
        )
        action_words = {
            AuditLog.Action.LOGIN: "logged in",
            AuditLog.Action.LOGIN_FAILED: "had a failed login attempt",
            AuditLog.Action.LOGOUT: "logged out",
            AuditLog.Action.VIEW: "viewed",
            AuditLog.Action.CREATE: "created",
            AuditLog.Action.UPDATE: "updated",
            AuditLog.Action.DELETE: "deleted",
            AuditLog.Action.ACTION: "performed an action in",
            AuditLog.Action.ERROR: "encountered an error while accessing",
        }
        verb = action_words.get(action, action.replace("_", " "))
        target = module.replace("_", " ").title()
        if object_id:
            target = f"{target} #{object_id}"
        if action in {AuditLog.Action.LOGIN, AuditLog.Action.LOGIN_FAILED, AuditLog.Action.LOGOUT}:
            return f"{who} {verb}"
        details = AuditLogMiddleware._change_details(request, before or {})
        if request.FILES:
            files = ", ".join(
                f"attached {file.name} to {target}" for file in request.FILES.values()
            )
            details.append(files)
        if action == AuditLog.Action.DELETE:
            return f"{who} deleted {target}"
        if details:
            return f"{who} {verb} {target}: {'; '.join(details)}"
        return f"{who} {verb} {target}"
