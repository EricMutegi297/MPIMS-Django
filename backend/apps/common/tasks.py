import logging

from celery import shared_task
from django.core.mail import send_mail

from apps.common.fields import decrypt_value

logger = logging.getLogger(__name__)


def _decrypt_email_value(value):
    decrypted = decrypt_value(value)
    if not isinstance(decrypted, str) or decrypted.startswith("[Encrypted text unavailable"):
        raise ValueError("Email task encryption key is unavailable.")
    return decrypted


@shared_task(
    ignore_result=True,
    name="apps.common.deliver_email",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 5},
)
def deliver_email(subject, message, from_email, recipient_list):
    """Send an email asynchronously using Django's configured email backend."""
    try:
        return send_mail(
            subject=_decrypt_email_value(subject),
            message=_decrypt_email_value(message),
            from_email=_decrypt_email_value(from_email),
            recipient_list=[_decrypt_email_value(email) for email in recipient_list],
            fail_silently=False,
        )
    except Exception:
        logger.exception("Asynchronous email delivery failed.")
        raise
