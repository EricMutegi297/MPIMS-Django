from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.utils import timezone
from .models import Guardroom, GuardPost, GuardroomPlacementRequest

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
            "capacity", "location", "phone_no",
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


class GuardroomPlacementRequestSerializer(serializers.ModelSerializer):
    case_number = serializers.CharField(source="case.case_number", read_only=True)
    accused_name = serializers.CharField(source="case.accused_name", read_only=True)
    accused_rank = serializers.CharField(source="case.accused_rank", read_only=True)
    accused_service_number = serializers.CharField(source="case.accused_service_number", read_only=True)
    accused_unit_name = serializers.CharField(source="case.accused_unit.name", read_only=True)
    assigned_team_name = serializers.CharField(source="case.assigned_team.name", read_only=True)
    assigned_to_name = serializers.SerializerMethodField()
    team_detachment_name = serializers.CharField(source="case.assigned_team.detachment.name", read_only=True)
    tasked_battalion_name = serializers.CharField(source="case.tasked_battalion.name", read_only=True)
    tasked_detachment_name = serializers.CharField(source="case.tasked_detachment.name", read_only=True)
    requested_by_name = serializers.SerializerMethodField()
    reviewed_by_name = serializers.SerializerMethodField()
    booked_in_by_name = serializers.SerializerMethodField()
    book_out_requested_by_name = serializers.SerializerMethodField()
    book_out_reviewed_by_name = serializers.SerializerMethodField()
    released_by_name = serializers.SerializerMethodField()
    guardroom_name = serializers.CharField(source="guardroom.name", read_only=True)
    guardroom_location = serializers.CharField(source="guardroom.location", read_only=True)
    guardroom_phone_no = serializers.CharField(source="guardroom.phone_no", read_only=True)
    reason_display = serializers.CharField(source="get_reason_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    book_out_status_display = serializers.CharField(source="get_book_out_status_display", read_only=True)
    is_booked_in = serializers.SerializerMethodField()
    is_released = serializers.SerializerMethodField()
    time_in_seconds = serializers.SerializerMethodField()
    release_letter_name = serializers.SerializerMethodField()

    class Meta:
        model = GuardroomPlacementRequest
        fields = [
            "id",
            "case",
            "case_number",
            "accused_name",
            "accused_rank",
            "accused_service_number",
            "accused_unit_name",
            "assigned_team_name",
            "assigned_to_name",
            "team_detachment_name",
            "tasked_battalion_name",
            "tasked_detachment_name",
            "guardroom",
            "guardroom_name",
            "guardroom_location",
            "guardroom_phone_no",
            "reason",
            "reason_display",
            "status",
            "status_display",
            "requested_by",
            "requested_by_name",
            "reviewed_by",
            "reviewed_by_name",
            "booked_in_by",
            "booked_in_by_name",
            "book_out_status",
            "book_out_status_display",
            "book_out_requested_by",
            "book_out_requested_by_name",
            "book_out_requested_at",
            "book_out_reviewed_by",
            "book_out_reviewed_by_name",
            "book_out_reviewed_at",
            "book_out_comments",
            "book_out_rejection_reason",
            "release_letter",
            "release_letter_name",
            "released_by",
            "released_by_name",
            "released_at",
            "reviewer_comments",
            "rejection_reason",
            "is_booked_in",
            "is_released",
            "time_in_seconds",
            "created_at",
            "updated_at",
            "reviewed_at",
            "booked_in_at",
        ]
        read_only_fields = [
            "requested_by",
            "reviewed_by",
            "booked_in_by",
            "booked_in_by_name",
            "book_out_status",
            "book_out_status_display",
            "book_out_requested_by",
            "book_out_requested_by_name",
            "book_out_requested_at",
            "book_out_reviewed_by",
            "book_out_reviewed_by_name",
            "book_out_reviewed_at",
            "book_out_comments",
            "book_out_rejection_reason",
            "release_letter",
            "release_letter_name",
            "released_by",
            "released_by_name",
            "released_at",
            "reviewer_comments",
            "rejection_reason",
            "is_booked_in",
            "is_released",
            "time_in_seconds",
            "status",
            "created_at",
            "updated_at",
            "reviewed_at",
            "booked_in_at",
        ]

    def get_assigned_to_name(self, obj):
        assigned_to = getattr(obj.case, "assigned_to", None)
        return str(assigned_to) if assigned_to else None

    def get_requested_by_name(self, obj):
        if obj.requested_by:
            return obj.requested_by.name or obj.requested_by.service_number
        return None

    def get_reviewed_by_name(self, obj):
        if obj.reviewed_by:
            return obj.reviewed_by.name or obj.reviewed_by.service_number
        return None

    def get_booked_in_by_name(self, obj):
        if obj.booked_in_by:
            return obj.booked_in_by.name or obj.booked_in_by.service_number
        return None

    def get_book_out_requested_by_name(self, obj):
        if obj.book_out_requested_by:
            return obj.book_out_requested_by.name or obj.book_out_requested_by.service_number
        return None

    def get_book_out_reviewed_by_name(self, obj):
        if obj.book_out_reviewed_by:
            return obj.book_out_reviewed_by.name or obj.book_out_reviewed_by.service_number
        return None

    def get_released_by_name(self, obj):
        if obj.released_by:
            return obj.released_by.name or obj.released_by.service_number
        return None

    def get_is_booked_in(self, obj):
        return bool(obj.booked_in_at)

    def get_is_released(self, obj):
        return bool(obj.released_at)

    def get_time_in_seconds(self, obj):
        if not obj.booked_in_at:
            return 0
        end = obj.released_at or timezone.now()
        seconds = int((end - obj.booked_in_at).total_seconds())
        return max(seconds, 0)

    def get_release_letter_name(self, obj):
        if not obj.release_letter:
            return None
        return obj.release_letter.name.split("/")[-1]

    def validate(self, attrs):
        request = self.context.get("request")
        actor = getattr(request, "user", None)
        case = attrs.get("case")
        guardroom = attrs.get("guardroom")

        if not actor or not actor.is_authenticated:
            raise serializers.ValidationError("Authentication is required.")
        if actor.role != User.Role.INVESTIGATOR:
            raise serializers.ValidationError("Only investigators can request guardroom placement.")
        if guardroom and not guardroom.is_active:
            raise serializers.ValidationError({"guardroom": "Select an active guardroom."})
        if case and not self._can_request_for_case(actor, case):
            raise serializers.ValidationError("You can only request guardroom placement for cases assigned to your team.")
        if case and case.guardroom_requests.filter(status=GuardroomPlacementRequest.Status.PENDING).exists():
            raise serializers.ValidationError("This case already has a pending guardroom placement request.")
        return attrs

    def _can_request_for_case(self, actor, case):
        if case.assigned_to_id == actor.id:
            return True
        team = getattr(case, "assigned_team", None)
        if not team:
            return False
        return team.team_ic_id == actor.id or team.members.filter(id=actor.id).exists()
