from rest_framework import status, generics, permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from .models import User
from .serializers import UserSerializer, UserCreateSerializer, LoginSerializer, ChangePasswordSerializer

# Roles a battalion admin can assign
BATTALION_ADMIN_ROLES = {"co", "detachment", "personnel", "investigator", "adj", "2ic"}
# Roles an IC Det can assign
DET_IC_ROLES = {"personnel", "investigator"}


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
            serializer.save()
        elif _is_battalion_admin(actor):
            if new_role not in BATTALION_ADMIN_ROLES:
                raise PermissionDenied(f"Battalion admin cannot create users with role '{new_role}'.")
            serializer.save(battalion=actor.battalion)
        elif _is_det_ic(actor):
            if new_role not in DET_IC_ROLES:
                raise PermissionDenied(f"IC Det can only create personnel or investigator users.")
            serializer.save(battalion=actor.battalion, detachment=actor.detachment)
        else:
            raise PermissionDenied("You do not have permission to create users.")


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

