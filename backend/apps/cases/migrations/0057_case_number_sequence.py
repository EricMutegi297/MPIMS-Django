import re

from django.db import migrations, models


CASE_NUMBER_PATTERN = re.compile(r"^CASE/(?P<year>\d{4})/(?P<number>\d+)(?:[A-Z]+)?$")


def seed_case_number_sequences(apps, schema_editor):
    Case = apps.get_model("cases", "Case")
    CaseNumberSequence = apps.get_model("cases", "CaseNumberSequence")
    database = schema_editor.connection.alias
    highest_by_year = {}

    for case_number in (
        Case.objects.using(database)
        .exclude(case_number="")
        .values_list("case_number", flat=True)
        .iterator()
    ):
        match = CASE_NUMBER_PATTERN.fullmatch(case_number)
        if not match:
            continue
        year = int(match.group("year"))
        number = int(match.group("number"))
        highest_by_year[year] = max(highest_by_year.get(year, 0), number)

    CaseNumberSequence.objects.using(database).bulk_create(
        [
            CaseNumberSequence(year=year, last_number=last_number)
            for year, last_number in highest_by_year.items()
        ],
        ignore_conflicts=True,
    )


class Migration(migrations.Migration):
    dependencies = [
        ("cases", "0056_caseaccused_service_number_digits"),
    ]

    operations = [
        migrations.CreateModel(
            name="CaseNumberSequence",
            fields=[
                (
                    "year",
                    models.PositiveSmallIntegerField(primary_key=True, serialize=False),
                ),
                ("last_number", models.PositiveIntegerField(default=0)),
            ],
            options={"db_table": "case_number_sequences"},
        ),
        migrations.RunPython(
            seed_case_number_sequences,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
