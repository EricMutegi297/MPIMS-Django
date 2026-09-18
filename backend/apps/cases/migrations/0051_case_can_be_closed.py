from django.db import migrations, models
import django.utils.timezone


def backfill_can_be_closed(apps, schema_editor):
    Case = apps.get_model("cases", "Case")
    CaseCourtMartialMilestone = apps.get_model("cases", "CaseCourtMartialMilestone")

    try:
        judgment_type = CaseCourtMartialMilestone.MilestoneType.JUDGMENT
    except Exception:
        judgment_type = "judgment"

    case_ids = list(
        CaseCourtMartialMilestone.objects.filter(
            milestone_type=judgment_type,
            action_recorded_at__isnull=False,
        ).values_list("case_id", flat=True)
    )

    if not case_ids:
        return

    status_field = Case._meta.get_field("status")
    closed_status_values = {value for value, _ in status_field.flatchoices}
    closed_status = "closed" if "closed" in closed_status_values else next(
        iter(closed_status_values), "closed"
    )

    Case.objects.filter(id__in=case_ids).exclude(status=closed_status).update(
        can_be_closed=True,
        updated_at=django.utils.timezone.now(),
    )


def revert_backfill(apps, schema_editor):
    Case = apps.get_model("cases", "Case")
    Case.objects.filter(can_be_closed=True).update(can_be_closed=False)


class Migration(migrations.Migration):
    dependencies = [
        ("cases", "0050_normalize_awaiting_acknowledgement"),
    ]

    operations = [
        migrations.AddField(
            model_name="case",
            name="can_be_closed",
            field=models.BooleanField(default=False),
        ),
        migrations.RunPython(backfill_can_be_closed, reverse_code=revert_backfill),
    ]
