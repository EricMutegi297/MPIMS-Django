import logging

from django.db import transaction

from apps.common.fields import encrypt_value

from .tasks import deliver_email

logger = logging.getLogger(__name__)


def enqueue_email(
    subject,
    message,
    from_email,
    recipient_list,
    fail_silently=False,
):
    """Queue email after commit; fail_silently controls broker errors, not delivery."""
    recipients = list(recipient_list)
    if not recipients:
        return False

    kwargs = {
        "subject": encrypt_value(subject),
        "message": encrypt_value(message),
        "from_email": encrypt_value(from_email),
        "recipient_list": [encrypt_value(recipient) for recipient in recipients],
    }

    def dispatch():
        try:
            deliver_email.apply_async(kwargs=kwargs)
        except Exception:
            if not fail_silently:
                raise
            logger.exception("Failed to enqueue an asynchronous email.")

    transaction.on_commit(dispatch)
    return True
