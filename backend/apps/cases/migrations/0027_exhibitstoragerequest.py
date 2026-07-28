from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import apps.cases.models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("formations", "0001_initial"),
        ("cases", "0026_casebrief_approval"),
    ]

    operations = [
        migrations.CreateModel(
            name="ExhibitStorageRequest",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("exhibit_name", models.CharField(max_length=150)),
                ("description", models.TextField(blank=True)),
                ("quantity", models.PositiveIntegerField(default=1)),
                ("photo", models.FileField(blank=True, null=True, upload_to=apps.cases.models.exhibit_photo_path)),
                (
                    "storage_scope",
                    models.CharField(
                        choices=[
                            ("detachment", "Detachment"),
                            ("battalion", "Battalion"),
                            ("special_battalion", "Special Battalion"),
                        ],
                        max_length=25,
                    ),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("pending", "Pending"),
                            ("approved", "Approved"),
                            ("declined", "Declined"),
                            ("stored", "Stored"),
                        ],
                        default="pending",
                        max_length=20,
                    ),
                ),
                ("reviewer_comments", models.TextField(blank=True)),
                ("decline_reason", models.TextField(blank=True)),
                ("storage_reference", models.CharField(blank=True, max_length=100)),
                ("physical_location", models.CharField(blank=True, max_length=200)),
                ("reviewed_at", models.DateTimeField(blank=True, null=True)),
                ("stored_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("case", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="exhibit_storage_requests", to="cases.case")),
                ("requested_by", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="exhibit_storage_requests", to=settings.AUTH_USER_MODEL)),
                ("reviewed_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="reviewed_exhibit_storage_requests", to=settings.AUTH_USER_MODEL)),
                ("stored_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="stored_exhibit_storage_requests", to=settings.AUTH_USER_MODEL)),
                ("target_battalion", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="exhibit_storage_requests", to="formations.battalion")),
                ("target_detachment", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="exhibit_storage_requests", to="formations.detachment")),
            ],
            options={
                "db_table": "exhibit_storage_requests",
                "ordering": ["-created_at"],
            },
        ),
    ]
