import apps.cases.models
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("cases", "0006_add_investigation_team_and_detachment_fks"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AlterField(
            model_name="case",
            name="status",
            field=models.CharField(
                choices=[
                    ("new", "New"),
                    ("open", "Open"),
                    ("tasked", "Tasked"),
                    ("under_investigation", "Under Investigation"),
                    ("closed", "Closed"),
                    ("referred", "Referred"),
                    ("pending", "Pending"),
                    ("served", "Served"),
                ],
                default="new",
                max_length=25,
            ),
        ),
        migrations.AddField(
            model_name="case",
            name="brief_document",
            field=models.FileField(blank=True, null=True, upload_to=apps.cases.models.case_attachment_path),
        ),
        migrations.AddField(
            model_name="case",
            name="brief_forwarded_co",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="case",
            name="brief_forwarded_corps",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="case",
            name="served_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.CreateModel(
            name="CaseAbstractAttachment",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("file", models.FileField(upload_to=apps.cases.models.case_abstract_path)),
                ("description", models.CharField(blank=True, max_length=200)),
                ("uploaded_at", models.DateTimeField(auto_now_add=True)),
                (
                    "case",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="abstracts",
                        to="cases.case",
                    ),
                ),
                (
                    "uploaded_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="uploaded_abstracts",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={"db_table": "case_abstract_attachments", "ordering": ["uploaded_at"]},
        ),
    ]
