from rest_framework import status, generics, permissions
from rest_framework.decorators import api_view, permission_classes
from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from .models import User
from .serializers import (
    UserSerializer,
    UserCreateSerializer,
    LoginSerializer,
    ChangePasswordSerializer,
    InitialPasswordSetSerializer,
)
from .totp import ISSUER, generate_secret, provisioning_uri, verify_totp

# Roles a battalion admin can assign
BATTALION_ADMIN_ROLES = {"co", "detachment", "personnel", "investigator", "adj", "2ic"}
# Roles an IC Det can assign
DET_IC_ROLES = {"personnel", "investigator"}


def _password_setup_link(user, request=None):
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    frontend_url = getattr(settings, "FRONTEND_URL", "").rstrip("/")
    if (not frontend_url or frontend_url == "http://localhost:3000") and request is not None:
        frontend_url = (request.headers.get("Origin") or frontend_url).rstrip("/")
    if not frontend_url:
        frontend_url = "http://localhost:3000"
    return f"{frontend_url}/set-password/{uid}/{token}"


def _send_password_setup_email(user, actor, request=None):
    actor_name = getattr(actor, "name", "") or getattr(actor, "service_number", "") or "an MPIMS administrator"
    setup_link = _password_setup_link(user, request=request)
    message = (
        f"Hello {user.name or user.service_number},\n\n"
        f"An MPIMS account has been created for you by {actor_name}.\n\n"
        "Use the secure link below to choose your own password:\n\n"
        f"{setup_link}\n\n"
        "If you did not expect this account, contact MPIMS support immediately."
    )
    send_mail(
        subject="[MPIMS] Set up your account password",
        message=message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=False,
    )


def _is_hqs_admin(user):
    return (
        user.role == User.Role.ADMIN
        and user.battalion is not None
        and getattr(user.battalion, "battalion_type", None) == "hqs"
    )


def _is_battalion_admin(user):
    return user.role == User.Role.ADMIN and user.battalion is not None and not _is_hqs_admin(user)


def _is_det_ic(user):
    return user.role == User.Role.DETACHMENT


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def login_view(request):
    serializer = LoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    if serializer.validated_data.get("mfa_required"):
        return Response({
            "mfaRequired": True,
            "detail": "Enter your Google Authenticator code.",
        })
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
@permission_classes([permissions.AllowAny])
def set_initial_password(request):
    serializer = InitialPasswordSetSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response({"detail": "Password set successfully. You can now sign in."})


@api_view(["GET"])
def mfa_setup(request):
    user = request.user
    if not user.mfa_secret:
        user.mfa_secret = generate_secret()
        user.save(update_fields=["mfa_secret"])

    account = user.service_number
    return Response({
        "issuer": ISSUER,
        "account": account,
        "secret": user.mfa_secret,
        "provisioning_uri": provisioning_uri(user.mfa_secret, account),
        "mfa_enabled": user.mfa_enabled,
    })


@api_view(["POST"])
def mfa_verify(request):
    user = request.user
    if not user.mfa_secret:
        user.mfa_secret = generate_secret()
        user.save(update_fields=["mfa_secret"])

    otp_code = request.data.get("otp_code", "")
    if not verify_totp(user.mfa_secret, otp_code):
        return Response(
            {"otp_code": "Invalid authentication code."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user.mfa_enabled = True
    user.save(update_fields=["mfa_enabled", "mfa_secret"])
    return Response({
        "detail": "Google Authenticator enabled.",
        "user": UserSerializer(user).data,
    })


class UserListCreateView(generics.ListCreateAPIView):
    serializer_class = UserSerializer

    def get_queryset(self):
        actor = self.request.user
        qs = User.objects.select_related("unit", "battalion", "formation", "detachment").all()

        # Scope by actor's access level
        if actor.is_superuser or _is_hqs_admin(actor):
            pass  # full access
        elif _is_battalion_admin(actor):
            qs = qs.filter(battalion=actor.battalion)
        elif _is_det_ic(actor):
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

        if actor.is_superuser or _is_hqs_admin(actor):
            user = serializer.save()
        elif _is_battalion_admin(actor):
            if new_role not in BATTALION_ADMIN_ROLES:
                raise PermissionDenied(f"Battalion admin cannot create users with role '{new_role}'.")
            user = serializer.save(battalion=actor.battalion)
        elif _is_det_ic(actor):
            if new_role not in DET_IC_ROLES:
                raise PermissionDenied(f"IC Det can only create personnel or investigator users.")
            user = serializer.save(battalion=actor.battalion, detachment=actor.detachment)
        else:
            raise PermissionDenied("You do not have permission to create users.")

        try:
            _send_password_setup_email(user, actor, request=self.request)
        except Exception:
            user.delete()
            raise ValidationError({
                "email": "Account was not created because the password setup email could not be sent."
            })


class UserDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = User.objects.select_related("unit", "battalion", "formation", "detachment").all()
    serializer_class = UserSerializer

    def check_object_permissions(self, request, obj):
        super().check_object_permissions(request, obj)
        actor = request.user

        if actor.is_superuser or _is_hqs_admin(actor):
            return

        if _is_battalion_admin(actor):
            if obj.battalion != actor.battalion:
                raise PermissionDenied("Cannot manage users outside your battalion.")
            if request.method in ("PUT", "PATCH", "DELETE") and obj.role not in BATTALION_ADMIN_ROLES:
                raise PermissionDenied(f"Cannot manage users with role '{obj.role}'.")
        elif _is_det_ic(actor):
            if obj.detachment != actor.detachment:
                raise PermissionDenied("Cannot manage users outside your detachment.")
            if request.method in ("PUT", "PATCH", "DELETE") and obj.role not in DET_IC_ROLES:
                raise PermissionDenied(f"Cannot manage users with role '{obj.role}'.")
        else:
            raise PermissionDenied("You do not have permission to manage users.")

