from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("apps.users.urls")),
    path("api/cases/", include("apps.cases.urls")),
    path("api/incidents/", include("apps.incidents.urls")),
    path("api/dutyrooms/", include("apps.dutyrooms.urls")),
    path("api/guardrooms/", include("apps.guardrooms.urls")),
    path("api/notifications/", include("apps.notifications.urls")),
    path("api/audit/", include("apps.audit.urls")),
    path("api/morning-briefs/", include("apps.morningbriefs.urls")),
    path("api/formations/", include("apps.formations.urls")),
    path("api/offences/", include("apps.offences.urls")),
]

# Livereload for development
if settings.DEBUG:
    from django.http import HttpResponse
    from django.urls import re_path
    def livereload_ping(request):
        return HttpResponse("pong", content_type="text/plain")
    urlpatterns += [re_path(r"^__reload__/?$", livereload_ping)]

urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
