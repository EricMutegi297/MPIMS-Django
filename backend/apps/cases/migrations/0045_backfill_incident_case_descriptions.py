from django.db import migrations


RTA_PHRASE = "road traffic accident"


def backfill_incident_case_descriptions(apps, schema_editor):
    Incident = apps.get_model("incidents", "Incident")

    incidents = (
        Incident.objects
        .exclude(converted_case__isnull=True)
        .select_related("converted_case")
    )
    for incident in incidents.iterator():
        case = incident.converted_case
        if not case:
            continue
        if RTA_PHRASE in str(incident.incident_type or "").lower():
            continue
        history = str(incident.history or "").strip()
        if not history or str(case.description or "").strip() == history:
            continue
        case.description = history
        case.save(update_fields=["description"])


class Migration(migrations.Migration):

    dependencies = [
        ("cases", "0044_alter_case_place_of_offence_and_more"),
        ("incidents", "0006_alter_incident_action_taken_alter_incident_damages_and_more"),
    ]

    operations = [
        migrations.RunPython(backfill_incident_case_descriptions, migrations.RunPython.noop),
    ]
