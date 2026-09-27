from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.http import Http404
import re

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
    path("api/todos/", include("apps.todos.urls")),
]

def deny_case_media(request, path=""):
    raise Http404("File not found.")


media_prefix = re.escape(settings.MEDIA_URL.lstrip("/"))
urlpatterns.append(
    re_path(rf"^{media_prefix}cases/(?P<path>.*)$", deny_case_media)
)

# Livereload for development
if settings.DEBUG:
    from django.http import HttpResponse
    def livereload_ping(request):
        return HttpResponse("pong", content_type="text/plain")
    urlpatterns += [re_path(r"^__reload__/?$", livereload_ping)]

urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
