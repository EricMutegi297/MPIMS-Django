from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.users.models import User
from .models import Formation, Unit


class UnitApiTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.formation = Formation.objects.create(name="Eastern Formation")
        cls.superuser = User.objects.create_superuser(
            service_number="900001",
            password="testpass",
            name="Super User",
        )

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(user=self.superuser)

    def test_army_unit_requires_formation(self):
        response = self.client.post(
            reverse("unit-list"),
            {"name": "No Formation Army Unit", "service": Unit.Service.KA},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("formation", response.data)

    def test_air_force_unit_does_not_keep_formation_reference(self):
        response = self.client.post(
            reverse("unit-list"),
            {
                "name": "KAF Detached Unit",
                "service": Unit.Service.KAF,
                "formation": self.formation.id,
                "email": "kaf-detached@example.com",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        unit = Unit.objects.get(pk=response.data["id"])
        self.assertEqual(unit.service, Unit.Service.KAF)
        self.assertIsNone(unit.formation_id)
        self.assertEqual(unit.email, "kaf-detached@example.com")

    def test_units_page_size_query_param_is_honored(self):
        Unit.objects.bulk_create(
            Unit(name=f"Army Unit {index:02d}", service=Unit.Service.KA, formation=self.formation)
            for index in range(25)
        )

        response = self.client.get(reverse("unit-list"), {"page_size": 500})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 25)
        self.assertEqual(len(response.data["results"]), 25)

    def test_unit_search_and_service_filter(self):
        Unit.objects.create(
            name="Signal Operations Unit",
            code="SIGOPS",
            service=Unit.Service.KA,
            formation=self.formation,
        )
        Unit.objects.create(
            name="Air Support Unit",
            service=Unit.Service.KAF,
            email="air-support@example.com",
        )

        search_response = self.client.get(reverse("unit-list"), {"search": "signal"})
        self.assertEqual(search_response.status_code, status.HTTP_200_OK)
        self.assertEqual(search_response.data["count"], 1)
        self.assertEqual(search_response.data["results"][0]["code"], "SIGOPS")

        filter_response = self.client.get(reverse("unit-list"), {"service": Unit.Service.KAF})
        self.assertEqual(filter_response.status_code, status.HTTP_200_OK)
        self.assertEqual(filter_response.data["count"], 1)
        self.assertEqual(filter_response.data["results"][0]["service"], Unit.Service.KAF)

    def test_formation_search_matches_name_or_location(self):
        Formation.objects.create(name="Northern Formation", location="Isiolo")

        response = self.client.get(reverse("formation-list"), {"search": "isiolo"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["name"], "Northern Formation")
