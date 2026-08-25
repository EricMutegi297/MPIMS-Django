import re

import pyotp
from django.contrib.auth.tokens import default_token_generator
from django.core import mail
from django.test import override_settings
from django.urls import reverse
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework import status
from rest_framework.test import APITestCase

from apps.formations.models import Battalion, Detachment
from apps.notifications.models import Notification

from .models import EmailOTPLoginChallenge, LoginThrottle, TOTPDevice, User


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

    def post_reset(self, identifier="reset.user@example.test", ip_address="10.20.30.40"):
        return self.client.post(
            self.reset_url,
            {"identifier": identifier},
            format="json",
            REMOTE_ADDR=ip_address,
        )

    def post_reset_legacy_email(self, email="reset.user@example.test", ip_address="10.20.30.41"):
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

    def test_forgot_password_accepts_service_number(self):
        response = self.post_reset(self.user.service_number)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("password reset instructions", response.data["detail"])
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("Service number: 000010", mail.outbox[0].body)

    def test_forgot_password_accepts_legacy_email_payload(self):
        response = self.post_reset_legacy_email()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 1)

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
    TOTP_REQUIRED=False,
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
)
class UserManagementPermissionTests(APITestCase):
    def setUp(self):
        self.user_list_url = reverse("user-list")
        self.battalion = Battalion.objects.create(name="1 MP BN")
        self.other_battalion = Battalion.objects.create(name="2 MP BN")
        self.company = Detachment.objects.create(
            battalion=self.battalion,
            company=Detachment.Company.A,
            name="A Coy",
        )
        self.other_company = Detachment.objects.create(
            battalion=self.other_battalion,
            company=Detachment.Company.B,
            name="B Coy",
        )
        self.battalion_admin = User.objects.create_user(
            service_number="700001",
            password="AdminPass123!",
            name="Battalion Admin",
            rank="Maj",
            email="bn.admin@example.test",
            role=User.Role.ADMIN,
            battalion=self.battalion,
            must_change_password=False,
        )
        self.company_ic = User.objects.create_user(
            service_number="700002",
            password="IcPass123!",
            name="Company IC",
            rank="Capt",
            email="ic@example.test",
            role=User.Role.DETACHMENT,
            battalion=self.battalion,
            detachment=self.company,
            must_change_password=False,
        )

    def user_payload(self, service_number="700100", detachment=None):
        payload = {
            "service_number": service_number,
            "name": "New Personnel",
            "rank": "Cpl",
            "email": f"{service_number}@example.test",
            "role": User.Role.PERSONNEL,
        }
        if detachment:
            payload["detachment"] = detachment.id
        return payload

    def test_ic_coy_cannot_create_users(self):
        self.client.force_authenticate(self.company_ic)

        response = self.client.post(
            self.user_list_url,
            self.user_payload(detachment=self.company),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(User.objects.filter(service_number="700100").exists())

    def test_battalion_admin_can_create_user_for_own_company(self):
        self.client.force_authenticate(self.battalion_admin)

        response = self.client.post(
            self.user_list_url,
            self.user_payload(detachment=self.company),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        created = User.objects.get(service_number="700100")
        self.assertEqual(created.battalion, self.battalion)
        self.assertEqual(created.detachment, self.company)

    def test_battalion_admin_cannot_create_user_for_other_battalion_company(self):
        self.client.force_authenticate(self.battalion_admin)

        response = self.client.post(
            self.user_list_url,
            self.user_payload(detachment=self.other_company),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(User.objects.filter(service_number="700100").exists())


@override_settings(
    TOTP_REQUIRED=True,
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
)
class EmailOTPLoginTests(APITestCase):
    def setUp(self):
        self.login_url = reverse("login")
        self.verify_url = reverse("email-otp-login-verify")
        self.user = User.objects.create_user(
            service_number="800001",
            password="CorrectPass123!",
            name="Email OTP User",
            rank="Cpl",
            email="email.otp@example.test",
            mfa_exempt=True,
            email_otp_enabled=True,
            must_change_password=False,
        )
        if hasattr(mail, "outbox"):
            mail.outbox.clear()

    def test_email_otp_user_receives_code_and_verifies_login(self):
        response = self.client.post(
            self.login_url,
            {"service_number": self.user.service_number, "password": "CorrectPass123!"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["requiresEmailOtp"])
        self.assertNotIn("access", response.data)
        self.assertEqual(EmailOTPLoginChallenge.objects.filter(user=self.user).count(), 1)
        self.assertEqual(len(mail.outbox), 1)

        code = re.search(r"\b(\d{6,8})\b", mail.outbox[0].body).group(1)
        verify = self.client.post(
            self.verify_url,
            {"challenge_id": response.data["emailOtpChallenge"]["challenge_id"], "code": code},
            format="json",
        )

        self.assertEqual(verify.status_code, status.HTTP_200_OK)
        self.assertIn("access", verify.data)
        self.assertFalse(verify.data["totpSetupRequired"])
        self.assertFalse(verify.data["requiresEmailOtp"])

    def test_mfa_exempt_without_email_otp_skips_authenticator_setup(self):
        self.user.email_otp_enabled = False
        self.user.save(update_fields=["email_otp_enabled"])

        response = self.client.post(
            self.login_url,
            {"service_number": self.user.service_number, "password": "CorrectPass123!"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertFalse(response.data["totpSetupRequired"])
        self.assertFalse(response.data["requiresEmailOtp"])
        self.assertEqual(len(mail.outbox), 0)


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
