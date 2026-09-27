from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from ..models import Case, CaseActivityLog
from ..serializers.constants import CLOSED_CASE_FILE_ERROR
from ..uploads import validate_case_upload


@transaction.atomic
def request_unit_closure(case, actor, chargesheet, note=""):
    case = Case.objects.select_for_update().get(pk=case.pk)
    if case.status != Case.Status.SERVED:
        raise ValidationError({"detail": "Closure can only be requested for served cases."})
    if not case.abstract_acknowledged_at:
        raise ValidationError({"detail": "Acknowledge receipt of the abstract before requesting closure."})
    if not chargesheet:
        raise ValidationError({"chargesheet": "Attach the charge sheet before requesting closure."})
    validate_case_upload(chargesheet, field_name="chargesheet", allowed_extensions={".pdf"})
    if case.unit_closure_status == Case.UnitClosureStatus.PENDING:
        raise ValidationError({"detail": "A closure request is already awaiting HQ review."})

    case.unit_closure_status = Case.UnitClosureStatus.PENDING
    case.unit_closure_requested_at = timezone.now()
    case.unit_closure_requested_by = actor
    case.unit_closure_request_note = str(note or "").strip()
    case.unit_closure_decided_at = None
    case.unit_closure_decided_by = None
    case.unit_closure_decision_note = ""
    case.chargesheet = chargesheet
    case.save(update_fields=[
        "chargesheet",
        "unit_closure_status", "unit_closure_requested_at", "unit_closure_requested_by",
        "unit_closure_request_note", "unit_closure_decided_at", "unit_closure_decided_by",
        "unit_closure_decision_note", "updated_at",
    ])
    CaseActivityLog.objects.create(
        case=case,
        actor=actor,
        action=CaseActivityLog.Action.CASE_UPDATED,
        detail="Unit requested case closure",
    )
    return case


@transaction.atomic
def review_unit_closure(case, actor, decision, note=""):
    case = Case.objects.select_for_update().get(pk=case.pk)
    if case.unit_closure_status != Case.UnitClosureStatus.PENDING:
        raise ValidationError({"detail": "This case has no pending unit closure request."})
    decision = str(decision or "").strip().lower()
    if decision not in {"approve", "reject"}:
        raise ValidationError({"decision": "Choose approve or reject."})
    note = str(note or "").strip()
    if decision == "reject" and not note:
        raise ValidationError({"comment": "A reason is required when rejecting a closure request."})

    case.unit_closure_status = (
        Case.UnitClosureStatus.APPROVED
        if decision == "approve"
        else Case.UnitClosureStatus.REJECTED
    )
    case.unit_closure_decided_at = timezone.now()
    case.unit_closure_decided_by = actor
    case.unit_closure_decision_note = note
    update_fields = [
        "unit_closure_status", "unit_closure_decided_at", "unit_closure_decided_by",
        "unit_closure_decision_note", "updated_at",
    ]
    if decision == "approve" and not case.close_requested:
        case.close_requested = True
        case.close_requested_at = timezone.now()
        update_fields.extend(["close_requested", "close_requested_at"])
    case.save(update_fields=update_fields)
    CaseActivityLog.objects.create(
        case=case,
        actor=actor,
        action=CaseActivityLog.Action.CASE_UPDATED,
        detail=f"HQ {decision}d unit closure request",
    )
    return case, decision, note


@transaction.atomic
def upload_clearance_certificate(case, actor, certificate):
    case = Case.objects.select_for_update().get(pk=case.pk)
    if case.status == Case.Status.CLOSED:
        raise ValidationError({"detail": CLOSED_CASE_FILE_ERROR})
    if not certificate:
        raise ValidationError({"clearance_certificate": "Attach the clearance certificate file."})
    validate_case_upload(
        certificate,
        field_name="clearance_certificate",
        allowed_extensions={".pdf"},
    )

    case.clearance_certificate = certificate
    case.clearance_certificate_uploaded_by = actor
    case.clearance_certificate_uploaded_at = timezone.now()
    case.save(update_fields=[
        "clearance_certificate", "clearance_certificate_uploaded_by",
        "clearance_certificate_uploaded_at", "updated_at",
    ])
    CaseActivityLog.objects.create(
        case=case,
        actor=actor,
        action=CaseActivityLog.Action.ATTACHMENT_UPLOADED,
        detail="Uploaded clearance certificate",
    )
    return case
