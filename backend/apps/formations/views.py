from rest_framework import viewsets, permissions
from django.db.models import Q
from django.db.models import Count, Prefetch
from .models import Formation, Battalion, Unit, Detachment
from .serializers import FormationSerializer, BattalionSerializer, UnitSerializer, DetachmentSerializer
from apps.users.access import has_global_read_access


class IsSuperAdminOrReadOnly(permissions.BasePermission):
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return bool(request.user.is_superuser)


class FormationViewSet(viewsets.ModelViewSet):
    queryset = Formation.objects.all()
    serializer_class = FormationSerializer
    permission_classes = [IsSuperAdminOrReadOnly]

    def get_queryset(self):
        qs = Formation.objects.prefetch_related("units", "battalions__detachments").all()
        user = self.request.user
        if has_global_read_access(user):
            return qs
        if user.battalion_id:
            return qs.filter(Q(id=user.formation_id) | Q(battalions__id=user.battalion_id)).distinct()
        return qs.none()


class BattalionViewSet(viewsets.ModelViewSet):
    queryset = Battalion.objects.all()
    serializer_class = BattalionSerializer
    permission_classes = [IsSuperAdminOrReadOnly]

    def get_queryset(self):
        detachment_qs = Detachment.objects.annotate(
            case_count=Count("tasked_cases", distinct=True)
        ).order_by("company", "name")
        qs = Battalion.objects.select_related("formation").prefetch_related(
            Prefetch("detachments", queryset=detachment_qs)
        ).annotate(
            case_count=Count("tasked_cases", distinct=True)
        )
        user = self.request.user
        if has_global_read_access(user):
            return qs
        if user.battalion_id:
            return qs.filter(id=user.battalion_id)
        return qs.none()


class UnitViewSet(viewsets.ModelViewSet):
    queryset = Unit.objects.all()
    serializer_class = UnitSerializer
    filterset_fields = ["formation", "service"]
    permission_classes = [IsSuperAdminOrReadOnly]

    def get_queryset(self):
        qs = Unit.objects.select_related("formation", "battalion").all()
        user = self.request.user
        if has_global_read_access(user):
            return qs
        if user.battalion_id:
            return qs.filter(battalion_id=user.battalion_id)
        return qs.none()


class DetachmentViewSet(viewsets.ModelViewSet):
    queryset = Detachment.objects.all()
    serializer_class = DetachmentSerializer
    filterset_fields = ["battalion"]
    permission_classes = [IsSuperAdminOrReadOnly]

    def get_queryset(self):
        qs = Detachment.objects.select_related("battalion").annotate(
            case_count=Count("tasked_cases", distinct=True)
        )
        user = self.request.user
        if has_global_read_access(user):
            return qs
        if user.battalion_id:
            return qs.filter(battalion_id=user.battalion_id)
        return qs.none()
