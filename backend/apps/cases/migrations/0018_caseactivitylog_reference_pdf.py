from django.db import migrations, models

import apps.cases.models


class Migration(migrations.Migration):

    dependencies = [
        ("cases", "0017_caseattachment_document_type"),
    ]

    operations = [
        migrations.AddField(
            model_name="caseactivitylog",
            name="reference_pdf",
            field=models.FileField(blank=True, null=True, upload_to=apps.cases.models.case_activity_reference_path),
        ),
    ]