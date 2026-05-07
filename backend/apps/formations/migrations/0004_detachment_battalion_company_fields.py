from django.db import migrations, models
import django.db.models.deletion


def copy_battalion_from_unit(apps, schema_editor):
    Detachment = apps.get_model("formations", "Detachment")
    for detachment in Detachment.objects.select_related("unit__battalion").all():
        if detachment.unit_id:
            detachment.battalion_id = detachment.unit.battalion_id
            detachment.save(update_fields=["battalion"])


class Migration(migrations.Migration):

    dependencies = [
        ("formations", "0003_battalion_email_phone_aor"),
    ]

    operations = [
        migrations.AddField(
            model_name="detachment",
            name="aor",
            field=models.CharField(default="", max_length=200),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="detachment",
            name="battalion",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="detachments",
                to="formations.battalion",
            ),
        ),
        migrations.AddField(
            model_name="detachment",
            name="company",
            field=models.CharField(
                choices=[("A", "A"), ("B", "B"), ("C", "C"), ("D", "D")],
                default="A",
                max_length=1,
            ),
        ),
        migrations.AddField(
            model_name="detachment",
            name="email",
            field=models.EmailField(blank=True, max_length=254),
        ),
        migrations.AddField(
            model_name="detachment",
            name="mobile_no",
            field=models.CharField(blank=True, max_length=30),
        ),
        migrations.RunPython(copy_battalion_from_unit, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="detachment",
            name="battalion",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="detachments",
                to="formations.battalion",
            ),
        ),
        migrations.RemoveField(
            model_name="detachment",
            name="unit",
        ),
    ]
