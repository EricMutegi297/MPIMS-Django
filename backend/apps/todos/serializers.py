from rest_framework import serializers

from .models import TodoEvent


class TodoEventSerializer(serializers.ModelSerializer):
    is_finished = serializers.ReadOnlyField()
    days_until = serializers.ReadOnlyField()
    battalion_name = serializers.CharField(source="battalion.name", read_only=True)
    created_by_name = serializers.CharField(source="created_by.name", read_only=True)

    class Meta:
        model = TodoEvent
        fields = [
            "id", "title", "description", "event_date", "event_time", "location",
            "scope", "battalion", "battalion_name", "created_by", "created_by_name",
            "created_at", "updated_at", "is_finished", "days_until",
        ]
        read_only_fields = ["created_by", "created_at", "updated_at"]

    def validate(self, attrs):
        scope = attrs.get("scope", getattr(self.instance, "scope", None))
        battalion = attrs.get("battalion", getattr(self.instance, "battalion", None))
        if scope == TodoEvent.Scope.BATTALION and not battalion:
            raise serializers.ValidationError({"battalion": "Select a battalion event target."})
        if scope == TodoEvent.Scope.CORPS and battalion:
            raise serializers.ValidationError({"battalion": "Corps events cannot target a battalion."})
        return attrs
