from rest_framework import serializers
from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from .models import User
from .totp import verify_totp


class UserSerializer(serializers.ModelSerializer):
    battalion_name = serializers.SerializerMethodField()
    battalion_type = serializers.SerializerMethodField()
    detachment_name = serializers.SerializerMethodField()
    is_superuser = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id", "service_number", "name", "rank", "email", "role",
            "unit", "battalion", "formation", "detachment",
            "battalion_name", "battalion_type", "detachment_name",
            "is_active", "is_superuser", "must_change_password", "mfa_enabled", "created_at",
        ]
        read_only_fields = ["id", "created_at", "mfa_enabled"]

    def get_battalion_name(self, obj):
        return obj.battalion.name if obj.battalion else None

    def get_battalion_type(self, obj):
        return obj.battalion.battalion_type if obj.battalion else None

    def get_detachment_name(self, obj):
        return obj.detachment.name if obj.detachment else None

    def get_is_superuser(self, obj):
        return bool(obj.is_superuser)


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
        exempt_roles = {"corps_cmd", "cop", "so1_legal", "so1_ops", "so2_legal", "so2_ops"}
        role = data.get("role", "")
        battalion = data.get("battalion")
        detachment = data.get("detachment")
        if role not in exempt_roles and not battalion and not detachment:
            raise serializers.ValidationError(
                {"battalion": "Battalion or Detachment is required for this role."}
            )
        return data

    def create(self, validated_data):
        user = User(**validated_data)
        user.set_unusable_password()
        user.must_change_password = True
        user.save()
        return user


class InitialPasswordSetSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True, min_length=8)
    confirm_password = serializers.CharField(write_only=True)

    def validate(self, data):
        if data["new_password"] != data["confirm_password"]:
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})

        try:
            uid = force_str(urlsafe_base64_decode(data["uid"]))
            user = User.objects.get(pk=uid)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            raise serializers.ValidationError({"token": "This password setup link is invalid."})

        if not default_token_generator.check_token(user, data["token"]):
            raise serializers.ValidationError({"token": "This password setup link is invalid or has expired."})

        try:
            validate_password(data["new_password"], user=user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"new_password": list(exc.messages)})

        data["user"] = user
        return data

    def save(self, **kwargs):
        user = self.validated_data["user"]
        user.set_password(self.validated_data["new_password"])
        user.must_change_password = False
        user.save(update_fields=["password", "must_change_password", "updated_at"])
        return user


class LoginSerializer(serializers.Serializer):
    service_number = serializers.CharField()
    password = serializers.CharField(write_only=True)
    otp_code = serializers.CharField(required=False, allow_blank=True, write_only=True)

    def validate(self, data):
        user = authenticate(username=data["service_number"], password=data["password"])
        if not user:
            raise serializers.ValidationError("Invalid service number or password.")
        if not user.is_active:
            raise serializers.ValidationError("Account is disabled.")
        otp_code = data.get("otp_code", "")
        if user.mfa_enabled:
            if not otp_code:
                data["mfa_required"] = True
            elif not verify_totp(user.mfa_secret, otp_code):
                raise serializers.ValidationError({"otp_code": "Invalid authentication code."})
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
