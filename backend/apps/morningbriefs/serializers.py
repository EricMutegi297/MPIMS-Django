from rest_framework import serializers
from .models import MorningBrief


class MorningBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = MorningBrief
        fields = "__all__"
        read_only_fields = ["created_at"]
