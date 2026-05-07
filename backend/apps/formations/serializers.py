from rest_framework import serializers
from .models import Formation, Battalion, Unit, Detachment


class DetachmentSerializer(serializers.ModelSerializer):
    def validate_battalion(self, battalion):
        if battalion.battalion_type != Battalion.BattalionType.NORMAL:
            raise serializers.ValidationError(
                "Detachments can only be added to Normal battalions."
            )
        return battalion

    class Meta:
        model = Detachment
        fields = ["id", "battalion", "company", "name", "aor", "mobile_no", "email"]


class UnitSerializer(serializers.ModelSerializer):
    def validate(self, attrs):
        formation = attrs.get("formation", getattr(self.instance, "formation", None))
        if formation is None:
            raise serializers.ValidationError({"formation": "Formation is required."})
        return attrs

    class Meta:
        model = Unit
        fields = [
            "id",
            "name",
            "code",
            "formation",
            "service",
            "mobile_no",
            "email",
            "location_county",
            "battalion",
        ]
        extra_kwargs = {
            "formation": {"required": True, "allow_null": False},
            "battalion": {"required": False, "allow_null": True},
        }


class BattalionSerializer(serializers.ModelSerializer):
    units = UnitSerializer(many=True, read_only=True)
    detachments = DetachmentSerializer(many=True, read_only=True)

    class Meta:
        model = Battalion
        fields = [
            "id",
            "name",
            "email",
            "phone",
            "aor",
            "code",
            "battalion_type",
            "formation",
            "units",
            "detachments",
        ]
        extra_kwargs = {
            "formation": {"required": False, "allow_null": True},
        }


class FormationSerializer(serializers.ModelSerializer):
    battalions = BattalionSerializer(many=True, read_only=True)
    units = UnitSerializer(many=True, read_only=True)

    class Meta:
        model = Formation
        fields = ["id", "name", "location", "battalions", "units"]
