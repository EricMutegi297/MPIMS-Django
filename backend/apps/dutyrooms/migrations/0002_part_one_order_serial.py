from collections import defaultdict

from django.db import migrations, models


def populate_part_one_order_serials(apps, schema_editor):
    DutyRoster = apps.get_model("dutyrooms", "DutyRoster")
    counters = defaultdict(int)
    rosters = (
        DutyRoster.objects.select_related("battalion", "detachment__battalion")
        .exclude(status="draft")
        .order_by(
            "start_date",
            "created_at",
            "id",
        )
    )
    for roster in rosters:
        year = roster.start_date.year
        battalion_id = roster.battalion_id
        if not battalion_id and roster.detachment_id:
            battalion_id = roster.detachment.battalion_id
        scope_key = (battalion_id or 0, year)
        counters[scope_key] += 1
        roster.part_one_order_year = year
        roster.part_one_order_sequence = counters[scope_key]
        roster.save(update_fields=["part_one_order_year", "part_one_order_sequence"])


def clear_part_one_order_serials(apps, schema_editor):
    DutyRoster = apps.get_model("dutyrooms", "DutyRoster")
    DutyRoster.objects.update(part_one_order_year=None, part_one_order_sequence=None)


class Migration(migrations.Migration):

    dependencies = [
        ("dutyrooms", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="dutyroster",
            name="part_one_order_sequence",
            field=models.PositiveIntegerField(blank=True, editable=False, null=True),
        ),
        migrations.AddField(
            model_name="dutyroster",
            name="part_one_order_year",
            field=models.PositiveSmallIntegerField(blank=True, editable=False, null=True),
        ),
        migrations.RunPython(populate_part_one_order_serials, clear_part_one_order_serials),
    ]
