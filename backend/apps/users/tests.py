import pyotp
from django.contrib.auth.tokens import default_token_generator
from django.core import mail
from django.test import override_settings
from django.urls import reverse
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
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
    TOTP_REQUIRED=False,
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    FRONTEND_URL="http://frontend.test",
    PASSWORD_RESET_RATE_LIMIT=2,
    PASSWORD_RESET_IP_RATE_LIMIT=20,
    PASSWORD_RESET_RATE_WINDOW_MINUTES=15,
    PASSWORD_RESET_LOCKOUT_MINUTES=15,
    PASSWORD_RESET_CONFIRM_FAILURE_LIMIT=3,
    PASSWORD_RESET_CONFIRM_IP_FAILURE_LIMIT=20,
    PASSWORD_RESET_CONFIRM_WINDOW_MINUTES=15,
    PASSWORD_RESET_CONFIRM_LOCKOUT_MINUTES=15,
)
class PasswordResetTests(APITestCase):
    def setUp(self):
        self.reset_url = reverse("password-reset")
        self.confirm_url = reverse("password-reset-confirm")
        self.user = User.objects.create_user(
            service_number="000010",
            password="OldPass123!",
            name="Reset User",
            rank="Cpl",
            email="reset.user@example.test",
            must_change_password=True,
        )
        if hasattr(mail, "outbox"):
            mail.outbox.clear()

    def post_reset(self, email="reset.user@example.test", ip_address="10.20.30.40"):
        return self.client.post(
            self.reset_url,
            {"email": email},
            format="json",
            REMOTE_ADDR=ip_address,
        )

    def reset_uid_and_token(self):
        return (
            urlsafe_base64_encode(force_bytes(self.user.pk)),
            default_token_generator.make_token(self.user),
        )

    def test_forgot_password_sends_reset_email(self):
        response = self.post_reset()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("password reset instructions", response.data["detail"])
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("http://frontend.test/reset-password/", mail.outbox[0].body)

    def test_password_reset_link_sets_new_password(self):
        uid, token = self.reset_uid_and_token()

        response = self.client.post(
            self.confirm_url,
            {"uid": uid, "token": token, "new_password": "NewPass123!"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("NewPass123!"))
        self.assertFalse(self.user.must_change_password)

    def test_forgot_password_is_rate_limited_by_email(self):
        self.assertEqual(self.post_reset().status_code, status.HTTP_200_OK)
        self.assertEqual(self.post_reset().status_code, status.HTTP_200_OK)

        response = self.post_reset()

        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertIn("Too many password reset requests", response.data["detail"])
        self.assertEqual(len(mail.outbox), 2)

        throttle = LoginThrottle.objects.get(scope=LoginThrottle.Scope.PASSWORD_RESET_EMAIL)
        self.assertEqual(throttle.failed_attempts, 3)
        self.assertIsNotNone(throttle.locked_until)

    def test_invalid_reset_tokens_are_rate_limited(self):
        uid, _ = self.reset_uid_and_token()
        for _ in range(2):
            response = self.client.post(
                self.confirm_url,
                {"uid": uid, "token": "bad-token", "new_password": "NewPass123!"},
                format="json",
            )
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        response = self.client.post(
            self.confirm_url,
            {"uid": uid, "token": "bad-token", "new_password": "NewPass123!"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertIn("Too many invalid password reset attempts", response.data["detail"])


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
