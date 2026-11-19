from django.contrib.auth import logout
from django.http import HttpResponseRedirect


class SuperuserAdminMFAMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        user = getattr(request, "user", None)
        if (
            request.path.startswith("/admin/")
            and user
            and user.is_authenticated
            and user.is_superuser
            and request.session.get("mfa_method") != "email_otp"
        ):
            logout(request)
            return HttpResponseRedirect("/admin/login/")
        return self.get_response(request)
