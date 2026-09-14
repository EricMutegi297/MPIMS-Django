from django.db import migrations, models

import apps.cases.models


class Migration(migrations.Migration):

    dependencies = [
        ("cases", "0047_case_unit_service_workflow"),
    ]

    operations = [
        migrations.AddField(
            model_name="case",
            name="served_abstract",
            field=models.FileField(blank=True, null=True, upload_to=apps.cases.models.case_attachment_path),
        ),
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
                    ("awaiting_acknowledgement", "Served Awaiting Acknowledgement"),
                    ("closed", "Closed"),
                    ("referred", "Referred"),
                ],
                default="new",
                max_length=25,
            ),
        ),
    ]
