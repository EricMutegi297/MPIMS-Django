from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("cases", "0008_caseattachment"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="CaseActivityLog",
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
                (
                    "action",
                    models.CharField(
                        choices=[
                            ("case_created", "Case Created"),
                            ("status_changed", "Status Changed"),
                            ("attachment_uploaded", "Attachment Uploaded"),
                            ("attachment_deleted", "Attachment Deleted"),
                            ("team_assigned", "Team Assigned"),
                            ("battalion_tasked", "Battalion Tasked"),
                            ("case_updated", "Case Updated"),
                        ],
                        max_length=30,
                    ),
                ),
                ("detail", models.CharField(blank=True, max_length=255)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "actor",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "case",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="activity_logs",
                        to="cases.case",
                    ),
                ),
            ],
            options={
                "db_table": "case_activity_logs",
                "ordering": ["-created_at"],
            },
        ),
    ]
