from rest_framework.routers import DefaultRouter

from .views import DutyRosterViewSet, OccurrenceBookViewSet, OccurrenceEntryViewSet

router = DefaultRouter()
router.register("rosters", DutyRosterViewSet, basename="duty-roster")
router.register("books", OccurrenceBookViewSet, basename="occurrence-book")
router.register("entries", OccurrenceEntryViewSet, basename="occurrence-entry")

urlpatterns = router.urls

