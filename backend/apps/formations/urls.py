from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register("formations", views.FormationViewSet)
router.register("battalions", views.BattalionViewSet)
router.register("units", views.UnitViewSet)
router.register("detachments", views.DetachmentViewSet)

urlpatterns = [path("", include(router.urls))]
