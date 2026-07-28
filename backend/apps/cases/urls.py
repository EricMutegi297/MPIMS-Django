from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CaseViewSet, ExhibitStorageRequestViewSet, InvestigationTeamViewSet

cases_router = DefaultRouter()
cases_router.register("", CaseViewSet, basename="case")

teams_router = DefaultRouter()
teams_router.register("", InvestigationTeamViewSet, basename="investigation-team")

exhibits_router = DefaultRouter()
exhibits_router.register("", ExhibitStorageRequestViewSet, basename="exhibit-storage-request")

urlpatterns = [
    # investigation-teams must come BEFORE the empty-prefix cases router
    path("investigation-teams/", include(teams_router.urls)),
    path("exhibits/", include(exhibits_router.urls)),
    path("", include(cases_router.urls)),
]
