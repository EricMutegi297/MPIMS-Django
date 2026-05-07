from django.contrib.auth import login, logout
from rest_framework import status, generics, permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from .models import User
from .serializers import UserSerializer, UserCreateSerializer, LoginSerializer, ChangePasswordSerializer


class IsBattalionScopedAdmin(permissions.BasePermission):
    """Allow writes to superuser or battalion admin (role=admin with a battalion).
    Allow safe reads to any authenticated user."""
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        if request.user.is_superuser:
            return True
        if request.user.role == "admin" and request.user.battalion_id:
            return True
        return False


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
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "mustChangePassword": user.must_change_password,
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
    # Issue fresh tokens so the client doesn’t need to re-login
    refresh = RefreshToken.for_user(request.user)
    return Response({
        "detail": "Password changed successfully.",
        "access": str(refresh.access_token),
        "refresh": str(refresh),
    })


class UserListCreateView(generics.ListCreateAPIView):
    queryset = User.objects.select_related("unit", "battalion", "formation").all()
    serializer_class = UserSerializer
    permission_classes = [IsBattalionScopedAdmin]

    def get_queryset(self):
        user = self.request.user
        qs = User.objects.select_related("unit", "battalion", "formation")
        if user.is_superuser:
            qs = qs.all()
        elif user.battalion_id:
            qs = qs.filter(battalion_id=user.battalion_id)
        else:
            qs = qs.filter(id=user.id)
        # Optional role filter
        role = self.request.query_params.get("role")
        if role:
            qs = qs.filter(role=role)
        return qs

    def get_serializer_class(self):
        if self.request.method == "POST":
            return UserCreateSerializer
        return UserSerializer


class UserDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [IsBattalionScopedAdmin]
