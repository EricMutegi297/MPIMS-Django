import re

from django.db import migrations


RANKS = [
    "Warrant Officer Class 1",
    "Warrant Officer Class 2",
    "Lieutenant General",
    "Major General",
    "Lance Corporal",
    "Senior Sergeant",
    "2nd Lieutenant",
    "Lieutenant Colonel",
    "Brigadier",
    "Colonel",
    "Captain",
    "Lieutenant",
    "Sergeant",
    "Corporal",
    "General",
    "Private",
    "Recruit",
]


def incident_service_member_text(case, incident):
    direct = str(getattr(incident, "service_member", "") or "").strip()
    if direct:
        return direct
    match = re.search(
        r"Service member:\s*(.+?)(?:\n|$)",
        str(getattr(case, "description", "") or ""),
        flags=re.IGNORECASE,
    )
    return match.group(1).strip() if match else ""


def parse_service_member(text):
    text = re.sub(r"\s+", " ", str(text or "").strip())
    if not text:
        return "", "", ""
    text = re.sub(r"^(?:Service member|Driver):\s*", "", text, flags=re.IGNORECASE)

    service_no = ""
    remainder = text
    match = re.match(r"(?:Service|Svc)\s*(?:No|#)[:\s]*([A-Za-z0-9/-]+)\s*(.*)$", text, flags=re.IGNORECASE)
    if not match:
        match = re.match(r"([A-Za-z0-9/-]+)\s+(.+)$", text)
    if match:
        service_no = match.group(1).strip()
        remainder = match.group(2).strip()
    remainder = re.split(r"\s+Unit:\s+", remainder, maxsplit=1, flags=re.IGNORECASE)[0].strip()

    rank = ""
    name = remainder
    lower_remainder = remainder.lower()
    for candidate in RANKS:
        lower_rank = candidate.lower()
        if lower_remainder == lower_rank:
            rank = candidate
            name = ""
            break
        if lower_remainder.startswith(f"{lower_rank} "):
            rank = candidate
            name = remainder[len(candidate):].strip()
            break

    return service_no, rank, name


def backfill_incident_case_accused(apps, schema_editor):
    Incident = apps.get_model("incidents", "Incident")

    for incident in Incident.objects.exclude(converted_case__isnull=True).select_related("converted_case").iterator():
        case = incident.converted_case
        if not case:
            continue
        if case.accused_service_number or case.accused_rank or case.accused_name:
            continue

        service_no, rank, name = parse_service_member(incident_service_member_text(case, incident))
        if not (service_no or rank or name):
            continue

        case.accused_service_number = service_no
        case.accused_rank = rank
        case.accused_name = name
        case.save(update_fields=["accused_service_number", "accused_rank", "accused_name"])


class Migration(migrations.Migration):

    dependencies = [
        ("cases", "0042_delete_casecourtmartialattachment"),
        ("incidents", "0006_alter_incident_action_taken_alter_incident_damages_and_more"),
    ]

    operations = [
        migrations.RunPython(backfill_incident_case_accused, migrations.RunPython.noop),
    ]
