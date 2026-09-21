from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import TodoEventViewSet

router = DefaultRouter()
router.register("", TodoEventViewSet, basename="todo-event")

urlpatterns = [path("", include(router.urls))]
