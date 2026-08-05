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
