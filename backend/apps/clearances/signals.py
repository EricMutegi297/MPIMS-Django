from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from apps.cases.models import Case, CaseAccused

from .services import invalidate_for_accused_save, invalidate_for_case_save


@receiver(pre_save, sender=Case)
def capture_case_clearance_state(sender, instance, **kwargs):
    if instance.pk is None:
        instance._clearance_previous_state = None
        return
    instance._clearance_previous_state = (
        sender.objects.filter(pk=instance.pk)
        .values("accused_service_number", "status")
        .first()
    )


@receiver(post_save, sender=Case)
def invalidate_clearances_for_case(sender, instance, created, **kwargs):
    invalidate_for_case_save(
        instance,
        created=created,
        previous_state=instance._clearance_previous_state,
    )


@receiver(pre_save, sender=CaseAccused)
def capture_accused_clearance_state(sender, instance, **kwargs):
    if instance.pk is None:
        instance._clearance_previous_service_number = ""
        return
    instance._clearance_previous_service_number = (
        sender.objects.filter(pk=instance.pk)
        .values_list("service_number", flat=True)
        .first()
        or ""
    )


@receiver(post_save, sender=CaseAccused)
def invalidate_clearances_for_accused(sender, instance, created, **kwargs):
    invalidate_for_accused_save(
        instance,
        created=created,
        previous_service_number=instance._clearance_previous_service_number,
    )
