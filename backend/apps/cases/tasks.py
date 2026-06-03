"""
Scheduled tasks for the cases app.

send_close_request_reminders():
    Runs once per day.
    Finds every case that has close_requested=True but is not yet CLOSED,
    then re-notifies all HQ-level admins via dashboard notification + email.
"""

import logging

logger = logging.getLogger(__name__)


def send_close_request_reminders():
    """Daily reminder: notify HQS admins of all pending close requests."""
    try:
        from django.conf import settings as django_settings
        from django.core.mail import send_mail

        from apps.formations.models import Battalion
        from apps.notifications.models import Notification
        from apps.users.models import User

        from .models import Case

        pending = Case.objects.filter(
            close_requested=True,
        ).exclude(status=Case.Status.CLOSED)

        if not pending.exists():
            return

        hq_admins = list(
            User.objects.filter(
                role="admin",
                battalion__battalion_type=Battalion.BattalionType.HQS,
                is_active=True,
            )
        )
        if not hq_admins:
            return

        notifications = []
        for case in pending:
            offence_label = (
                case.offence_ref.name.strip()
                if case.offence_ref and case.offence_ref.name
                else (case.offence or "Not provided").strip() or "Not provided"
            )
            case_type = (
                "Court Martial"
                if case.criminal_offence_type == Case.CriminalOffenceType.COURT_MARTIAL
                else "DCI/Civ Police"
            )
            msg = (
                f"[REMINDER] Close request is pending for {case_type} Case No {case.case_number}. "
                f"Offence: {offence_label}. Action required — please review and close."
            )
            for admin in hq_admins:
                notifications.append(
                    Notification(
                        recipient=admin,
                        message=msg,
                        notification_type=Notification.Type.CASE,
                        related_model="case",
                        related_id=case.id,
                    )
                )

        Notification.objects.bulk_create(notifications)

        # Send a single consolidated email per admin listing all pending cases
        email_list = [u.email for u in hq_admins if u.email]
        if email_list:
            case_lines = []
            for case in pending:
                offence_label = (
                    case.offence_ref.name.strip()
                    if case.offence_ref and case.offence_ref.name
                    else (case.offence or "Not provided").strip() or "Not provided"
                )
                case_type = (
                    "Court Martial"
                    if case.criminal_offence_type == Case.CriminalOffenceType.COURT_MARTIAL
                    else "DCI/Civ Police"
                )
                case_lines.append(
                    f"  • {case_type} Case No {case.case_number} — {case.title} | Offence: {offence_label}"
                )
            body = (
                "The following cases have a pending close request and require your action:\n\n"
                + "\n".join(case_lines)
                + "\n\nPlease log in to the MPIMS dashboard to review and close these cases."
            )
            try:
                send_mail(
                    subject=f"[MPIMS] Daily Reminder — {len(pending)} Pending Case Closure(s)",
                    message=body,
                    from_email=django_settings.DEFAULT_FROM_EMAIL,
                    recipient_list=email_list,
                    fail_silently=True,
                )
            except Exception as exc:
                logger.error("Failed to send daily close-reminder emails: %s", exc)

    except Exception as exc:
        logger.error("send_close_request_reminders failed: %s", exc)
