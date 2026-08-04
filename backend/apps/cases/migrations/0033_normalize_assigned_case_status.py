from django.db import migrations
from django.db.models import Q


def normalize_assigned_case_status(apps, schema_editor):
    Case = apps.get_model("cases", "Case")
    Case.objects.filter(
        Q(assigned_team__isnull=False) | Q(assigned_to__isnull=False),
        status="tasked",
    ).exclude(criminal_offence_type="court_martial").update(status="under_investigation")


class Migration(migrations.Migration):

    dependencies = [
        ("cases", "0032_casebrief_oc_forward_role"),
    ]

    operations = [
        migrations.RunPython(normalize_assigned_case_status, migrations.RunPython.noop),
    ]
