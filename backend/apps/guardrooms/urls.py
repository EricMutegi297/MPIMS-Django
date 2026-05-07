from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import GuardroomViewSet, GuardPostViewSet

router = DefaultRouter()
router.register("guardrooms", GuardroomViewSet, basename="guardroom")
router.register("guard-posts", GuardPostViewSet, basename="guardpost")
urlpatterns = [path("", include(router.urls))]
