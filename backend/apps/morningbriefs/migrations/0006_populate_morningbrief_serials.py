from collections import defaultdict

from django.db import migrations


def populate_serials(apps, schema_editor):
    MorningBrief = apps.get_model("morningbriefs", "MorningBrief")
    counters = defaultdict(int)
    briefs = MorningBrief.objects.order_by("date", "created_at", "id")
    for brief in briefs:
        if brief.morning_brief_year and brief.morning_brief_sequence:
            counters[brief.morning_brief_year] = max(counters[brief.morning_brief_year], brief.morning_brief_sequence)
            continue
        year = brief.date.year
        counters[year] += 1
        brief.morning_brief_year = year
        brief.morning_brief_sequence = counters[year]
        brief.save(update_fields=["morning_brief_year", "morning_brief_sequence"])


class Migration(migrations.Migration):

    dependencies = [
        ("morningbriefs", "0005_morningbrief_serial"),
    ]

    operations = [
        migrations.RunPython(populate_serials, migrations.RunPython.noop),
    ]
