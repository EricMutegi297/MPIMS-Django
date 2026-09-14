from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion

import apps.cases.models
import apps.common.fields


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("cases", "0046_case_case_type_case_rta_damage_authority_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="case",
            name="abstract_acknowledged_at",
            field=models.DateTimeField(null=True, blank=True),
        ),
        migrations.AddField(
            model_name="case",
            name="abstract_acknowledged_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="case",
            name="abstract_acknowledged_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="abstract_acknowledged_cases",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="case",
            name="abstract_acknowledgement_form",
            field=models.FileField(blank=True, null=True, upload_to=apps.cases.models.case_attachment_path),
        ),
        migrations.AddField(
            model_name="case",
            name="unit_closure_status",
            field=models.CharField(
                blank=True,
                choices=[
                    ("pending", "Pending Review"),
                    ("approved", "Approved"),
                    ("rejected", "Rejected"),
                ],
                default="",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="case",
            name="unit_closure_requested_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="case",
            name="unit_closure_requested_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="unit_closure_requested_cases",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="case",
            name="unit_closure_request_note",
            field=apps.common.fields.EncryptedTextField(blank=True),
        ),
        migrations.AddField(
            model_name="case",
            name="unit_closure_decided_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="case",
            name="unit_closure_decided_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="unit_closure_reviewed_cases",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="case",
            name="unit_closure_decision_note",
            field=apps.common.fields.EncryptedTextField(blank=True),
        ),
        migrations.AddField(
            model_name="case",
            name="clearance_certificate",
            field=models.FileField(blank=True, null=True, upload_to=apps.cases.models.case_attachment_path),
        ),
        migrations.AddField(
            model_name="case",
            name="clearance_certificate_uploaded_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="uploaded_clearance_certificates",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="case",
            name="clearance_certificate_uploaded_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
