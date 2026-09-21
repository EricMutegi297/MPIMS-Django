import logging
from datetime import timedelta

from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

from apps.notifications.models import Notification
from apps.users.models import User

from .models import TodoEvent

logger = logging.getLogger(__name__)


def event_recipients(event):
    if event.scope == TodoEvent.Scope.CORPS:
        return User.objects.filter(
            role__in=[User.Role.CORPS_CMD, User.Role.SEC_CORPS_CMD],
            is_active=True,
        )
    return User.objects.filter(
        battalion_id=event.battalion_id,
        role__in=[User.Role.CO, User.Role.OC],
        is_active=True,
    )


def send_todo_reminders():
    today = timezone.localdate()
    end_date = today + timedelta(days=5)
    events = TodoEvent.objects.filter(
        event_date__gte=today,
        event_date__lte=end_date,
    ).select_related("battalion")
    sent_count = 0
    for event in events:
        recipients = event_recipients(event)
        recipient_ids = list(recipients.values_list("id", flat=True))
        if not recipient_ids:
            continue
        existing_ids = set(
            Notification.objects.filter(
                recipient_id__in=recipient_ids,
                related_model="todo_event_reminder",
                related_id=event.id,
            ).values_list("recipient_id", flat=True)
        )
        new_users = list(recipients.exclude(id__in=existing_ids))
        days = (event.event_date - today).days
        when = "today" if days == 0 else f"in {days} day{'s' if days != 1 else ''}"
        target = "Corps" if event.scope == TodoEvent.Scope.CORPS else event.battalion.name
        message = f"Reminder: {event.title} is scheduled {when} ({event.event_date}) for {target}."
        Notification.objects.bulk_create([
            Notification(
                recipient=user,
                message=message,
                notification_type=Notification.Type.ALERT,
                related_model="todo_event_reminder",
                related_id=event.id,
            )
            for user in new_users
        ])
        emails = [user.email for user in new_users if user.email]
        if emails:
            try:
                send_mail(
                    subject=f"[MPIMS] Upcoming event: {event.title}",
                    message=f"{message}\n\n{event.description}\nLocation: {event.location or 'Not specified'}",
                    from_email=settings.DEFAULT_FROM_EMAIL,
                    recipient_list=emails,
                    fail_silently=False,
                )
            except Exception:
                logger.exception("Failed to send reminder for todo event %s", event.id)
        sent_count += len(new_users)
    return sent_count
