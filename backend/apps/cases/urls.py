from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CaseViewSet, CaseAbstractAttachmentViewSet, InvestigationTeamViewSet

cases_router = DefaultRouter()
cases_router.register("", CaseViewSet, basename="case")

teams_router = DefaultRouter()
teams_router.register("", InvestigationTeamViewSet, basename="investigation-team")

abstracts_router = DefaultRouter()
abstracts_router.register("", CaseAbstractAttachmentViewSet, basename="case-abstract")

urlpatterns = [
    # specific prefixes must come BEFORE the empty-prefix cases router
    path("investigation-teams/", include(teams_router.urls)),
    path("abstracts/", include(abstracts_router.urls)),
    path("", include(cases_router.urls)),
]
