import json

from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.formations.models import Battalion, Formation, Unit
from apps.users.models import User
from .models import Case


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
        cls.superuser = User.objects.create_superuser(
            service_number="000001",
            password="testpass",
            name="Super User",
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
