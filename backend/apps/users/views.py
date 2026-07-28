from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework import status, generics, permissions
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from .models import User
from .access import has_global_read_access, is_admin_hqs, is_battalion_admin, is_detachment_ic, is_hqs_admin
from .serializers import (
    ChangePasswordSerializer,
    LoginSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    UserCreateSerializer,
    UserSerializer,
)

# Roles a battalion admin can assign
BATTALION_ADMIN_ROLES = {"co", "oc", "detachment", "personnel", "investigator", "hod", "adj", "2ic", "order_nco"}
# Roles an IC Det can assign
DET_IC_ROLES = {"personnel", "investigator"}
CORPS_COMMANDER_MANAGEMENT_ERROR = (
    "Corps Commander accounts can only be managed by a superuser or HQS Admin."
)


def can_manage_corps_commander_account(user):
    return bool(user and user.is_authenticated and (user.is_superuser or is_admin_hqs(user)))


@api_view(["POST"])
@authentication_classes([])
@permission_classes([permissions.AllowAny])
def login_view(request):
    serializer = LoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = serializer.validated_data["user"]
    refresh = RefreshToken.for_user(user)
    return Response(
        {
            "user": UserSerializer(user).data,
            "mustChangePassword": user.must_change_password,
            "access": str(refresh.access_token),
            "refresh": str(refresh),
        }
    )


@api_view(["POST"])
def logout_view(request):
    # JWT is stateless — client discards the tokens
    return Response({"detail": "Logged out successfully."})


@api_view(["GET"])
def me(request):
    return Response(UserSerializer(request.user).data)


@api_view(["POST"])
def change_password(request):
    serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
    serializer.is_valid(raise_exception=True)
    request.user.set_password(serializer.validated_data["new_password"])
    request.user.must_change_password = False
    request.user.save(update_fields=["password", "must_change_password"])
    # Issue fresh tokens (old refresh token is effectively invalidated by the password change)
    refresh = RefreshToken.for_user(request.user)
    return Response({
        "detail": "Password changed successfully.",
        "access": str(refresh.access_token),
        "refresh": str(refresh),
    })


@api_view(["POST"])
@authentication_classes([])
@permission_classes([permissions.AllowAny])
def password_reset_request(request):
    serializer = PasswordResetRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    email = serializer.validated_data["email"].strip()
    users = User.objects.filter(email__iexact=email, is_active=True)
    frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:3000").rstrip("/")

    for user in users:
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        reset_url = f"{frontend_url}/reset-password/{uid}/{token}"
        message = (
            f"Dear {user.rank + ' ' if user.rank else ''}{user.name},\n\n"
            "A password reset was requested for your MPIMS account.\n\n"
            f"Service number: {user.service_number}\n"
            f"Reset link: {reset_url}\n\n"
            "If you did not request this reset, ignore this email and your password will remain unchanged."
        )
        send_mail(
            subject="MPIMS Password Reset",
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=True,
        )

    return Response({
        "detail": "If that email belongs to an active MPIMS account, password reset instructions have been sent."
    })


@api_view(["POST"])
@authentication_classes([])
@permission_classes([permissions.AllowAny])
def password_reset_confirm(request):
    serializer = PasswordResetConfirmSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = serializer.validated_data["user"]
    user.set_password(serializer.validated_data["new_password"])
    user.must_change_password = False
    user.save(update_fields=["password", "must_change_password"])
    return Response({"detail": "Password reset successfully. You can now sign in."})


