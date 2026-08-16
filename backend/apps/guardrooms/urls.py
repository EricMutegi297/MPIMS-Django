from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import GuardroomPlacementRequestViewSet, GuardroomViewSet, GuardPostViewSet

router = DefaultRouter()
router.register("guardrooms", GuardroomViewSet, basename="guardroom")
router.register("guard-posts", GuardPostViewSet, basename="guardpost")
router.register("placement-requests", GuardroomPlacementRequestViewSet, basename="guardroom-placement-request")
urlpatterns = [path("", include(router.urls))]
