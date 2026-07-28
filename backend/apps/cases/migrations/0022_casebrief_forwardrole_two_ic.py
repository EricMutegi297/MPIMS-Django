from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("cases", "0021_create_casebrief"),
    ]

    operations = [
        migrations.AlterField(
            model_name="casebrief",
            name="forwarded_to_role",
            field=models.CharField(
                blank=True,
                choices=[
                    ("hod", "HOD"),
                    ("co", "Commanding Officer"),
                    ("corps_cmd", "Corps Cmd"),
                    ("detachment", "Detachment IC"),
                    ("adj", "Adjutant"),
                    ("2ic", "2IC"),
                ],
                max_length=20,
            ),
        ),
    ]