class UserListCreateView(generics.ListCreateAPIView):
    serializer_class = UserSerializer

    def get_queryset(self):
        actor = self.request.user
        qs = User.objects.select_related("unit", "battalion", "formation", "detachment").all()

        # Scope by actor's access level
        if has_global_read_access(actor):
            pass  # full access
        elif is_battalion_admin(actor):
            qs = qs.filter(battalion=actor.battalion)
        elif is_detachment_ic(actor):
            qs = qs.filter(detachment=actor.detachment)
        else:
            qs = qs.filter(battalion=actor.battalion) if actor.battalion else qs.none()

        # Additional filters from query params
        role = self.request.query_params.get("role")
        battalion = self.request.query_params.get("battalion")
        detachment = self.request.query_params.get("detachment")
        search = self.request.query_params.get("search")
        if role:
            qs = qs.filter(role=role)
        if battalion:
            qs = qs.filter(battalion_id=battalion)
        if detachment:
            qs = qs.filter(detachment_id=detachment)
        if search:
            qs = qs.filter(name__icontains=search) | qs.filter(service_number__icontains=search)
        return qs.order_by("name")

    def get_serializer_class(self):
        if self.request.method == "POST":
            return UserCreateSerializer
        return UserSerializer

    def perform_create(self, serializer):
        actor = self.request.user
        new_role = serializer.validated_data.get("role", "")

        if new_role == User.Role.CORPS_CMD and not can_manage_corps_commander_account(actor):
            raise PermissionDenied(CORPS_COMMANDER_MANAGEMENT_ERROR)

        if actor.is_superuser or is_hqs_admin(actor):
            serializer.save()
        elif is_battalion_admin(actor):
            if new_role not in BATTALION_ADMIN_ROLES:
                raise PermissionDenied(f"Battalion admin cannot create users with role '{new_role}'.")
            serializer.save(battalion=actor.battalion)
        elif is_detachment_ic(actor):
            if new_role not in DET_IC_ROLES:
                raise PermissionDenied(f"IC Det can only create personnel or investigator users.")
            serializer.save(battalion=actor.battalion, detachment=actor.detachment)
        else:
            raise PermissionDenied("You do not have permission to create users.")


class UserDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = User.objects.select_related("unit", "battalion", "formation", "detachment").all()
    serializer_class = UserSerializer

    def perform_update(self, serializer):
        actor = self.request.user
        current_role = getattr(serializer.instance, "role", "")
        new_role = serializer.validated_data.get("role", current_role)

        if (
            (current_role == User.Role.CORPS_CMD or new_role == User.Role.CORPS_CMD)
            and not can_manage_corps_commander_account(actor)
        ):
            raise PermissionDenied(CORPS_COMMANDER_MANAGEMENT_ERROR)

        serializer.save()

    def perform_destroy(self, instance):
        actor = self.request.user
        if instance.role == User.Role.CORPS_CMD and not can_manage_corps_commander_account(actor):
            raise PermissionDenied(CORPS_COMMANDER_MANAGEMENT_ERROR)
        instance.delete()

    def check_object_permissions(self, request, obj):
        super().check_object_permissions(request, obj)
        actor = request.user

        if has_global_read_access(actor):
            if actor.role == User.Role.CORPS_CMD and request.method not in permissions.SAFE_METHODS:
                raise PermissionDenied("Corps Commander has read-only command oversight access.")
            return

        if is_battalion_admin(actor):
            if obj.battalion != actor.battalion:
                raise PermissionDenied("Cannot manage users outside your battalion.")
            if request.method in ("PUT", "PATCH", "DELETE") and obj.role not in BATTALION_ADMIN_ROLES:
                raise PermissionDenied(f"Cannot manage users with role '{obj.role}'.")
        elif is_detachment_ic(actor):
            if obj.detachment != actor.detachment:
                raise PermissionDenied("Cannot manage users outside your detachment.")
            if request.method in ("PUT", "PATCH", "DELETE") and obj.role not in DET_IC_ROLES:
                raise PermissionDenied(f"Cannot manage users with role '{obj.role}'.")
        elif request.method in permissions.SAFE_METHODS and actor.battalion_id and obj.battalion_id == actor.battalion_id:
            return
        else:
            raise PermissionDenied("You do not have permission to manage users.")

