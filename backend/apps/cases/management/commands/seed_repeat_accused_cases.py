from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.cases.models import Case, CaseAccused, CaseActivityLog, InvestigationTeam
from apps.formations.models import Battalion, Formation, Unit
from apps.users.models import User


ACCUSED = {
    "name": "John Kamau Mwangi",
    "rank": "Corporal",
    "service_number": "SIM-ACC-001",
    "service": Case.Service.KA,
}

CASE_SCENARIOS = [
    {
        "case_number": "SIM/2026/0001",
        "title": "Repeated Accused - Loss of Ammunition",
        "offence": "Loss of ammunition",
        "offence_type": Case.OffenceType.SERVICE,
        "service_offence_severity": Case.ServiceOffenceSeverity.SERIOUS,
        "place_of_offence": "Kahawa Barracks armoury",
        "police_station": "",
        "description": (
            "Simulation case 1: the same accused is linked to a separate allegation "
            "involving missing ammunition from the armoury."
        ),
        "battalion_name": "Simulation 1 MP Battalion",
        "battalion_code": "SIM1MP",
        "team_name": "Simulation Alpha Investigation Team",
        "tasking_no": "SIM-TASK-001",
    },
    {
        "case_number": "SIM/2026/0002",
        "title": "Repeated Accused - Assault at Mess",
        "offence": "Assault",
        "offence_type": Case.OffenceType.CRIMINAL,
        "criminal_offence_type": Case.CriminalOffenceType.COURT_MARTIAL,
        "place_of_offence": "Embakasi mess hall",
        "police_station": "",
        "description": (
            "Simulation case 2: the same accused appears in a different case, "
            "tasked to a different battalion for investigation."
        ),
        "battalion_name": "Simulation 2 MP Battalion",
        "battalion_code": "SIM2MP",
        "team_name": "Simulation Bravo Investigation Team",
        "tasking_no": "SIM-TASK-002",
    },
    {
        "case_number": "SIM/2026/0003",
        "title": "Repeated Accused - Civilian Property Damage",
        "offence": "Malicious damage to property",
        "offence_type": Case.OffenceType.CRIMINAL,
        "criminal_offence_type": Case.CriminalOffenceType.DCI_CIV,
        "place_of_offence": "Langata shopping centre",
        "police_station": "Langata Police Station",
        "description": (
            "Simulation case 3: the same accused is linked to a civilian complaint, "
            "with investigation handled by a third battalion."
        ),
        "battalion_name": "Simulation 3 MP Battalion",
        "battalion_code": "SIM3MP",
        "team_name": "Simulation Charlie Investigation Team",
        "tasking_no": "SIM-TASK-003",
    },
]


class Command(BaseCommand):
    help = (
        "Create repeat-accused simulation data: one accused appearing in multiple "
        "different cases, each tasked to a different battalion."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--admin-service-number",
            default="000001",
            help="Existing HQ admin/superuser service number to mark as creator.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        admin_service_number = options["admin_service_number"]
        created_by = User.objects.filter(service_number=admin_service_number).first()

        formation, _ = Formation.objects.get_or_create(
            name="Simulation Formation",
            defaults={"location": "Training Dataset"},
        )
        accused_unit, _ = Unit.objects.get_or_create(
            name="Simulation Accused Unit",
            defaults={
                "code": "SIMACC",
                "formation": formation,
                "service": Unit.Service.KA,
            },
        )

        created_cases = []
        for index, scenario in enumerate(CASE_SCENARIOS, start=1):
            battalion, _ = Battalion.objects.get_or_create(
                name=scenario["battalion_name"],
                defaults={
                    "code": scenario["battalion_code"],
                    "formation": formation,
                    "battalion_type": Battalion.BattalionType.NORMAL,
                },
            )
            investigator, _ = User.objects.get_or_create(
                service_number=f"SIM-IO-{index:03d}",
                defaults={
                    "name": f"Simulation Investigator {index}",
                    "rank": "Captain",
                    "role": User.Role.INVESTIGATOR,
                    "battalion": battalion,
                    "mfa_exempt": True,
                    "must_change_password": False,
                },
            )
            team, _ = InvestigationTeam.objects.get_or_create(
                name=scenario["team_name"],
                battalion=battalion,
                defaults={"team_ic": investigator},
            )
            if team.team_ic_id != investigator.id:
                team.team_ic = investigator
                team.save(update_fields=["team_ic"])
            team.members.set([investigator])

            case_defaults = {
                "case_type": Case.CaseType.RFI,
                "title": scenario["title"],
                "description": scenario["description"],
                "status": Case.Status.UNDER_INVESTIGATION,
                "offence": scenario["offence"],
                "offence_type": scenario["offence_type"],
                "service_offence_severity": scenario.get("service_offence_severity", ""),
                "criminal_offence_type": scenario.get("criminal_offence_type", ""),
                "accused_name": ACCUSED["name"],
                "accused_rank": ACCUSED["rank"],
                "accused_service_number": ACCUSED["service_number"],
                "accused_service": ACCUSED["service"],
                "accused_unit": accused_unit,
                "submitting_unit": accused_unit,
                "police_station": scenario["police_station"],
                "place_of_offence": scenario["place_of_offence"],
                "tasked_battalion": battalion,
                "assigned_team": team,
                "assigned_to": None,
                "created_by": created_by,
                "tasking_no": scenario["tasking_no"],
                "tasking_date": timezone.now() - timedelta(days=10 - index),
                "team_assigned_at": timezone.now() - timedelta(days=7 - index),
                "date_of_offence": timezone.localdate() - timedelta(days=20 + index),
                "investigation_deadline": timezone.localdate() + timedelta(days=14 + index),
                "remarks": (
                    "Simulation data: repeat accused record used to test cross-battalion "
                    "case visibility and investigation assignment."
                ),
            }
            case, case_created = Case.objects.update_or_create(
                case_number=scenario["case_number"],
                defaults=case_defaults,
            )
            case.accused_entries.all().delete()
            CaseAccused.objects.create(
                case=case,
                name=ACCUSED["name"],
                rank=ACCUSED["rank"],
                service_number=ACCUSED["service_number"],
                service=ACCUSED["service"],
                unit=accused_unit,
            )
            CaseActivityLog.objects.get_or_create(
                case=case,
                action=CaseActivityLog.Action.BATTALION_TASKED,
                detail=f"Simulation case tasked to {battalion.name}.",
                defaults={"actor": created_by},
            )
            CaseActivityLog.objects.get_or_create(
                case=case,
                action=CaseActivityLog.Action.TEAM_ASSIGNED,
                detail=f"Simulation case assigned to {team.name}.",
                defaults={"actor": created_by},
            )
            created_cases.append((case, battalion, team, case_created))

        action = "created/updated"
        self.stdout.write(self.style.SUCCESS(f"Repeat-accused simulation {action}:"))
        for case, battalion, team, case_created in created_cases:
            verb = "created" if case_created else "updated"
            self.stdout.write(
                f" - {case.case_number}: {case.title} [{verb}] | "
                f"accused {ACCUSED['service_number']} | tasked to {battalion.name} | team {team.name}"
            )

        if not created_by:
            self.stdout.write(
                self.style.WARNING(
                    f"No user with service number {admin_service_number} was found; cases were created without a creator."
                )
            )
