from django.contrib import admin

from .models import AuditLog


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = (
        "created_at",
        "service_number",
        "user_name",
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
        "service_number",
        "user_name",
        "battalion_name",
        "detachment_name",
        "path",
    )
    readonly_fields = [field.name for field in AuditLog._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
