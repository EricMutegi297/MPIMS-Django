from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from . import views

urlpatterns = [
    path("login/", views.login_view, name="login"),
    path("logout/", views.logout_view, name="logout"),
    path("me/", views.me, name="me"),
    path("change-password/", views.change_password, name="change-password"),
    path("password-reset/", views.request_password_reset, name="password-reset"),
    path("set-password/", views.set_initial_password, name="set-initial-password"),
    path("mfa/setup/", views.mfa_setup, name="mfa-setup"),
    path("mfa/verify/", views.mfa_verify, name="mfa-verify"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token-refresh"),
    path("users/", views.UserListCreateView.as_view(), name="user-list"),
    path("users/<int:pk>/", views.UserDetailView.as_view(), name="user-detail"),
]
