from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("apps.users.urls")),
    path("api/cases/", include("apps.cases.urls")),
    path("api/incidents/", include("apps.incidents.urls")),
    path("api/guardrooms/", include("apps.guardrooms.urls")),
    path("api/notifications/", include("apps.notifications.urls")),
    path("api/morning-briefs/", include("apps.morningbriefs.urls")),
    path("api/formations/", include("apps.formations.urls")),
    path("api/offences/", include("apps.offences.urls")),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
