from datetime import date

from django.db.models import Q
from rest_framework import filters, viewsets
from rest_framework.exceptions import ValidationError

from .models import AuditLog
from .permissions import IsSuperUser
from .serializers import AuditLogSerializer


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = AuditLogSerializer
    permission_classes = [IsSuperUser]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = [
        "service_number",
        "user_name",
        "user_rank",
        "user_role",
        "battalion_name",
        "detachment_name",
        "action",
        "module",
        "method",
        "path",
        "ip_address",
    ]
    ordering_fields = [
        "created_at",
        "action",
        "module",
        "method",
        "status_code",
        "duration_ms",
        "service_number",
        "user_role",
    ]
    ordering = ["-created_at"]

    def get_queryset(self):
        qs = AuditLog.objects.select_related("user", "battalion", "detachment").all()
        params = self.request.query_params

        for field in ["action", "module", "method", "user_role", "status_code", "success"]:
            value = params.get(field)
            if value not in (None, ""):
                qs = qs.filter(**{field: value})

        unit_search = str(params.get("unit") or "").strip()
        if unit_search:
            qs = qs.filter(
                Q(battalion_name__icontains=unit_search)
                | Q(detachment_name__icontains=unit_search)
            )

        date_from = self._parse_date(params.get("date_from"), "date_from")
        date_to = self._parse_date(params.get("date_to"), "date_to")
        if date_from and date_to and date_from > date_to:
            raise ValidationError({"date_from": "Date from cannot be later than date to."})
        if date_from:
            qs = qs.filter(created_at__date__gte=date_from)
        if date_to:
            qs = qs.filter(created_at__date__lte=date_to)
        return qs

    @staticmethod
    def _parse_date(value, field):
        if not value:
            return None
        try:
            return date.fromisoformat(value)
        except ValueError as exc:
            raise ValidationError({field: "Use YYYY-MM-DD format."}) from exc
