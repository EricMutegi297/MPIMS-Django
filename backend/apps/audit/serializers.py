from rest_framework import serializers

from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    action_display = serializers.CharField(source="get_action_display", read_only=True)
    service_number = serializers.SerializerMethodField()
    user_name = serializers.SerializerMethodField()
    description = serializers.SerializerMethodField()
    query_string = serializers.SerializerMethodField()

    class Meta:
        model = AuditLog
        fields = [
            "id",
            "user",
            "service_number",
            "user_name",
            "user_rank",
            "user_role",
            "battalion",
            "battalion_name",
            "detachment",
            "detachment_name",
            "action",
            "action_display",
            "module",
            "method",
            "path",
            "query_string",
            "object_id",
            "description",
            "status_code",
            "success",
            "ip_address",
            "user_agent",
            "duration_ms",
            "created_at",
        ]
        read_only_fields = fields

    @staticmethod
    def get_service_number(obj):
        value = str(obj.service_number or "")
        if len(value) <= 2:
            return "*" * len(value)
        return f"{'*' * (len(value) - 2)}{value[-2:]}"

    @staticmethod
    def get_user_name(obj):
        if obj.user_name and obj.service_number and obj.user_name == obj.service_number:
            return "Unknown user"
        return obj.user_name

    @staticmethod
    def get_description(obj):
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
        verb = action_words.get(obj.action, obj.action.replace("_", " "))
        module = obj.module.replace("_", " ").title()
        target = f"{module} #{obj.object_id}" if obj.object_id else module
        return verb if obj.action in {
            AuditLog.Action.LOGIN,
            AuditLog.Action.LOGIN_FAILED,
            AuditLog.Action.LOGOUT,
        } else f"{verb} {target}"

    @staticmethod
    def get_query_string(obj):
        return ""
