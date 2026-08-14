from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Guardroom, GuardPost, DetaineeRequest

User = get_user_model()


class GuardPostSerializer(serializers.ModelSerializer):
    class Meta:
        model = GuardPost
        fields = ["id", "name", "assigned_personnel"]


class GuardroomSerializer(serializers.ModelSerializer):
    ic_name = serializers.SerializerMethodField()
    vacant_slots = serializers.SerializerMethodField()

    class Meta:
        model = Guardroom
        fields = [
            "id", "name", "unit", "ic", "ic_name",
            "current_strength", "established_strength",
            "capacity", "detainee_count", "vacant_slots",
            "location", "phone_no", "is_active",
        ]
        extra_kwargs = {
            "unit": {"required": False, "allow_null": True},
            "ic": {"required": False, "allow_null": True},
        }

    def get_ic_name(self, obj):
        if obj.ic:
            return f"{obj.ic.rank} {obj.ic.name}".strip() if obj.ic.rank else obj.ic.name or obj.ic.service_number
        return None

    def get_vacant_slots(self, obj):
        return obj.vacant_slots


class DetaineeRequestSerializer(serializers.ModelSerializer):
    case_number = serializers.CharField(source="case.case_number", read_only=True)
    accused_name_case = serializers.CharField(source="case.accused_name", read_only=True)
    accused_rank_case = serializers.CharField(source="case.accused_rank", read_only=True)
    accused_service_number = serializers.CharField(source="case.accused_service_number", read_only=True)
    guardroom_name = serializers.CharField(source="guardroom.name", read_only=True)
    requested_by_name = serializers.SerializerMethodField()
    requested_by_unit = serializers.SerializerMethodField()
    reviewed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = DetaineeRequest
        fields = [
            "id", "case", "case_number", "accused_name_case", "accused_rank_case",
            "accused_service_number",
            "guardroom", "guardroom_name",
            "requested_by", "requested_by_name", "requested_by_unit",
            # Committal 1
            "accused_no", "accused_rank", "accused_name", "accused_unit", "accused_offence",
            "guard_commander_date", "guard_commander_time", "location",
            "handed_by_name", "handed_by_rank",
            # Status
            "status", "rejection_reason", "reviewed_by", "reviewed_by_name", "reviewed_at",
            # Committal 2 (book-in – IC signature block)
            "book_in_signed_name", "book_in_signed_unit", "book_in_signed_no",
            "book_in_signed_rank",
            "book_in_date", "booked_in_at",
            # Book out
            "booked_out_at", "book_out_reason",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "requested_by", "reviewed_by", "reviewed_at",
            "booked_in_at", "booked_out_at", "status",
        ]

    def get_requested_by_name(self, obj):
        if obj.requested_by:
            rank = obj.requested_by.rank or ""
            name = obj.requested_by.name or obj.requested_by.service_number
            return f"{rank} {name}".strip()
        return None

    def get_requested_by_unit(self, obj):
        if obj.requested_by:
            u = obj.requested_by
            if u.detachment and u.detachment.name:
                return u.detachment.name
            if u.battalion and u.battalion.name:
                return u.battalion.name
            if u.unit and u.unit.name:
                return u.unit.name
            if u.formation and u.formation.name:
                return u.formation.name
        return None

    def get_reviewed_by_name(self, obj):
        if obj.reviewed_by:
            rank = obj.reviewed_by.rank or ""
            name = obj.reviewed_by.name or obj.reviewed_by.service_number
            return f"{rank} {name}".strip()
        return None
