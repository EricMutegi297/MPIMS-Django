from rest_framework import viewsets
from .models import Incident
from .serializers import IncidentSerializer


class IncidentViewSet(viewsets.ModelViewSet):
    queryset = Incident.objects.select_related("reported_by", "unit", "battalion").all()
    serializer_class = IncidentSerializer
    filterset_fields = ["status", "severity", "unit", "battalion", "is_belated"]
    search_fields = ["incident_number", "incident_type", "description", "location"]

    def perform_create(self, serializer):
        from django.utils import timezone
        from datetime import timedelta
        obj = serializer.save(reported_by=self.request.user)
        # Mark belated if reported more than 24h after occurrence
        if obj.date_occurred and (timezone.now() - obj.date_occurred) > timedelta(hours=24):
            obj.is_belated = True
            obj.save(update_fields=["is_belated"])
