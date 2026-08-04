from django.db import migrations
from django.db.models import Q
from django.utils import timezone


def renormalize_assigned_case_status(apps, schema_editor):
    Case = apps.get_model("cases", "Case")
    Case.objects.filter(
        Q(assigned_team__isnull=False) | Q(assigned_to__isnull=False),
        status="tasked",
    ).exclude(criminal_offence_type="court_martial").update(status="under_investigation")
    Case.objects.filter(close_requested=True, close_requested_at__isnull=True).update(
        close_requested_at=timezone.now()
    )


class Migration(migrations.Migration):

    dependencies = [
        ("cases", "0033_normalize_assigned_case_status"),
    ]

    operations = [
        migrations.RunPython(renormalize_assigned_case_status, migrations.RunPython.noop),
    ]
