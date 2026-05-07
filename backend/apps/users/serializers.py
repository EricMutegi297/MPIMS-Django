from rest_framework import serializers
from django.contrib.auth import authenticate
from .models import User


class UserSerializer(serializers.ModelSerializer):
    battalion_name = serializers.SerializerMethodField()
    battalion_type = serializers.SerializerMethodField()
    detachment_name = serializers.SerializerMethodField()
    is_superuser = serializers.SerializerMethodField()
    is_battalion_admin = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id", "service_number", "name", "rank", "email", "role",
            "unit", "battalion", "formation", "detachment",
            "battalion_name", "battalion_type", "detachment_name",
            "is_active", "is_superuser", "is_battalion_admin", "must_change_password", "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def get_battalion_name(self, obj):
        return obj.battalion.name if obj.battalion else None

    def get_battalion_type(self, obj):
        return obj.battalion.battalion_type if obj.battalion else None

    def get_detachment_name(self, obj):
        return obj.detachment.name if obj.detachment else None

    def get_is_superuser(self, obj):
        return bool(obj.is_superuser)

    def get_is_battalion_admin(self, obj):
        return bool(obj.role == "admin" and not obj.is_superuser and obj.battalion_id)


class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6)

    class Meta:
        model = User
        fields = [
            "service_number", "name", "rank", "email", "role",
            "unit", "battalion", "formation", "detachment", "password",
        ]

    def validate(self, data):
        exempt_roles = {"corps_cmd", "cop"}
        role = data.get("role", "")
        battalion = data.get("battalion")
        detachment = data.get("detachment")
        if role not in exempt_roles and not battalion and not detachment:
            raise serializers.ValidationError(
                {"battalion": "Battalion or Detachment is required for this role."}
            )
        return data

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class LoginSerializer(serializers.Serializer):
    service_number = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, data):
        user = authenticate(username=data["service_number"], password=data["password"])
        if not user:
            raise serializers.ValidationError("Invalid service number or password.")
        if not user.is_active:
            raise serializers.ValidationError("Account is disabled.")
        data["user"] = user
        return data


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=6)

    def validate_current_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Current password is incorrect.")
        return value
