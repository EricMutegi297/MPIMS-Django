from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from rest_framework import serializers

from .access import is_battalion_admin
from .models import User


class UserSerializer(serializers.ModelSerializer):
    battalion_name = serializers.SerializerMethodField()
    battalion_type = serializers.SerializerMethodField()
    detachment_name = serializers.SerializerMethodField()
    is_superuser = serializers.SerializerMethodField()
    totp_configured = serializers.SerializerMethodField()
    totp_required = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id", "service_number", "name", "rank", "email", "role",
            "unit", "battalion", "formation", "detachment",
            "battalion_name", "battalion_type", "detachment_name",
            "is_active", "is_superuser", "must_change_password",
            "totp_configured", "totp_required",
            "created_at",
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

    def get_totp_configured(self, obj):
        try:
            return bool(obj.totp_device.confirmed)
        except Exception:
            return False

    def get_totp_required(self, obj):
        from django.conf import settings

        return bool(getattr(settings, "TOTP_REQUIRED", True))


class UserCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            "service_number", "name", "rank", "email", "role",
            "unit", "battalion", "formation", "detachment",
        ]
        extra_kwargs = {
            "rank":  {"required": True, "allow_blank": False},
            "email": {"required": True, "allow_blank": False},
        }

    def validate(self, data):
        exempt_roles = {"corps_cmd", "cop"}
        role = data.get("role", "")
        battalion = data.get("battalion")
        detachment = data.get("detachment")
        if battalion and detachment and detachment.battalion_id != battalion.id:
            raise serializers.ValidationError(
                {"detachment": "Company must belong to the selected battalion."}
            )
        if role not in exempt_roles and not battalion and not detachment:
            request = self.context.get("request")
            actor = getattr(request, "user", None)
            if is_battalion_admin(actor):
                return data
            raise serializers.ValidationError(
                {"battalion": "Battalion or Company is required for this role."}
            )
        return data

    def create(self, validated_data):
        user = User(**validated_data)
        user.set_unusable_password()
        user.must_change_password = True
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
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=6)

    def validate_old_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Current password is incorrect.")
        return value

    def validate_new_password(self, value):
        user = self.context["request"].user
        if user.check_password(value):
            raise serializers.ValidationError("New password cannot be the same as current password.")
        validate_password(value, user)
        return value


class PasswordResetRequestSerializer(serializers.Serializer):
    identifier = serializers.CharField(required=False, allow_blank=False, max_length=254)
    email = serializers.EmailField(required=False, allow_blank=False, write_only=True)

    def validate(self, data):
        identifier = str(data.get("identifier") or data.get("email") or "").strip()
        if not identifier:
            raise serializers.ValidationError({"identifier": "Enter your email or service number."})
        data["identifier"] = identifier
        return data


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True, min_length=6)

    def validate(self, data):
        try:
            uid = force_str(urlsafe_base64_decode(data["uid"]))
            user = User.objects.get(pk=uid, is_active=True)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            raise serializers.ValidationError({"token": "The password reset link is invalid or has expired."})

        if not default_token_generator.check_token(user, data["token"]):
            raise serializers.ValidationError({"token": "The password reset link is invalid or has expired."})

        if user.check_password(data["new_password"]):
            raise serializers.ValidationError({"new_password": "New password cannot be the same as current password."})
        validate_password(data["new_password"], user)
        data["user"] = user
        return data
