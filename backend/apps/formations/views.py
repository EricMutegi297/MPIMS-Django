from rest_framework import viewsets, permissions
from django.db.models import Count
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
    queryset = Formation.objects.prefetch_related("units", "battalions__detachments").all()
    serializer_class = FormationSerializer
    permission_classes = [IsSuperAdminOrReadOnly]
    search_fields = ["name", "location", "units__name", "units__code"]
    ordering_fields = ["name", "location", "created_at"]


class BattalionViewSet(viewsets.ModelViewSet):
    queryset = Battalion.objects.select_related("formation").prefetch_related("detachments").annotate(
        case_count=Count("tasked_cases", distinct=True)
    )
    serializer_class = BattalionSerializer
    permission_classes = [IsSuperAdminOrReadOnly]


class UnitViewSet(viewsets.ModelViewSet):
    queryset = Unit.objects.select_related("formation").all()
    serializer_class = UnitSerializer
    filterset_fields = ["formation", "service"]
    permission_classes = [IsSuperAdminOrReadOnly]
    search_fields = ["name", "code", "formation__name", "service", "email", "mobile_no", "location_county"]
    ordering_fields = ["name", "service", "formation__name", "created_at"]


class DetachmentViewSet(viewsets.ModelViewSet):
    queryset = Detachment.objects.select_related("battalion").all()
    serializer_class = DetachmentSerializer
    filterset_fields = ["battalion"]
    permission_classes = [IsSuperAdminOrReadOnly]
