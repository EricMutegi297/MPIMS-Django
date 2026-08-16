from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("dutyrooms", "0004_occurrenceentry_incident_title"),
    ]

    operations = [
        migrations.AlterField(
            model_name="occurrenceentry",
            name="entry_type",
            field=models.CharField(
                choices=[
                    ("routine", "Routine"),
                    ("incident", "Incident"),
                    ("road_traffic_accident", "Road Traffic Accident"),
                    ("message", "Message"),
                    ("order", "Order"),
                    ("movement", "Movement"),
                    ("visitor", "Visitor"),
                    ("guardroom", "Guardroom"),
                    ("other", "Other"),
                ],
                default="routine",
                max_length=25,
            ),
        ),
        migrations.AddField(
            model_name="occurrenceentry",
            name="road_traffic_type",
            field=models.CharField(
                blank=True,
                choices=[
                    ("injury", "Injury Road Traffic Accident"),
                    ("non_injury", "Non-Injury Road Traffic Accident"),
                    ("self_involved", "Self Involved Road Traffic Accident"),
                    ("fatal", "Fatal Road Traffic Accident"),
                    ("hit_and_run", "Hit and Run Road Traffic Accident"),
                ],
                max_length=30,
            ),
        ),
    ]
