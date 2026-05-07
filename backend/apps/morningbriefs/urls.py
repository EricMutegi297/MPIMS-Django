from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import MorningBriefViewSet

router = DefaultRouter()
router.register("", MorningBriefViewSet, basename="morningbrief")
urlpatterns = [path("", include(router.urls))]
