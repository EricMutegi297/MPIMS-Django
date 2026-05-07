from rest_framework import serializers
from .models import Case, CaseAbstractAttachment, InvestigationTeam
from apps.formations.models import Battalion
from apps.users.models import User


class CaseAbstractAttachmentSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = CaseAbstractAttachment
        fields = "__all__"
        read_only_fields = ["uploaded_by", "uploaded_at"]

    def get_uploaded_by_name(self, obj):
        return str(obj.uploaded_by) if obj.uploaded_by else None


class InvestigationTeamSerializer(serializers.ModelSerializer):
    members = serializers.PrimaryKeyRelatedField(
        many=True, queryset=User.objects.filter(is_active=True)
    )
    team_ic_detail = serializers.SerializerMethodField()
    members_detail = serializers.SerializerMethodField()

    class Meta:
        model = InvestigationTeam
        fields = "__all__"
        read_only_fields = ["created_at", "battalion"]

    def validate(self, attrs):
        members = attrs.get("members", None)
        if members is not None and len(members) < 2:
            raise serializers.ValidationError(
                {"members": "A team must have at least 2 members."}
            )
        return attrs

    def create(self, validated_data):
        members = validated_data.pop("members", [])
        team = InvestigationTeam.objects.create(**validated_data)
        team.members.set(members)
        return team

    def update(self, instance, validated_data):
        members = validated_data.pop("members", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if members is not None:
            instance.members.set(members)
        return instance

    def get_team_ic_detail(self, obj):
        if obj.team_ic:
            return {
                "id": obj.team_ic.id,
                "name": str(obj.team_ic),
                "rank": obj.team_ic.rank,
                "service_number": obj.team_ic.service_number,
            }
        return None

    def get_members_detail(self, obj):
        return [
            {
                "id": m.id,
                "name": str(m),
                "rank": m.rank,
                "service_number": m.service_number,
            }
            for m in obj.members.all()
        ]


class CaseSerializer(serializers.ModelSerializer):
    assigned_to_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    tasked_battalion_name = serializers.SerializerMethodField()
    tasked_battalion_type = serializers.SerializerMethodField()
    offence_name = serializers.SerializerMethodField()
    accused_unit_name = serializers.SerializerMethodField()
    submitting_unit_name = serializers.SerializerMethodField()
    assigned_team_name = serializers.SerializerMethodField()
    tasked_detachment_name = serializers.SerializerMethodField()
    abstracts_count = serializers.SerializerMethodField()

    class Meta:
        model = Case
        fields = "__all__"
        read_only_fields = ["case_number", "created_at", "updated_at", "status",
                            "brief_forwarded_co", "brief_forwarded_corps", "served_at"]

    def get_abstracts_count(self, obj):
        return obj.abstracts.count()

    def validate(self, attrs):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        instance = getattr(self, "instance", None)

        tasked_battalion = attrs.get(
            "tasked_battalion",
            getattr(instance, "tasked_battalion", None),
        )
        tasking_letter = attrs.get(
            "tasking_letter",
            getattr(instance, "tasking_letter", None),
        )

        if self.instance is None:
            if not user or not user.is_authenticated:
                raise serializers.ValidationError("Authentication is required.")

            is_hqs_admin = (
                user.role == "admin"
                and user.battalion
                and user.battalion.battalion_type == Battalion.BattalionType.HQS
            )
            if not (user.is_superuser or is_hqs_admin):
                raise serializers.ValidationError(
                    "Only a superuser or HQ battalion admin can create a new case."
                )

        if tasked_battalion and tasked_battalion.battalion_type not in {
            Battalion.BattalionType.SPECIAL,
            Battalion.BattalionType.NORMAL,
        }:
            raise serializers.ValidationError(
                {"tasked_battalion": "Cases can only be tasked to Special or Normal battalions."}
            )

        if tasked_battalion and not tasking_letter:
            raise serializers.ValidationError(
                {"tasking_letter": "Attach a tasking letter before completing tasking."}
            )

        tasking_date = attrs.get(
            "tasking_date",
            getattr(instance, "tasking_date", None),
        )
        if tasked_battalion and not tasking_date:
            raise serializers.ValidationError(
                {"tasking_date": "Tasking date and time is required when tasking a battalion."}
            )

        return attrs

    def get_assigned_to_name(self, obj):
        return str(obj.assigned_to) if obj.assigned_to else None

    def get_created_by_name(self, obj):
        return str(obj.created_by) if obj.created_by else None

    def get_tasked_battalion_name(self, obj):
        return obj.tasked_battalion.name if obj.tasked_battalion else None

    def get_tasked_battalion_type(self, obj):
        return obj.tasked_battalion.battalion_type if obj.tasked_battalion else None

    def get_offence_name(self, obj):
        return str(obj.offence_ref) if obj.offence_ref else None

    def get_accused_unit_name(self, obj):
        return obj.accused_unit.name if obj.accused_unit else None

    def get_submitting_unit_name(self, obj):
        return obj.submitting_unit.name if obj.submitting_unit else None

    def get_assigned_to_name(self, obj):
        return str(obj.assigned_to) if obj.assigned_to else None

    def get_created_by_name(self, obj):
        return str(obj.created_by) if obj.created_by else None

    def get_tasked_battalion_name(self, obj):
        return obj.tasked_battalion.name if obj.tasked_battalion else None

    def get_tasked_battalion_type(self, obj):
        return obj.tasked_battalion.battalion_type if obj.tasked_battalion else None

    def get_assigned_team_name(self, obj):
        return obj.assigned_team.name if obj.assigned_team else None

    def get_tasked_detachment_name(self, obj):
        return obj.tasked_detachment.name if obj.tasked_detachment else None
