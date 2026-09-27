from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from ..models import CaseActivityLog, CaseBrief, CaseBriefForward


@transaction.atomic
def forward_case_brief(brief, actor):
    brief = CaseBrief.objects.select_for_update().get(pk=brief.pk)
    brief.status = CaseBrief.Status.FORWARDED
    brief.forwarded_at = timezone.now()
    brief.forwarded_by = actor
    brief.forwarded_from_role = actor.role
    brief.save(update_fields=["status", "forwarded_at", "forwarded_by", "forwarded_from_role"])
    CaseBriefForward.objects.create(
        brief=brief,
        from_role=actor.role or "",
        to_role=brief.forwarded_to_role,
        forwarded_by=actor,
        note=brief.forwarded_note or "",
        revision=brief.revision,
        forwarded_at=brief.forwarded_at,
    )
    CaseActivityLog.objects.create(
        case=brief.case,
        actor=actor,
        action=CaseActivityLog.Action.BRIEF_FORWARDED,
        detail=f"Forwarded brief to {brief.get_forwarded_to_role_display()}",
    )
    return brief


@transaction.atomic
def approve_case_brief(brief, actor, note=""):
    brief = CaseBrief.objects.select_for_update().get(pk=brief.pk)
    if brief.forwarded_to_role != CaseBrief.ForwardRole.CORPS_CMD:
        raise ValidationError({
            "detail": "Brief must be forwarded to Corps Commander before it can be approved."
        })
    if brief.approved_at:
        if brief.approved_by:
            name_parts = [part for part in [brief.approved_by.rank, brief.approved_by.name] if part]
            approved_by = " ".join(name_parts) or brief.approved_by.service_number
        else:
            approved_by = "Corps Commander"
        raise ValidationError({"detail": f"This brief was already approved by {approved_by}."})

    brief.approved_by = actor
    brief.approved_at = timezone.now()
    brief.approved_note = str(note or "").strip()
    brief.save(update_fields=["approved_by", "approved_at", "approved_note", "updated_at"])
    CaseActivityLog.objects.create(
        case=brief.case,
        actor=actor,
        action=CaseActivityLog.Action.BRIEF_UPDATED,
        detail="Approved brief for back-brief attachment",
    )
    return brief
