from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("cases", "0020_add_case_accused"),
    ]

    operations = [
        migrations.CreateModel(
            name="CaseBrief",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("file", models.FileField(upload_to="backend.apps.cases.models.case_brief_path")),
                ("summary", models.TextField(blank=True)),
                ("status", models.CharField(choices=[("draft", "Draft"), ("forwarded", "Forwarded")], default="draft", max_length=20)),
                ("forwarded_to_role", models.CharField(choices=[("hod", "HOD"), ("co", "Commanding Officer"), ("corps_cmd", "Corps Cmd"), ("detachment", "Detachment IC")], blank=True, max_length=20)),
                ("forwarded_note", models.TextField(blank=True)),
                ("forwarded_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "attached_by",
                    models.ForeignKey(
                        null=True,
                        blank=True,
                        on_delete=models.SET_NULL,
                        related_name="attached_briefs",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "case",
                    models.OneToOneField(
                        on_delete=models.CASCADE,
                        related_name="brief",
                        to="cases.Case",
                    ),
                ),
            ],
            options={
                "db_table": "case_briefs",
                "ordering": ["-updated_at"],
            },
        ),
    ]
