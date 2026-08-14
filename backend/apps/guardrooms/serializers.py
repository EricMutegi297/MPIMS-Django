from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Guardroom, GuardPost

User = get_user_model()


class GuardPostSerializer(serializers.ModelSerializer):
    class Meta:
        model = GuardPost
        fields = ["id", "name", "assigned_personnel"]


class GuardroomSerializer(serializers.ModelSerializer):
    ic_name = serializers.SerializerMethodField()

    class Meta:
        model = Guardroom
        fields = [
            "id", "name", "unit", "ic", "ic_name",
            "current_strength", "established_strength", "is_active",
        ]
        extra_kwargs = {
            "unit": {"required": False, "allow_null": True},
            "ic": {"required": False, "allow_null": True},
        }

    def get_ic_name(self, obj):
        if obj.ic:
            return obj.ic.name or obj.ic.service_number
        return None
