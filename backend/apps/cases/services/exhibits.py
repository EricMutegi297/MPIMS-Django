from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from ..models import ExhibitStorageRequest


@transaction.atomic
def approve_exhibit_storage(exhibit, reviewer, comments=""):
    exhibit = ExhibitStorageRequest.objects.select_for_update().get(pk=exhibit.pk)
    if exhibit.status != ExhibitStorageRequest.Status.PENDING:
        raise ValidationError({"status": "Only pending exhibit storage requests can be approved."})
    exhibit.status = ExhibitStorageRequest.Status.APPROVED
    exhibit.reviewed_by = reviewer
    exhibit.reviewed_at = timezone.now()
    exhibit.reviewer_comments = str(comments or "").strip()
    exhibit.decline_reason = ""
    exhibit.save(update_fields=[
        "status",
        "reviewed_by",
        "reviewed_at",
        "reviewer_comments",
        "decline_reason",
        "updated_at",
    ])
    return exhibit


@transaction.atomic
def decline_exhibit_storage(exhibit, reviewer, reason, comments=""):
    exhibit = ExhibitStorageRequest.objects.select_for_update().get(pk=exhibit.pk)
    if exhibit.status != ExhibitStorageRequest.Status.PENDING:
        raise ValidationError({"status": "Only pending exhibit storage requests can be declined."})
    reason = str(reason or "").strip()
    if not reason:
        raise ValidationError({"reason": "Reason for declining exhibit storage is required."})
    exhibit.status = ExhibitStorageRequest.Status.DECLINED
    exhibit.reviewed_by = reviewer
    exhibit.reviewed_at = timezone.now()
    exhibit.reviewer_comments = str(comments or "").strip()
    exhibit.decline_reason = reason
    exhibit.save(update_fields=[
        "status",
        "reviewed_by",
        "reviewed_at",
        "reviewer_comments",
        "decline_reason",
        "updated_at",
    ])
    return exhibit


@transaction.atomic
def mark_exhibit_stored(exhibit, receiver, physical_location, storage_reference=""):
    exhibit = ExhibitStorageRequest.objects.select_for_update().get(pk=exhibit.pk)
    if exhibit.status != ExhibitStorageRequest.Status.APPROVED:
        raise ValidationError({"status": "Only approved exhibits can be marked as stored."})
    physical_location = str(physical_location or "").strip()
    if not physical_location:
        raise ValidationError({"physical_location": "Enter the physical storage location after receiving the exhibit."})
    exhibit.status = ExhibitStorageRequest.Status.STORED
    exhibit.stored_by = receiver
    exhibit.stored_at = timezone.now()
    exhibit.physical_location = physical_location
    exhibit.storage_reference = str(storage_reference or "").strip()
    exhibit.save(update_fields=[
        "status",
        "stored_by",
        "stored_at",
        "physical_location",
        "storage_reference",
        "updated_at",
    ])
    return exhibit
