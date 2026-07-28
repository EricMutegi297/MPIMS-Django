from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


def seed_existing_forward_history(apps, schema_editor):
    CaseBrief = apps.get_model("cases", "CaseBrief")
    CaseBriefForward = apps.get_model("cases", "CaseBriefForward")

    for brief in CaseBrief.objects.exclude(forwarded_to_role=""):
        CaseBriefForward.objects.get_or_create(
            brief_id=brief.id,
            revision=brief.revision or 1,
            to_role=brief.forwarded_to_role,
            defaults={
                "from_role": brief.forwarded_from_role or "",
                "forwarded_by_id": brief.forwarded_by_id,
                "note": brief.forwarded_note or "",
                "forwarded_at": brief.forwarded_at or brief.updated_at,
            },
        )


def unseed_existing_forward_history(apps, schema_editor):
    CaseBriefForward = apps.get_model("cases", "CaseBriefForward")
    CaseBriefForward.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("cases", "0023_casebrief_forwarded_by_source"),
    ]

    operations = [
        migrations.AddField(
            model_name="casebrief",
            name="revision",
            field=models.PositiveIntegerField(default=1),
        ),
        migrations.CreateModel(
            name="CaseBriefForward",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("from_role", models.CharField(blank=True, max_length=20)),
                (
                    "to_role",
                    models.CharField(
                        choices=[
                            ("hod", "HOD"),
                            ("co", "Commanding Officer"),
                            ("corps_cmd", "Corps Cmd"),
                            ("detachment", "Detachment IC"),
                            ("adj", "Adjutant"),
                            ("2ic", "2IC"),
                        ],
                        max_length=20,
                    ),
                ),
                ("note", models.TextField(blank=True)),
                ("revision", models.PositiveIntegerField(default=1)),
                ("forwarded_at", models.DateTimeField(default=django.utils.timezone.now)),
                (
                    "brief",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="forward_history",
                        to="cases.casebrief",
                    ),
                ),
                (
                    "forwarded_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="case_brief_forwards",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "db_table": "case_brief_forwards",
                "ordering": ["-forwarded_at", "-id"],
            },
        ),
        migrations.AddConstraint(
            model_name="casebriefforward",
            constraint=models.UniqueConstraint(
                fields=("brief", "revision", "to_role"),
                name="uniq_case_brief_forward_revision_target",
            ),
        ),
        migrations.RunPython(seed_existing_forward_history, unseed_existing_forward_history),
    ]
