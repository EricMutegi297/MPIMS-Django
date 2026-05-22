from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import apps.cases.models


class Migration(migrations.Migration):

    dependencies = [
        ("cases", "0007_case_add_served_status"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="CaseAttachment",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("label", models.CharField(blank=True, max_length=100)),
                (
                    "file",
                    models.FileField(
                        upload_to=apps.cases.models.case_extra_attachment_path
                    ),
                ),
                ("uploaded_at", models.DateTimeField(auto_now_add=True)),
                (
                    "case",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="extra_attachments",
                        to="cases.case",
                    ),
                ),
                (
                    "uploaded_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "db_table": "case_attachments",
                "ordering": ["-uploaded_at"],
            },
        ),
    ]
