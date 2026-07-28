from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import apps.cases.models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("cases", "0024_casebrief_revision_forwardhistory"),
    ]

    operations = [
        migrations.CreateModel(
            name="CaseBackBrief",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("file", models.FileField(upload_to=apps.cases.models.case_back_brief_path)),
                ("note", models.TextField(blank=True)),
                ("uploaded_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "brief",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="back_brief",
                        to="cases.casebrief",
                    ),
                ),
                (
                    "uploaded_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="uploaded_back_briefs",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "db_table": "case_back_briefs",
                "ordering": ["-uploaded_at"],
            },
        ),
    ]
