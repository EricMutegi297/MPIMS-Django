from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("cases", "0048_case_awaiting_acknowledgement"),
    ]

    operations = [
        migrations.AlterField(
            model_name="case",
            name="status",
            field=models.CharField(
                choices=[
                    ("new", "New"),
                    ("open", "Open"),
                    ("tasked", "Tasked"),
                    ("under_investigation", "Under Investigation"),
                    ("pending", "Pending"),
                    ("served", "Served"),
                    ("closed", "Closed"),
                    ("referred", "Referred"),
                ],
                default="new",
                max_length=25,
            ),
        ),
    ]
