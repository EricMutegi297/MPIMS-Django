from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("dutyrooms", "0005_occurrenceentry_road_traffic_type"),
    ]

    operations = [
        migrations.AddField(
            model_name="occurrenceentry",
            name="injured_count",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="occurrenceentry",
            name="dead_count",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="occurrenceentry",
            name="injury_severity",
            field=models.CharField(
                blank=True,
                choices=[
                    ("minor", "Minor"),
                    ("serious", "Serious"),
                    ("critical", "Critical"),
                ],
                max_length=20,
            ),
        ),
    ]
