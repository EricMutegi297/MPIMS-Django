from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import GuardroomViewSet, GuardPostViewSet, DetaineeRequestViewSet

router = DefaultRouter()
router.register("guardrooms", GuardroomViewSet, basename="guardroom")
router.register("guard-posts", GuardPostViewSet, basename="guardpost")
router.register("detainee-requests", DetaineeRequestViewSet, basename="detainee-request")
urlpatterns = [path("", include(router.urls))]
