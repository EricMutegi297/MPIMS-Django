from rest_framework import viewsets, permissions
from django.db.models import Q
from django.db.models import Count, Prefetch
from .models import Formation, Battalion, Unit, Company, Detachment
from .serializers import FormationSerializer, BattalionSerializer, UnitSerializer, CompanySerializer, DetachmentSerializer
from apps.users.access import has_global_read_access, is_battalion_admin


class IsSuperAdminOrReadOnly(permissions.BasePermission):
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return bool(request.user.is_superuser)


class DetachmentManagementPermission(permissions.BasePermission):
    def _owns_company(self, user, company):
        return bool(
            user.is_superuser
            or (
                is_battalion_admin(user)
                and company is not None
                and company.battalion_id == user.battalion_id
            )
        )

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        if request.method == "POST":
            company = Company.objects.filter(pk=request.data.get("company")).first()
            return self._owns_company(request.user, company)
        return True

    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        return self._owns_company(request.user, obj.company)


class FormationViewSet(viewsets.ModelViewSet):
    queryset = Formation.objects.all()
    serializer_class = FormationSerializer
    permission_classes = [IsSuperAdminOrReadOnly]
    search_fields = ["name", "location", "units__name", "units__code"]
    ordering_fields = ["name", "location", "created_at"]

    def get_queryset(self):
        qs = Formation.objects.prefetch_related("units", "battalions__companies__detachments").all()
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
        ).select_related("company", "company__battalion").order_by("name")
        company_qs = Company.objects.annotate(
            case_count=Count("detachments__tasked_cases", distinct=True)
        ).prefetch_related(Prefetch("detachments", queryset=detachment_qs)).order_by("company", "name")
        qs = Battalion.objects.select_related("formation").prefetch_related(
            Prefetch("companies", queryset=company_qs)
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
    filterset_fields = ["formation", "service", "battalion"]
    permission_classes = [IsSuperAdminOrReadOnly]
    search_fields = ["name", "code", "formation__name", "service", "email", "mobile_no", "location_county"]
    ordering_fields = ["name", "service", "formation__name", "created_at"]

    def get_queryset(self):
        qs = Unit.objects.select_related("formation", "battalion").all()
        user = self.request.user
        if self.request.method in permissions.SAFE_METHODS:
            return qs
        if has_global_read_access(user):
            return qs
        if user.battalion_id:
            return qs.filter(battalion_id=user.battalion_id)
        return qs.none()


class CompanyViewSet(viewsets.ModelViewSet):
    queryset = Company.objects.all()
    serializer_class = CompanySerializer
    permission_classes = [IsSuperAdminOrReadOnly]
    filterset_fields = ["battalion", "company"]

    def get_queryset(self):
        qs = Company.objects.select_related("battalion").prefetch_related("detachments").annotate(
            case_count=Count("detachments__tasked_cases", distinct=True)
        ).order_by("company", "name", "id")
        user = self.request.user
        if has_global_read_access(user):
            return qs
        if user.battalion_id:
            return qs.filter(battalion_id=user.battalion_id)
        return qs.none()


class DetachmentViewSet(viewsets.ModelViewSet):
    queryset = Detachment.objects.all()
    serializer_class = DetachmentSerializer
    filterset_fields = ["company", "company__battalion"]
    permission_classes = [DetachmentManagementPermission]

    def get_queryset(self):
        qs = Detachment.objects.select_related("company", "company__battalion").annotate(
            case_count=Count("tasked_cases", distinct=True)
        ).order_by("company", "name", "id")
        user = self.request.user
        battalion_id = self.request.query_params.get("battalion")
        if battalion_id:
            qs = qs.filter(company__battalion_id=battalion_id)
        if has_global_read_access(user):
            return qs
        if user.battalion_id:
            return qs.filter(company__battalion_id=user.battalion_id)
        return qs.none()
