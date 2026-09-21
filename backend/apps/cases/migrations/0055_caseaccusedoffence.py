from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("cases", "0054_repoint_tasked_detachment_fk"),
        ("offences", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="CaseAccusedOffence",
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
                ("count_number", models.PositiveIntegerField(default=1)),
                ("particulars", models.TextField(blank=True)),
                (
                    "accused",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="offences",
                        to="cases.caseaccused",
                    ),
                ),
                (
                    "offence",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="accused_offences",
                        to="offences.offence",
                    ),
                ),
            ],
            options={
                "db_table": "case_accused_offences",
                "ordering": ["count_number", "id"],
                "constraints": [
                    models.UniqueConstraint(
                        fields=("accused", "offence", "count_number"),
                        name="unique_accused_offence_count",
                    )
                ],
            },
        ),
    ]
