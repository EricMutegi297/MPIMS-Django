import json

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.formations.models import Battalion, Formation, Unit
from apps.notifications.models import Notification
from apps.users.models import User
from .models import Case, CaseAttachment, InvestigationTeam


class CaseApiTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.formation = Formation.objects.create(name="1st Formation")
        cls.battalion = Battalion.objects.create(
            name="HQS Battalion",
            battalion_type=Battalion.BattalionType.HQS,
            formation=cls.formation,
        )
        cls.unit = Unit.objects.create(
            name="1 KR BN",
            battalion=cls.battalion,
            formation=cls.formation,
            service=Unit.Service.KA,
        )
        cls.special_battalion = Battalion.objects.create(
            name="Special Investigation Battalion",
            battalion_type=Battalion.BattalionType.SPECIAL,
            formation=cls.formation,
        )
        cls.special_admin = User.objects.create_user(
            service_number="200001",
            password="testpass",
            name="Special Admin",
            rank="Major",
            role=User.Role.ADMIN,
            battalion=cls.special_battalion,
        )
        cls.investigator = User.objects.create_user(
            service_number="200002",
            password="testpass",
            name="Case Investigator",
            rank="Captain",
            role=User.Role.INVESTIGATOR,
            battalion=cls.special_battalion,
        )
        cls.team_member = User.objects.create_user(
            service_number="200003",
            password="testpass",
            name="Team Member",
            rank="Sergeant",
            role=User.Role.INVESTIGATOR,
            battalion=cls.special_battalion,
        )
        cls.team = InvestigationTeam.objects.create(
            name="Alpha Team",
            battalion=cls.special_battalion,
            team_ic=cls.team_member,
        )
        cls.team.members.set([cls.team_member])
        cls.superuser = User.objects.create_superuser(
            service_number="000001",
            password="testpass",
            name="Super User",
        )
        cls.corps_commander = User.objects.create_user(
            service_number="100001",
            password="testpass",
            name="Corps Commander",
            rank="Brigadier",
            role=User.Role.CORPS_CMD,
        )

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(user=self.superuser)

    def test_create_case_without_accused_entries_allows_hqs_admin(self):
        url = reverse("case-list")
        payload = {
            "description": "HQS case without accused entries",
            "offence": "Theft",
            "date_of_offence": "2026-06-28",
            "submitting_unit": str(self.unit.id),
        }

        response = self.client.post(url, payload, format="multipart")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("case_number", response.data)
        self.assertEqual(Case.objects.filter(case_number=response.data["case_number"]).count(), 1)

    def test_create_case_with_multipart_json_accused_entries_creates_duplicate_cases(self):
        url = reverse("case-list")
        accused_data = [
            {
                "name": "Salin",
                "rank": "Senior Sergeant",
                "service_number": "154",
                "service": "KA",
                "unit": self.unit.id,
            },
            {
                "name": "Gallao",
                "rank": "Corporal",
                "service_number": "133566",
                "service": "KN",
                "unit": self.unit.id,
            },
        ]
        payload = {
            "description": "HQS multipart create",
            "offence": "Theft",
            "date_of_offence": "2026-06-28",
            "submitting_unit": str(self.unit.id),
            "accused_entries": json.dumps(accused_data),
        }

        response = self.client.post(url, payload, format="multipart")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data["case_number"].endswith("A"))
        self.assertEqual(len(response.data.get("accused_entries", [])), 1)
        self.assertEqual(response.data["accused_entries"][0]["name"], "Salin")

        base_number = response.data["case_number"][:-1]
        suffix_b = f"{base_number}B"

        self.assertTrue(Case.objects.filter(case_number=suffix_b).exists())
        case_b = Case.objects.get(case_number=suffix_b)
        self.assertEqual(case_b.accused_entries.count(), 1)
        self.assertEqual(case_b.accused_entries.first().name, "Gallao")
        self.assertEqual(Case.objects.filter(case_number__startswith=base_number).count(), 2)

    def test_corps_commander_notified_when_case_tasked_to_battalion(self):
        case = Case.objects.create(
            title="Battalion Tasking Notification",
            offence="Theft",
            status=Case.Status.NEW,
            created_by=self.superuser,
        )

        response = self.client.patch(
            reverse("case-detail", args=[case.id]),
            {
                "tasked_battalion": str(self.special_battalion.id),
                "tasking_letter": SimpleUploadedFile(
                    "tasking.pdf",
                    b"%PDF-1.4\n",
                    content_type="application/pdf",
                ),
                "tasking_date": timezone.now().isoformat(),
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assert_notification_message(case, "tasked to Special Investigation Battalion")

    def test_corps_commander_notified_when_case_served(self):
        case = Case.objects.create(
            title="Served Notification",
            offence="Theft",
            status=Case.Status.UNDER_INVESTIGATION,
            tasked_battalion=self.special_battalion,
            assigned_to=self.investigator,
            created_by=self.superuser,
        )

        response = self.client.patch(
            reverse("case-detail", args=[case.id]),
            {"status": Case.Status.SERVED},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assert_notification_message(case, "has been served")

    def test_corps_commander_notified_when_case_closed_with_action_taken(self):
        case = Case.objects.create(
            title="Closed Notification",
            offence="Theft",
            status=Case.Status.SERVED,
            tasked_battalion=self.special_battalion,
            assigned_to=self.investigator,
            rfi_document="cases/rfi.pdf",
            chargesheet="cases/chargesheet.pdf",
            created_by=self.superuser,
        )
        CaseAttachment.objects.create(
            case=case,
            label="Judgment",
            document_type=CaseAttachment.DocumentType.JUDGMENT,
            file="cases/judgment.pdf",
            uploaded_by=self.superuser,
        )
        action_taken = "Charges processed and final warning issued."

        response = self.client.patch(
            reverse("case-detail", args=[case.id]),
            {
                "status": Case.Status.CLOSED,
                "action_taken": action_taken,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assert_notification_message(case, action_taken)

    def assert_notification_message(self, case, expected):
        notifications = Notification.objects.filter(
            recipient=self.corps_commander,
            related_model="case",
            related_id=case.id,
        )
        self.assertTrue(any(expected in notification.message for notification in notifications))

    def test_assign_case_to_single_io_clears_team_and_moves_under_investigation(self):
        case = Case.objects.create(
            title="Direct IO Assignment",
            offence="Theft",
            status=Case.Status.TASKED,
            tasked_battalion=self.special_battalion,
            tasking_letter="cases/test-tasking.pdf",
            tasking_date=timezone.now(),
            assigned_team=self.team,
            created_by=self.superuser,
        )
        self.client.force_authenticate(user=self.special_admin)

        response = self.client.patch(
            reverse("case-detail", args=[case.id]),
            {
                "assigned_to": self.investigator.id,
                "investigation_deadline": "2026-08-15",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        case.refresh_from_db()
        self.assertEqual(case.assigned_to_id, self.investigator.id)
        self.assertIsNone(case.assigned_team_id)
        self.assertEqual(case.status, Case.Status.UNDER_INVESTIGATION)
        self.assertIsNotNone(case.team_assigned_at)
        self.assertEqual(response.data["assigned_to"], self.investigator.id)
        self.assertIsNone(response.data["assigned_team"])

    def test_assign_dci_civ_case_to_single_io_moves_under_investigation(self):
        case = Case.objects.create(
            title="DCI Direct IO Assignment",
            offence="Fatal",
            status=Case.Status.TASKED,
            criminal_offence_type=Case.CriminalOffenceType.DCI_CIV,
            tasked_battalion=self.special_battalion,
            tasking_letter="cases/test-tasking.pdf",
            tasking_date=timezone.now(),
            created_by=self.superuser,
        )
        self.client.force_authenticate(user=self.special_admin)

        response = self.client.patch(
            reverse("case-detail", args=[case.id]),
            {
                "assigned_to": self.investigator.id,
                "investigation_deadline": "2026-08-15",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        case.refresh_from_db()
        self.assertEqual(case.assigned_to_id, self.investigator.id)
        self.assertEqual(case.status, Case.Status.UNDER_INVESTIGATION)
        self.assertEqual(response.data["status"], Case.Status.UNDER_INVESTIGATION)

    def test_assign_dci_civ_case_to_team_moves_under_investigation(self):
        case = Case.objects.create(
            title="DCI Team Assignment",
            offence="Fatal",
            status=Case.Status.TASKED,
            criminal_offence_type=Case.CriminalOffenceType.DCI_CIV,
            tasked_battalion=self.special_battalion,
            tasking_letter="cases/test-tasking.pdf",
            tasking_date=timezone.now(),
            created_by=self.superuser,
        )
        self.client.force_authenticate(user=self.special_admin)

        response = self.client.patch(
            reverse("case-detail", args=[case.id]),
            {
                "assigned_team": self.team.id,
                "investigation_deadline": "2026-08-15",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        case.refresh_from_db()
        self.assertEqual(case.assigned_team_id, self.team.id)
        self.assertEqual(case.status, Case.Status.UNDER_INVESTIGATION)
        self.assertEqual(response.data["status"], Case.Status.UNDER_INVESTIGATION)

    def test_dci_close_request_keeps_assigned_case_under_investigation(self):
        case = Case.objects.create(
            title="DCI Close Request",
            offence="Fatal",
            status=Case.Status.TASKED,
            criminal_offence_type=Case.CriminalOffenceType.DCI_CIV,
            tasked_battalion=self.special_battalion,
            tasking_letter="cases/test-tasking.pdf",
            tasking_date=timezone.now(),
            assigned_to=self.investigator,
            created_by=self.superuser,
        )
        self.client.force_authenticate(user=self.investigator)

        response = self.client.patch(
            reverse("case-detail", args=[case.id]),
            {"close_requested": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        case.refresh_from_db()
        self.assertTrue(case.close_requested)
        self.assertIsNotNone(case.close_requested_at)
        self.assertEqual(case.status, Case.Status.UNDER_INVESTIGATION)
        self.assertEqual(response.data["status"], Case.Status.UNDER_INVESTIGATION)

    def test_cannot_assign_case_to_io_and_team_at_once(self):
        case = Case.objects.create(
            title="Conflicting Assignment",
            offence="Theft",
            status=Case.Status.TASKED,
            tasked_battalion=self.special_battalion,
            tasking_letter="cases/test-tasking.pdf",
            tasking_date=timezone.now(),
            created_by=self.superuser,
        )
        self.client.force_authenticate(user=self.special_admin)

        response = self.client.patch(
            reverse("case-detail", args=[case.id]),
            {
                "assigned_to": self.investigator.id,
                "assigned_team": self.team.id,
                "investigation_deadline": "2026-08-15",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("assignment", response.data)

    def test_directly_assigned_io_can_see_case(self):
        case = Case.objects.create(
            title="Visible Direct Assignment",
            offence="Theft",
            status=Case.Status.UNDER_INVESTIGATION,
            tasked_battalion=self.special_battalion,
            assigned_to=self.investigator,
            created_by=self.superuser,
        )
        self.client.force_authenticate(user=self.investigator)

        response = self.client.get(reverse("case-detail", args=[case.id]))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["id"], case.id)

    def test_closed_case_rejects_extra_attachment_upload(self):
        case = Case.objects.create(
            title="Closed Attachment Lock",
            offence="Theft",
            status=Case.Status.CLOSED,
            assigned_to=self.investigator,
            created_by=self.superuser,
        )
        self.client.force_authenticate(user=self.investigator)

        response = self.client.post(
            reverse("case-attachments", args=[case.id]),
            {
                "label": "Late attachment",
                "file": SimpleUploadedFile("late.pdf", b"%PDF-1.4\n", content_type="application/pdf"),
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("case", response.data)

    def test_closed_case_rejects_case_file_field_update(self):
        case = Case.objects.create(
            title="Closed Case File Lock",
            offence="Theft",
            status=Case.Status.CLOSED,
            created_by=self.superuser,
        )

        response = self.client.patch(
            reverse("case-detail", args=[case.id]),
            {
                "rfi_document": SimpleUploadedFile("late-rfi.pdf", b"%PDF-1.4\n", content_type="application/pdf"),
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("rfi_document", response.data)
