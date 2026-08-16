from rest_framework import serializers

from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    action_display = serializers.CharField(source="get_action_display", read_only=True)

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
