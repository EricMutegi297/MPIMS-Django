from rest_framework import serializers
from .models import Formation, Battalion, Unit, Detachment


class DetachmentSerializer(serializers.ModelSerializer):
    case_count = serializers.IntegerField(read_only=True)

    def validate_battalion(self, battalion):
        if battalion.battalion_type != Battalion.BattalionType.NORMAL:
            raise serializers.ValidationError(
                "Companies can only be added to Normal battalions."
            )
        return battalion

    class Meta:
        model = Detachment
        fields = ["id", "battalion", "company", "name", "aor", "mobile_no", "email", "case_count"]
        extra_kwargs = {
            "aor": {"required": False, "allow_blank": True},
            "mobile_no": {"required": False, "allow_blank": True},
            "email": {"required": False, "allow_blank": True},
        }


class UnitSerializer(serializers.ModelSerializer):
    formation_name = serializers.SerializerMethodField()

    def get_formation_name(self, obj):
        return obj.formation.name if obj.formation else None

    class Meta:
        model = Unit
        fields = ["id", "name", "code", "formation", "formation_name",
                  "service", "email", "mobile_no", "location_county"]

    def validate(self, attrs):
        service = attrs.get("service", getattr(self.instance, "service", Unit.Service.KA))
        formation = attrs.get("formation", getattr(self.instance, "formation", None))

        if service == Unit.Service.KA and not formation:
            raise serializers.ValidationError({
                "formation": "Formation is required for Kenya Army units."
            })

        if service in {Unit.Service.KAF, Unit.Service.KN}:
            attrs["formation"] = None

        return attrs


class BattalionSerializer(serializers.ModelSerializer):
    detachments = DetachmentSerializer(many=True, read_only=True)
    case_count = serializers.IntegerField(read_only=True)
    formation_name = serializers.SerializerMethodField()

    def get_formation_name(self, obj):
        return obj.formation.name if obj.formation else None

    class Meta:
        model = Battalion
        fields = [
            "id", "name", "email", "phone", "aor", "code",
            "battalion_type", "formation", "formation_name", "detachments", "case_count",
        ]
        extra_kwargs = {
            "formation": {"required": False, "allow_null": True},
        }


class FormationSerializer(serializers.ModelSerializer):
    units = UnitSerializer(many=True, read_only=True)
    battalions = BattalionSerializer(many=True, read_only=True)

    class Meta:
        model = Formation
        fields = ["id", "name", "location", "units", "battalions"]
