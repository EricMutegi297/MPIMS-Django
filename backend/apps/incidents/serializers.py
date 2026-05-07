from rest_framework import serializers
from .models import Incident


class IncidentSerializer(serializers.ModelSerializer):
    reported_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Incident
        fields = "__all__"
        read_only_fields = ["incident_number", "created_at", "updated_at"]

    def get_reported_by_name(self, obj):
        return str(obj.reported_by) if obj.reported_by else None
