from rest_framework import viewsets, permissions
from .models import Guardroom, GuardPost
from .serializers import GuardroomSerializer, GuardPostSerializer


class IsSuperAdminOrReadOnly(permissions.BasePermission):
    """Kept for backward-compat; GuardPost still uses it."""
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return bool(request.user.is_superuser)


class IsBattalionScopedAdmin(permissions.BasePermission):
    """Allow writes to superuser OR battalion admin (role=admin with a battalion)."""
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


class GuardroomViewSet(viewsets.ModelViewSet):
    queryset = Guardroom.objects.select_related("unit", "ic").prefetch_related("posts").all()
    serializer_class = GuardroomSerializer
    filterset_fields = ["unit", "is_active"]
    permission_classes = [IsBattalionScopedAdmin]

    def get_queryset(self):
        user = self.request.user
        qs = Guardroom.objects.select_related("unit", "ic").prefetch_related("posts")
        if not user.is_authenticated:
            return qs.none()
        if user.is_superuser:
            return qs.all()
        if user.battalion_id:
            return qs.filter(unit__battalion_id=user.battalion_id)
        return qs.all()


class GuardPostViewSet(viewsets.ModelViewSet):
    queryset = GuardPost.objects.select_related("guardroom").prefetch_related("assigned_personnel").all()
    serializer_class = GuardPostSerializer
    filterset_fields = ["guardroom"]
    permission_classes = [IsSuperAdminOrReadOnly]
