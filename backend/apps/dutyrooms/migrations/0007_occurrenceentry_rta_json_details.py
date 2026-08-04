from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("dutyrooms", "0006_occurrenceentry_rta_casualties"),
    ]

    operations = [
        migrations.AddField(
            model_name="occurrenceentry",
            name="rta_vehicles",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="occurrenceentry",
            name="rta_casualties",
            field=models.JSONField(blank=True, default=list),
        ),
    ]
