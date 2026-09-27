import json
import re
from collections.abc import Mapping
from django.utils import timezone
from rest_framework import serializers
from django.db.models import Q
from ..models import (
    Case,
    CaseActivityLog,
    CaseAccused,
    CaseAccusedOffence,
    CaseAttachment,
    CaseBackBrief,
    CaseBrief,
    CaseBriefForward,
    CaseCourtMartialHearing,
    CaseCourtMartialMilestone,
    ExhibitStorageRequest,
    InvestigationTeam,
)
from apps.formations.models import Battalion, Unit
from apps.users.access import is_hqs_admin, is_battalion_admin, is_detachment_ic
from apps.users.models import User

from .constants import CASE_FILE_FIELDS, CLOSED_CASE_FILE_ERROR

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
