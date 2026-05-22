from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("cases", "0015_court_martial_hearings_and_mentioning"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="CaseCourtMartialMilestone",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "milestone_type",
                    models.CharField(
                        choices=[
                            ("mentioning", "Mentioning"),
                            ("hearing", "Hearing"),
                            ("defence", "Defence"),
                            ("ruling", "Ruling"),
                            ("judgment", "Judgment"),
                        ],
                        max_length=20,
                    ),
                ),
                ("scheduled_date", models.DateField()),
                ("planning_comment", models.TextField(blank=True)),
                ("action_remarks", models.TextField(blank=True)),
                ("action_recorded_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "action_recorded_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=models.deletion.SET_NULL,
                        related_name="court_martial_actions_recorded",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "case",
                    models.ForeignKey(
                        on_delete=models.deletion.CASCADE,
                        related_name="court_martial_milestones",
                        to="cases.case",
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=models.deletion.SET_NULL,
                        related_name="court_martial_milestones_created",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "db_table": "case_court_martial_milestones",
                "ordering": ["scheduled_date", "created_at"],
                "constraints": [
                    models.UniqueConstraint(
                        fields=("case", "milestone_type", "scheduled_date"),
                        name="uniq_case_milestone_type_date",
                    )
                ],
            },
        ),
    ]
