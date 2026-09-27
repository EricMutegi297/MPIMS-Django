from django.contrib import admin

from .models import AuditLog


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    fields = (
        "created_at",
        "masked_service_number",
        "safe_user_name",
        "user_rank",
        "user_role",
        "battalion_name",
        "detachment_name",
        "action",
        "module",
        "method",
        "path",
        "object_id",
        "status_code",
        "success",
        "ip_address",
        "duration_ms",
    )
    list_display = (
        "created_at",
        "masked_service_number",
        "safe_user_name",
        "user_role",
        "battalion_name",
        "detachment_name",
        "action",
        "module",
        "method",
        "status_code",
        "success",
    )
    list_filter = ("action", "module", "method", "success", "user_role", "created_at")
    search_fields = (
        "user_name",
        "battalion_name",
        "detachment_name",
        "path",
    )
    readonly_fields = fields

    @admin.display(description="Service number")
    def masked_service_number(self, obj):
        value = str(obj.service_number or "")
        if len(value) <= 2:
            return "*" * len(value)
        return f"{'*' * (len(value) - 2)}{value[-2:]}"

    @admin.display(description="User")
    def safe_user_name(self, obj):
        if obj.user_name and obj.service_number and obj.user_name == obj.service_number:
            return "Unknown user"
        return obj.user_name

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
