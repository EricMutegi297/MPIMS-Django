from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("formations", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="battalion",
            name="battalion_type",
            field=models.CharField(
                choices=[
                    ("special", "Special"),
                    ("normal", "Normal"),
                    ("hqs", "HQs"),
                    ("protection", "Protection"),
                ],
                default="normal",
                max_length=20,
            ),
        ),
    ]
