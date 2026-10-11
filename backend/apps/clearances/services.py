import calendar

from django.db import transaction
from django.utils import timezone

from apps.cases.models import Case
from apps.notifications.models import Notification
from apps.users.models import User

from .models import ClearanceRequest


UNIT_CLEARANCE_NOTIFICATION_ROLES = (
    User.Role.CO,
    User.Role.ADJ,
    User.Role.TWO_IC,
    User.Role.COMMANDANT,
    User.Role.CI,
    User.Role.SI,
    User.Role.DOCUS_CLERK,
)


def add_six_calendar_months(value):
    month_index = value.month - 1 + 6
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    day = min(value.day, calendar.monthrange(year, month)[1])
    return value.replace(year=year, month=month, day=day)


def clearance_validity_status(clearance_request, *, now=None):
    if clearance_request.status != ClearanceRequest.Status.APPROVED:
        return "not_issued"
    if clearance_request.invalidated_at:
        return "invalidated"
    now = now or timezone.now()
    expiry = clearance_request.expires_at
    if expiry is None and clearance_request.reviewed_at:
        expiry = add_six_calendar_months(clearance_request.reviewed_at)
    if expiry is None or expiry <= now:
        return "expired"
    return "valid"


def invalidate_current_certificates(service_numbers, case):
    service_numbers = {str(number).strip() for number in service_numbers if number and str(number).strip()}
    if not service_numbers:
        return 0

    now = timezone.now()
    with transaction.atomic():
        certificates = list(
            ClearanceRequest.objects.select_for_update()
            .select_related("subject")
            .filter(
                subject__service_number__in=service_numbers,
                status=ClearanceRequest.Status.APPROVED,
                expires_at__gt=now,
                invalidated_at__isnull=True,
            )
        )
        if not certificates:
            return 0

        unit_ids = {certificate.subject.unit_id for certificate in certificates}
        recipients_by_unit = {
            unit_id: list(
                User.objects.filter(
                    unit_id=unit_id,
                    is_active=True,
                    role__in=UNIT_CLEARANCE_NOTIFICATION_ROLES,
                )
            )
            for unit_id in unit_ids
            if unit_id is not None
        }
        notifications = []
        for certificate in certificates:
            certificate.invalidated_at = now
            certificate.invalidating_case = case
            certificate.save(update_fields=["invalidated_at", "invalidating_case"])
            message = (
                f"Clearance certificate {certificate.certificate_number} for "
                f"{certificate.subject.name} ({certificate.subject.service_number}) "
                "has been invalidated because a new MPIMS case was recorded. "
                "Please follow up through the chain of command."
            )
            notifications.extend(
                Notification(
                    recipient=recipient,
                    message=message,
                    notification_type=Notification.Type.ALERT,
                    related_model="clearance_request",
                    related_id=certificate.pk,
                    related_case_id=case.pk,
                )
                for recipient in recipients_by_unit.get(certificate.subject.unit_id, [])
            )

        if notifications:
            Notification.objects.bulk_create(notifications)
    return len(certificates)


def _case_service_numbers(case):
    numbers = {case.accused_service_number}
    numbers.update(case.accused_entries.values_list("service_number", flat=True))
    return numbers


def invalidate_for_case_save(case, *, created, previous_state=None):
    if created:
        return invalidate_current_certificates({case.accused_service_number}, case)

    previous_state = previous_state or {}
    numbers = set()
    previous_service_number = previous_state.get("accused_service_number", "")
    if case.accused_service_number != previous_service_number:
        numbers.add(case.accused_service_number)
    if (
        previous_state.get("status") == Case.Status.CLOSED
        and case.status != Case.Status.CLOSED
    ):
        numbers.update(_case_service_numbers(case))
    return invalidate_current_certificates(numbers, case)


def invalidate_for_accused_save(accused, *, created, previous_service_number=""):
    if created or accused.service_number != previous_service_number:
        return invalidate_current_certificates({accused.service_number}, accused.case)
    return 0
