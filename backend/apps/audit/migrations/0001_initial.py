# Generated manually for MPIMS audit trail.

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("formations", "0006_formation_location_unit_email_unit_formation_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="AuditLog",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("service_number", models.CharField(blank=True, max_length=50)),
                ("user_name", models.CharField(blank=True, max_length=150)),
                ("user_rank", models.CharField(blank=True, max_length=80)),
                ("user_role", models.CharField(blank=True, max_length=50)),
                ("battalion_name", models.CharField(blank=True, max_length=150)),
                ("detachment_name", models.CharField(blank=True, max_length=150)),
                (
                    "action",
                    models.CharField(
                        choices=[
                            ("login", "Login"),
                            ("login_failed", "Login Failed"),
                            ("logout", "Logout"),
                            ("view", "View"),
                            ("create", "Create"),
                            ("update", "Update"),
                            ("delete", "Delete"),
                            ("action", "Action"),
                            ("error", "Error"),
                        ],
                        max_length=30,
                    ),
                ),
                ("module", models.CharField(blank=True, max_length=80)),
                ("method", models.CharField(blank=True, max_length=10)),
                ("path", models.CharField(blank=True, max_length=600)),
                ("query_string", models.TextField(blank=True)),
                ("object_id", models.CharField(blank=True, max_length=120)),
                ("description", models.TextField(blank=True)),
                ("status_code", models.PositiveIntegerField(blank=True, null=True)),
                ("success", models.BooleanField(default=False)),
                ("ip_address", models.GenericIPAddressField(blank=True, null=True)),
                ("user_agent", models.TextField(blank=True)),
                ("duration_ms", models.PositiveIntegerField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "battalion",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="audit_logs",
                        to="formations.battalion",
                    ),
                ),
                (
                    "detachment",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="audit_logs",
                        to="formations.detachment",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="audit_logs",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "db_table": "audit_logs",
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="auditlog",
            index=models.Index(fields=["-created_at"], name="audit_logs_created_43fcd6_idx"),
        ),
        migrations.AddIndex(
            model_name="auditlog",
            index=models.Index(fields=["action", "-created_at"], name="audit_logs_action_bcaa71_idx"),
        ),
        migrations.AddIndex(
            model_name="auditlog",
            index=models.Index(fields=["module", "-created_at"], name="audit_logs_module_31f3f7_idx"),
        ),
        migrations.AddIndex(
            model_name="auditlog",
            index=models.Index(fields=["service_number", "-created_at"], name="audit_logs_service_a3b907_idx"),
        ),
        migrations.AddIndex(
            model_name="auditlog",
            index=models.Index(fields=["user_role", "-created_at"], name="audit_logs_user_ro_7e1b14_idx"),
        ),
    ]
