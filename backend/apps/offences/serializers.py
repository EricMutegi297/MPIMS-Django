from rest_framework import serializers
from .models import Offence

class OffenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Offence
        fields = "__all__"
