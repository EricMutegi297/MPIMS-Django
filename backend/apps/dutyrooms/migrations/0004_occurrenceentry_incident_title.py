from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("dutyrooms", "0003_occurrenceentry_report_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="occurrenceentry",
            name="incident_title",
            field=models.CharField(blank=True, max_length=160),
        ),
    ]
