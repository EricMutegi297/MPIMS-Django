import pyotp
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.notifications.models import Notification

from .models import LoginThrottle, TOTPDevice, User


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


@override_settings(
    TOTP_REQUIRED=True,
    TOTP_CODE_WINDOW=1,
    TOTP_LOCKOUT_MINUTES=15,
)
class TOTPSetupTests(APITestCase):
    def setUp(self):
        self.login_url = reverse("login")
        self.setup_url = reverse("totp-setup")
        self.confirm_url = reverse("totp-setup-confirm")
        self.user = User.objects.create_user(
            service_number="000002",
            password="CorrectPass123!",
            name="MFA User",
            rank="Cpl",
            must_change_password=False,
        )

    def authenticate_for_setup(self):
        response = self.client.post(
            self.login_url,
            {"service_number": self.user.service_number, "password": "CorrectPass123!"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["totpSetupRequired"])
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
        return response

    def test_pending_setup_reuses_secret_until_regenerated(self):
        self.authenticate_for_setup()

        first = self.client.post(self.setup_url, {}, format="json")
        self.assertEqual(first.status_code, status.HTTP_200_OK)

        second = self.client.post(self.setup_url, {}, format="json")
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(second.data["secret"], first.data["secret"])

        regenerated = self.client.post(self.setup_url, {"regenerate": True}, format="json")
        self.assertEqual(regenerated.status_code, status.HTTP_200_OK)
        self.assertNotEqual(regenerated.data["secret"], first.data["secret"])

        device = TOTPDevice.objects.get(user=self.user)
        self.assertFalse(device.confirmed)
        self.assertEqual(device.failed_attempts, 0)

    def test_current_setup_code_confirms_totp_and_issues_full_tokens(self):
        self.authenticate_for_setup()
        setup = self.client.post(self.setup_url, {}, format="json")
        self.assertEqual(setup.status_code, status.HTTP_200_OK)

        code = pyotp.TOTP(setup.data["secret"]).now()
        response = self.client.post(self.confirm_url, {"code": code}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["totpSetupRequired"])
        self.assertTrue(response.data["user"]["totp_configured"])

        device = TOTPDevice.objects.get(user=self.user)
        self.assertTrue(device.confirmed)
        self.assertEqual(device.failed_attempts, 0)
