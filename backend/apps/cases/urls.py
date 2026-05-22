from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CaseViewSet, InvestigationTeamViewSet

cases_router = DefaultRouter()
cases_router.register("", CaseViewSet, basename="case")

teams_router = DefaultRouter()
teams_router.register("", InvestigationTeamViewSet, basename="investigation-team")

urlpatterns = [
    # investigation-teams must come BEFORE the empty-prefix cases router
    path("investigation-teams/", include(teams_router.urls)),
    path("", include(cases_router.urls)),
]
