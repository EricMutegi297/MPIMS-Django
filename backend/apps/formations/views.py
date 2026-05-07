from rest_framework import viewsets, permissions
from .models import Formation, Battalion, Unit, Detachment
from .serializers import FormationSerializer, BattalionSerializer, UnitSerializer, DetachmentSerializer


class IsSuperAdminOrReadOnly(permissions.BasePermission):
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return bool(request.user.is_superuser)


class FormationViewSet(viewsets.ModelViewSet):
    queryset = Formation.objects.prefetch_related("battalions__units", "battalions__detachments", "units").all()
    serializer_class = FormationSerializer
    permission_classes = [IsSuperAdminOrReadOnly]


class BattalionViewSet(viewsets.ModelViewSet):
    queryset = Battalion.objects.select_related("formation").prefetch_related("units", "detachments").all()
    serializer_class = BattalionSerializer
    permission_classes = [IsSuperAdminOrReadOnly]


class UnitViewSet(viewsets.ModelViewSet):
    queryset = Unit.objects.select_related("formation", "battalion", "battalion__formation").all()
    serializer_class = UnitSerializer
    filterset_fields = ["formation", "battalion", "service"]
    permission_classes = [IsSuperAdminOrReadOnly]


class DetachmentViewSet(viewsets.ModelViewSet):
    queryset = Detachment.objects.select_related("battalion").all()
    serializer_class = DetachmentSerializer
    filterset_fields = ["battalion"]
    permission_classes = [IsSuperAdminOrReadOnly]
