from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import apps.cases.models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("cases", "0029_exhibitstoragerequest_parent_request"),
    ]

    operations = [
        migrations.AddField(
            model_name="exhibitstoragerequest",
            name="lifecycle_action",
            field=models.CharField(
                blank=True,
                choices=[
                    ("return_accused", "Return to Accused"),
                    ("return_owner", "Return to Owner/Witness"),
                    ("dispose", "Dispose/Destroy"),
                    ("transfer", "Transfer to Another Authority"),
                    ("retain", "Retain for Court Martial"),
                ],
                max_length=25,
            ),
        ),
        migrations.AddField(
            model_name="exhibitstoragerequest",
            name="lifecycle_reason",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="exhibitstoragerequest",
            name="lifecycle_recipient_name",
            field=models.CharField(blank=True, max_length=150),
        ),
        migrations.AddField(
            model_name="exhibitstoragerequest",
            name="lifecycle_recipient_identifier",
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name="exhibitstoragerequest",
            name="lifecycle_authority",
            field=models.CharField(blank=True, max_length=150),
        ),
        migrations.AddField(
            model_name="exhibitstoragerequest",
            name="lifecycle_attachment",
            field=models.FileField(
                blank=True,
                null=True,
                upload_to=apps.cases.models.exhibit_lifecycle_document_path,
            ),
        ),
        migrations.AddField(
            model_name="exhibitstoragerequest",
            name="lifecycle_requested_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="exhibitstoragerequest",
            name="lifecycle_reviewed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="exhibitstoragerequest",
            name="lifecycle_review_comments",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="exhibitstoragerequest",
            name="lifecycle_decline_reason",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="exhibitstoragerequest",
            name="lifecycle_requested_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="requested_exhibit_lifecycle_actions",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="exhibitstoragerequest",
            name="lifecycle_reviewed_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="reviewed_exhibit_lifecycle_actions",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name="exhibitstoragerequest",
            name="status",
            field=models.CharField(
                choices=[
                    ("pending", "Pending"),
                    ("approved", "Approved"),
                    ("declined", "Declined"),
                    ("stored", "Stored"),
                    ("return_requested", "Return Requested"),
                    ("disposal_requested", "Disposal Requested"),
                    ("transfer_requested", "Transfer Requested"),
                    ("retention_requested", "Retention Requested"),
                    ("returned", "Returned"),
                    ("disposed", "Disposed"),
                    ("transferred", "Transferred"),
                    ("retained", "Retained"),
                ],
                default="pending",
                max_length=20,
            ),
        ),
    ]
