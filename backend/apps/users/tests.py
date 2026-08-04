from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.notifications.models import Notification

from .models import LoginThrottle, User


@override_settings(
    TOTP_REQUIRED=False,
    LOGIN_FAILURE_LIMIT=5,
    LOGIN_IP_FAILURE_LIMIT=25,
    LOGIN_FAILURE_WINDOW_MINUTES=15,
    LOGIN_LOCKOUT_MINUTES=15,
)
class LoginThrottleTests(APITestCase):
    def setUp(self):
        self.login_url = reverse("login")
        self.user = User.objects.create_user(
            service_number="000001",
            password="CorrectPass123!",
            name="Test User",
            rank="Sgt",
            must_change_password=False,
        )
        self.security_admin = User.objects.create_superuser(
            service_number="999999",
            password="AdminPass123!",
            name="Security Admin",
        )

    def post_login(self, password, ip_address="10.10.10.10"):
        return self.client.post(
            self.login_url,
            {"service_number": self.user.service_number, "password": password},
            format="json",
            REMOTE_ADDR=ip_address,
        )

    def test_bad_password_locks_account_after_five_attempts(self):
        for _ in range(4):
            response = self.post_login("WrongPass123!")
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        response = self.post_login("WrongPass123!")
        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertIn("Too many failed login attempts", response.data["detail"])

        account_throttle = LoginThrottle.objects.get(scope=LoginThrottle.Scope.ACCOUNT)
        self.assertEqual(account_throttle.failed_attempts, 5)
        self.assertIsNotNone(account_throttle.locked_until)

        response = self.post_login("CorrectPass123!")
        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

        self.assertTrue(
            Notification.objects.filter(
                recipient=self.security_admin,
                notification_type=Notification.Type.ALERT,
                related_model="LoginThrottle",
            ).exists()
        )

    def test_successful_login_resets_account_failure_counter(self):
        for _ in range(4):
            response = self.post_login("WrongPass123!")
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        response = self.post_login("CorrectPass123!")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        account_throttle = LoginThrottle.objects.get(scope=LoginThrottle.Scope.ACCOUNT)
        self.assertEqual(account_throttle.failed_attempts, 0)
        self.assertIsNone(account_throttle.locked_until)

        for _ in range(4):
            response = self.post_login("WrongPass123!")
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        response = self.post_login("CorrectPass123!")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
