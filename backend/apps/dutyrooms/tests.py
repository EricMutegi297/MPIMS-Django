from datetime import datetime

from django.utils import timezone
from rest_framework.test import APITestCase

from apps.dutyrooms.models import OccurrenceBook, OccurrenceEntry
from apps.formations.models import Battalion
from apps.users.models import User


class TrafficStatisticsTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_superuser(
            service_number="900001",
            password="pass",
            name="HQ Admin",
            role=User.Role.ADMIN,
        )
        self.battalion = Battalion.objects.create(
            name="Test Battalion",
            battalion_type=Battalion.BattalionType.NORMAL,
        )
        self.client.force_authenticate(self.user)

    def _book(self, date):
        return OccurrenceBook.objects.create(date=date, battalion=self.battalion, opened_by=self.user)

    def _entry(self, book, serial_no, rta_type, injured, dead, occurred_at):
        return OccurrenceEntry.objects.create(
            book=book,
            serial_no=serial_no,
            occurred_at=occurred_at,
            entry_type=OccurrenceEntry.EntryType.ROAD_TRAFFIC_ACCIDENT,
            road_traffic_type=rta_type,
            injured_count=injured,
            dead_count=dead,
            description="Road traffic accident",
            recorded_by=self.user,
        )

    def test_traffic_statistics_group_rta_counts_with_yankee_and_xray(self):
        book = self._book("2026-08-03")
        occurred_at = timezone.make_aware(datetime(2026, 8, 3, 8, 0))
        self._entry(book, 1, OccurrenceEntry.RoadTrafficType.INJURY, 3, 0, occurred_at)
        self._entry(book, 2, OccurrenceEntry.RoadTrafficType.INJURY, 2, 0, occurred_at)
        self._entry(book, 3, OccurrenceEntry.RoadTrafficType.FATAL, 1, 2, occurred_at)
        OccurrenceEntry.objects.create(
            book=book,
            serial_no=4,
            occurred_at=occurred_at,
            entry_type=OccurrenceEntry.EntryType.ROUTINE,
            description="Routine entry",
            recorded_by=self.user,
        )

        response = self.client.get(
            "/api/dutyrooms/entries/traffic-statistics/",
            {"period": "range", "date_from": "2026-08-01", "date_to": "2026-08-31"},
        )

        self.assertEqual(response.status_code, 200)
        rows = {row["key"]: row for row in response.data["rows"]}
        self.assertEqual(rows["injury"]["reported"], 2)
        self.assertEqual(rows["injury"]["yankee"], 5)
        self.assertEqual(rows["injury"]["xray"], 0)
        self.assertEqual(rows["fatal"]["reported"], 1)
        self.assertEqual(rows["fatal"]["yankee"], 1)
        self.assertEqual(rows["fatal"]["xray"], 2)
        self.assertEqual(response.data["totals"], {"reported": 3, "yankee": 6, "xray": 2})
        self.assertEqual(response.data["legend"], {"yankee": "injured", "xray": "dead"})

    def test_traffic_statistics_respects_date_range(self):
        august_book = self._book("2026-08-03")
        july_book = self._book("2026-07-30")
        self._entry(
            august_book,
            1,
            OccurrenceEntry.RoadTrafficType.HIT_AND_RUN,
            4,
            1,
            timezone.make_aware(datetime(2026, 8, 3, 8, 0)),
        )
        self._entry(
            july_book,
            1,
            OccurrenceEntry.RoadTrafficType.HIT_AND_RUN,
            9,
            3,
            timezone.make_aware(datetime(2026, 7, 30, 8, 0)),
        )

        response = self.client.get(
            "/api/dutyrooms/entries/traffic-statistics/",
            {"period": "range", "date_from": "2026-08-01", "date_to": "2026-08-31"},
        )

        self.assertEqual(response.status_code, 200)
        rows = {row["key"]: row for row in response.data["rows"]}
        self.assertEqual(rows["hit_and_run"]["reported"], 1)
        self.assertEqual(rows["hit_and_run"]["yankee"], 4)
        self.assertEqual(rows["hit_and_run"]["xray"], 1)

    def test_occurrence_entry_list_filters_traffic_type_and_date_range(self):
        august_book = self._book("2026-08-03")
        july_book = self._book("2026-07-30")
        expected = self._entry(
            august_book,
            1,
            OccurrenceEntry.RoadTrafficType.INJURY,
            2,
            0,
            timezone.make_aware(datetime(2026, 8, 3, 8, 0)),
        )
        fatal = self._entry(
            august_book,
            2,
            OccurrenceEntry.RoadTrafficType.FATAL,
            1,
            1,
            timezone.make_aware(datetime(2026, 8, 3, 9, 0)),
        )
        self._entry(
            july_book,
            1,
            OccurrenceEntry.RoadTrafficType.INJURY,
            5,
            0,
            timezone.make_aware(datetime(2026, 7, 30, 8, 0)),
        )

        response = self.client.get(
            "/api/dutyrooms/entries/",
            {
                "entry_type": OccurrenceEntry.EntryType.ROAD_TRAFFIC_ACCIDENT,
                "road_traffic_type": OccurrenceEntry.RoadTrafficType.INJURY,
                "date_from": "2026-08-01",
                "date_to": "2026-08-31",
            },
        )

        self.assertEqual(response.status_code, 200)
        results = response.data["results"] if isinstance(response.data, dict) and "results" in response.data else response.data
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["id"], expected.id)

        metric_response = self.client.get(
            "/api/dutyrooms/entries/",
            {
                "entry_type": OccurrenceEntry.EntryType.ROAD_TRAFFIC_ACCIDENT,
                "metric": "xray",
                "date_from": "2026-08-01",
                "date_to": "2026-08-31",
            },
        )

        self.assertEqual(metric_response.status_code, 200)
        metric_results = metric_response.data["results"] if isinstance(metric_response.data, dict) and "results" in metric_response.data else metric_response.data
        self.assertEqual(len(metric_results), 1)
        self.assertEqual(metric_results[0]["id"], fatal.id)
