from unittest.mock import patch

from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase, override_settings

from apps.common.fields import (
    ENCRYPTED_PREFIX,
    _fernet_for_secret,
    _configured_key_sources,
    decrypt_value,
    encrypt_value,
)
from apps.common.mail import enqueue_email
from apps.common.tasks import deliver_email


class EncryptedFieldKeyTests(SimpleTestCase):
    @override_settings(
        FIELD_ENCRYPTION_KEY="",
        FIELD_ENCRYPTION_OLD_KEYS="",
        SECRET_KEY="django-secret",
    )
    def test_secret_key_is_not_used_as_an_encryption_fallback(self):
        self.assertEqual(_configured_key_sources(), [])
        with self.assertRaises(ImproperlyConfigured):
            encrypt_value("sensitive data")

    @override_settings(
        FIELD_ENCRYPTION_KEY="dedicated-encryption-key",
        FIELD_ENCRYPTION_OLD_KEYS="previous-encryption-key",
        SECRET_KEY="django-secret",
    )
    def test_active_and_previous_encryption_keys_are_independent(self):
        encrypted = encrypt_value("sensitive data")
        old_token = _fernet_for_secret("previous-encryption-key").encrypt(
            b"older sensitive data"
        )

        self.assertEqual(
            _configured_key_sources(),
            ["dedicated-encryption-key", "previous-encryption-key"],
        )
        self.assertEqual(decrypt_value(encrypted), "sensitive data")
        self.assertEqual(
            decrypt_value(f"{ENCRYPTED_PREFIX}{old_token.decode('ascii')}"),
            "older sensitive data",
        )


class AsyncEmailTests(SimpleTestCase):
    @override_settings(FIELD_ENCRYPTION_KEY="test-email-encryption-key")
    def test_email_is_queued_on_commit_with_original_message_arguments(self):
        with patch("apps.common.mail.deliver_email.apply_async") as apply_async:
            callbacks = []
            with patch(
                "apps.common.mail.transaction.on_commit",
                side_effect=callbacks.append,
            ):
                queued = enqueue_email(
                    subject="Subject",
                    message="Body",
                    from_email="sender@example.test",
                    recipient_list=["one@example.test", "two@example.test"],
                    fail_silently=True,
                )

            self.assertTrue(queued)
            apply_async.assert_not_called()
            self.assertEqual(len(callbacks), 1)
            callbacks[0]()

        apply_async.assert_called_once()
        queued_kwargs = apply_async.call_args.kwargs["kwargs"]
        self.assertEqual(decrypt_value(queued_kwargs["subject"]), "Subject")
        self.assertEqual(decrypt_value(queued_kwargs["message"]), "Body")
        self.assertEqual(decrypt_value(queued_kwargs["from_email"]), "sender@example.test")
        self.assertEqual(
            [decrypt_value(email) for email in queued_kwargs["recipient_list"]],
            ["one@example.test", "two@example.test"],
        )
        self.assertNotIn("Body", repr(queued_kwargs))
        self.assertNotIn("one@example.test", repr(queued_kwargs))

    def test_empty_recipient_list_is_not_queued(self):
        with patch("apps.common.mail.deliver_email.apply_async") as apply_async:
            self.assertFalse(
                enqueue_email("Subject", "Body", "sender@example.test", [])
            )

        apply_async.assert_not_called()

    def test_silent_dispatch_preserves_fail_silently_behavior(self):
        callbacks = []
        with patch("apps.common.mail.transaction.on_commit", side_effect=callbacks.append):
            with patch(
                "apps.common.mail.deliver_email.apply_async",
                side_effect=RuntimeError("broker unavailable"),
            ):
                enqueue_email(
                    "Subject",
                    "Body",
                    "sender@example.test",
                    ["recipient@example.test"],
                    fail_silently=True,
                )
                with self.assertLogs("apps.common.mail", level="ERROR"):
                    callbacks[0]()

    @override_settings(FIELD_ENCRYPTION_KEY="test-email-encryption-key")
    @patch("apps.common.tasks.send_mail", return_value=1)
    def test_delivery_task_uses_django_mail_backend(self, send_mail):
        result = deliver_email.run(
            encrypt_value("Subject"),
            encrypt_value("Body"),
            encrypt_value("sender@example.test"),
            [encrypt_value("recipient@example.test")],
        )

        self.assertEqual(result, 1)
        send_mail.assert_called_once_with(
            subject="Subject",
            message="Body",
            from_email="sender@example.test",
            recipient_list=["recipient@example.test"],
            fail_silently=False,
        )
