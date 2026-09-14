from django.db import migrations


def restore_under_investigation(apps, schema_editor):
    Case = apps.get_model("cases", "Case")
    Case.objects.filter(status="awaiting_acknowledgement").update(status="under_investigation")


class Migration(migrations.Migration):

    dependencies = [
        ("cases", "0049_remove_awaiting_acknowledgement_status"),
    ]

    operations = [
        migrations.RunPython(restore_under_investigation, migrations.RunPython.noop),
    ]
