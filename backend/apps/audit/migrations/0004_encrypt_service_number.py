import apps.common.fields
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("audit", "0003_alter_auditlog_detachment"),
    ]

    operations = [
        migrations.RemoveIndex(
            model_name="auditlog",
            name="audit_logs_service_a3b907_idx",
        ),
        migrations.AlterField(
            model_name="auditlog",
            name="service_number",
            field=apps.common.fields.EncryptedTextField(blank=True),
        ),
    ]
