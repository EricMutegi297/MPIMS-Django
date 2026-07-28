from django.db import migrations, models


BRIEF_FORWARD_CHOICES = [
    ("hod", "HOD"),
    ("co", "Commanding Officer"),
    ("oc", "OC"),
    ("corps_cmd", "Corps Cmd"),
    ("detachment", "Detachment IC"),
    ("adj", "Adjutant"),
    ("2ic", "2IC"),
]


class Migration(migrations.Migration):

    dependencies = [
        ("cases", "0031_exhibit_lifecycle_disposal_mode"),
    ]

    operations = [
        migrations.AlterField(
            model_name="casebrief",
            name="forwarded_to_role",
            field=models.CharField(blank=True, choices=BRIEF_FORWARD_CHOICES, max_length=20),
        ),
        migrations.AlterField(
            model_name="casebriefforward",
            name="to_role",
            field=models.CharField(choices=BRIEF_FORWARD_CHOICES, max_length=20),
        ),
    ]
