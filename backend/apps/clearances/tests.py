from datetime import datetime, timezone as datetime_timezone

from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.clearances.models import ClearanceRequest
from apps.clearances.services import add_six_calendar_months
from apps.cases.models import Case, CaseAccused
from apps.formations.models import Battalion, Company, Detachment, Formation, Unit
from apps.notifications.models import Notification
from apps.users.models import User


class ClearanceRequestApiTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        formation = Formation.objects.create(name="Clearance Test Formation")
        cls.unit = Unit.objects.create(
            name="Clearance Test Unit",
            formation=formation,
            service=Unit.Service.KA,
        )
        cls.other_unit = Unit.objects.create(
            name="Other Clearance Test Unit",
            formation=formation,
            service=Unit.Service.KA,
        )
        hqs_battalion = Battalion.objects.create(
            name="Clearance Test HQS",
            battalion_type=Battalion.BattalionType.HQS,
            formation=formation,
        )
        cls.requester = User.objects.create_user(
            service_number="710001",
            password="test-password",
            name="Dorcus Requester",
            rank="Captain",
            role=User.Role.CO,
            unit=cls.unit,
        )
        cls.subject = User.objects.create_user(
            service_number="710002",
            password="test-password",
            name="Clearance Subject",
            rank="Sergeant",
            role=User.Role.PERSONNEL,
            unit=cls.unit,
        )
        cls.other_unit_member = User.objects.create_user(
            service_number="710003",
            password="test-password",
            name="Other Unit Member",
            rank="Corporal",
            role=User.Role.PERSONNEL,
            unit=cls.other_unit,
        )
        cls.hqs_admin = User.objects.create_user(
            service_number="719999",
            password="test-password",
            name="HQS Admin",
            role=User.Role.ADMIN,
            battalion=hqs_battalion,
        )
        cls.regular_admin = User.objects.create_user(
            service_number="719998",
            password="test-password",
            name="Unit Admin",
            role=User.Role.ADMIN,
            unit=cls.unit,
        )
        cls.unit_adjutant = User.objects.create_user(
            service_number="710004",
            password="clearance-test-password",
            name="Unit Adjutant",
            role=User.Role.ADJ,
            unit=cls.unit,
        )

    def setUp(self):
        self.client.force_authenticate(user=self.requester)
        self.request_url = reverse("clearance-request-list")

    def submit_request(self, service_number=None):
        return self.client.post(
            self.request_url,
            {"service_number": service_number or self.subject.service_number},
            format="json",
        )

    def approve_certificate(self):
        response = self.submit_request()
        self.client.force_authenticate(user=self.hqs_admin)
        approval = self.client.post(
            reverse("clearance-request-approve", args=[response.data["id"]]),
            {},
            format="json",
        )
        self.assertEqual(approval.status_code, status.HTTP_200_OK)
        return ClearanceRequest.objects.get(pk=response.data["id"])

    def test_request_history_is_empty_before_first_request(self):
        response = self.client.get(self.request_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])

    def test_authorized_unit_users_and_hqs_admin_see_clearance_history(self):
        rejected_request = self.submit_request()
        self.client.force_authenticate(user=self.hqs_admin)
        rejection = self.client.post(
            reverse("clearance-request-reject", args=[rejected_request.data["id"]]),
            {"decision_note": "Clearance is not approved."},
            format="json",
        )
        self.assertEqual(rejection.status_code, status.HTTP_200_OK)

        self.client.force_authenticate(user=self.requester)
        approved_request = self.submit_request()
        self.client.force_authenticate(user=self.hqs_admin)
        approval = self.client.post(
            reverse("clearance-request-approve", args=[approved_request.data["id"]]),
            {},
            format="json",
        )
        self.assertEqual(approval.status_code, status.HTTP_200_OK)

        second_subject = User.objects.create_user(
            service_number="710005",
            password="test-password",
            name="Second Clearance Subject",
            rank="Private",
            role=User.Role.PERSONNEL,
            unit=self.unit,
        )
        self.client.force_authenticate(user=self.requester)
        pending_request = self.submit_request(second_subject.service_number)

        other_unit_requester = User.objects.create_user(
            service_number="720001",
            password="test-password",
            name="Other Unit Commander",
            role=User.Role.CO,
            unit=self.other_unit,
        )
        self.client.force_authenticate(user=other_unit_requester)
        outside_unit_request = self.submit_request(self.other_unit_member.service_number)

        self.client.force_authenticate(user=self.unit_adjutant)
        unit_history = self.client.get(self.request_url)
        self.assertEqual(unit_history.status_code, status.HTTP_200_OK)
        self.assertEqual(
            {item["id"] for item in unit_history.data},
            {
                rejected_request.data["id"],
                approved_request.data["id"],
                pending_request.data["id"],
            },
        )
        self.assertEqual(
            {item["status"] for item in unit_history.data},
            {
                ClearanceRequest.Status.REJECTED,
                ClearanceRequest.Status.APPROVED,
                ClearanceRequest.Status.PENDING,
            },
        )

        self.client.force_authenticate(user=self.hqs_admin)
        hqs_history = self.client.get(self.request_url)
        self.assertEqual(hqs_history.status_code, status.HTTP_200_OK)
        self.assertEqual(
            {item["id"] for item in hqs_history.data},
            {
                rejected_request.data["id"],
                approved_request.data["id"],
                pending_request.data["id"],
                outside_unit_request.data["id"],
            },
        )

    def test_unit_commander_can_submit_request_for_same_unit_member(self):
        response = self.submit_request()

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["status"], "pending")
        self.assertEqual(response.data["subject_service_number"], self.subject.service_number)

    def test_duplicate_pending_request_is_rejected(self):
        self.assertEqual(self.submit_request().status_code, status.HTTP_201_CREATED)

        response = self.submit_request()

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)

    def test_request_is_blocked_when_subject_has_non_closed_case(self):
        case = Case.objects.create(
            title="Active case",
            accused_service_number=self.subject.service_number,
            status=Case.Status.UNDER_INVESTIGATION,
            tasked_battalion=self.hqs_admin.battalion,
        )

        response = self.submit_request()

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("cleared by MPC", response.data["detail"])
        self.assertEqual(
            response.data["ongoing_cases"],
            [
                {
                    "case_number": case.case_number,
                    "status": Case.Status.UNDER_INVESTIGATION,
                    "status_label": Case.Status.UNDER_INVESTIGATION.label,
                    "investigating_unit": f"Bn: {self.hqs_admin.battalion.name}",
                }
            ],
        )

    def test_blocked_request_identifies_investigating_battalion_company_and_detachment(self):
        battalion = self.hqs_admin.battalion
        company = Company.objects.create(
            battalion=battalion,
            company=Company.Company.A,
            name="Investigating Company",
        )
        detachment = Detachment.objects.create(
            company=company,
            name="Investigating Detachment",
        )
        cases = [
            Case.objects.create(
                title="Battalion tasking",
                accused_service_number=self.subject.service_number,
                status=Case.Status.OPEN,
                tasked_battalion=battalion,
            ),
            Case.objects.create(
                title="Company tasking",
                accused_service_number=self.subject.service_number,
                status=Case.Status.OPEN,
                tasked_company=company,
            ),
            Case.objects.create(
                title="Detachment tasking",
                accused_service_number=self.subject.service_number,
                status=Case.Status.OPEN,
                tasked_detachment=detachment,
            ),
        ]

        response = self.submit_request()

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        units_by_case = {
            case_item["case_number"]: case_item["investigating_unit"]
            for case_item in response.data["ongoing_cases"]
        }
        self.assertEqual(
            units_by_case,
            {
                cases[0].case_number: f"Bn: {battalion.name}",
                cases[1].case_number: f"Coy: {company.name}",
                cases[2].case_number: f"Det: {detachment.name}",
            },
        )

    def test_request_is_blocked_for_active_case_accused_entry(self):
        case = Case.objects.create(
            title="Active accused-entry case",
            status=Case.Status.PENDING,
        )
        CaseAccused.objects.create(case=case, service_number=self.subject.service_number)

        response = self.submit_request()

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data["ongoing_cases"][0]["case_number"], case.case_number)
        self.assertEqual(response.data["ongoing_cases"][0]["status"], Case.Status.PENDING)
        self.assertEqual(
            response.data["ongoing_cases"][0]["investigating_unit"],
            "Not recorded in MPIMS",
        )

    def test_closed_case_does_not_block_request(self):
        Case.objects.create(
            title="Closed case",
            accused_service_number=self.subject.service_number,
            status=Case.Status.CLOSED,
        )

        response = self.submit_request()

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_request_cannot_target_personnel_outside_requester_unit(self):
        response = self.submit_request(self.other_unit_member.service_number)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertIn("assigned to your unit", response.data["detail"])

    def test_request_for_unknown_service_number_returns_clear_error(self):
        response = self.submit_request("999999")

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertIn("active personnel", response.data["detail"])

    def test_non_unit_role_cannot_submit_clearance_request(self):
        self.client.force_authenticate(user=self.subject)

        response = self.submit_request()

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_hqs_can_approve_and_download_certificate(self):
        request_response = self.submit_request()
        request_id = request_response.data["id"]
        self.client.force_authenticate(user=self.hqs_admin)

        approval = self.client.post(
            reverse("clearance-request-approve", args=[request_id]),
            {},
            format="json",
        )

        self.assertEqual(approval.status_code, status.HTTP_200_OK)
        self.assertEqual(approval.data["status"], "approved")
        self.assertTrue(approval.data["certificate_number"])
        self.assertEqual(approval.data["validity_status"], "valid")
        clearance = ClearanceRequest.objects.get(pk=request_id)
        self.assertEqual(
            clearance.expires_at,
            add_six_calendar_months(clearance.reviewed_at),
        )

        certificate = self.client.get(
            reverse("clearance-request-certificate", args=[request_id])
        )
        self.assertEqual(certificate.status_code, status.HTTP_200_OK)
        self.assertEqual(certificate["Content-Type"], "application/pdf")
        self.assertTrue(b"".join(certificate.streaming_content).startswith(b"%PDF"))

    def test_certificate_preview_is_inline_pdf(self):
        clearance = self.approve_certificate()
        response = self.client.get(
            reverse("clearance-request-certificate-preview", args=[clearance.pk])
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertIn("inline", response["Content-Disposition"])
        self.assertTrue(b"".join(response.streaming_content).startswith(b"%PDF"))

    def test_new_case_invalidates_certificate_and_notifies_unit_leaders(self):
        clearance = self.approve_certificate()

        case = Case.objects.create(
            title="New case after clearance",
            accused_service_number=self.subject.service_number,
        )
        clearance.refresh_from_db()

        self.assertIsNotNone(clearance.invalidated_at)
        self.assertEqual(clearance.invalidating_case_id, case.pk)
        self.assertEqual(
            set(
                Notification.objects.filter(
                    related_model="clearance_request",
                    related_id=clearance.pk,
                ).values_list("recipient_id", flat=True)
            ),
            {self.requester.pk, self.unit_adjutant.pk},
        )

        self.client.force_authenticate(user=self.requester)
        preview = self.client.get(
            reverse("clearance-request-certificate-preview", args=[clearance.pk])
        )
        download = self.client.get(
            reverse("clearance-request-certificate", args=[clearance.pk])
        )
        self.assertEqual(preview.status_code, status.HTTP_410_GONE)
        self.assertEqual(preview.data["validity_status"], "invalidated")
        self.assertEqual(download.status_code, status.HTTP_410_GONE)

        requests = self.client.get(self.request_url)
        self.assertEqual(requests.data[0]["validity_status"], "invalidated")

    def test_case_accused_entry_invalidates_certificate(self):
        clearance = self.approve_certificate()
        case = Case.objects.create(title="Case recorded after clearance")

        CaseAccused.objects.create(
            case=case,
            service_number=self.subject.service_number,
        )
        clearance.refresh_from_db()

        self.assertIsNotNone(clearance.invalidated_at)
        self.assertEqual(clearance.invalidating_case_id, case.pk)

    def test_reopened_case_invalidates_current_certificate(self):
        case = Case.objects.create(
            title="Previously closed case",
            accused_service_number=self.subject.service_number,
            status=Case.Status.CLOSED,
        )
        clearance = self.approve_certificate()

        case.status = Case.Status.OPEN
        case.save(update_fields=["status"])
        clearance.refresh_from_db()

        self.assertIsNotNone(clearance.invalidated_at)
        self.assertEqual(clearance.invalidating_case_id, case.pk)

    def test_expired_certificate_cannot_be_previewed_or_downloaded(self):
        clearance = self.approve_certificate()
        clearance.expires_at = timezone.now()
        clearance.save(update_fields=["expires_at"])
        self.client.force_authenticate(user=self.requester)

        preview = self.client.get(
            reverse("clearance-request-certificate-preview", args=[clearance.pk])
        )
        download = self.client.get(
            reverse("clearance-request-certificate", args=[clearance.pk])
        )

        self.assertEqual(preview.status_code, status.HTTP_410_GONE)
        self.assertEqual(preview.data["validity_status"], "expired")
        self.assertEqual(download.status_code, status.HTTP_410_GONE)

    def test_six_month_expiry_uses_calendar_month_end(self):
        approved_at = datetime(2026, 8, 31, 12, 0, tzinfo=datetime_timezone.utc)

        self.assertEqual(
            add_six_calendar_months(approved_at),
            datetime(2027, 2, 28, 12, 0, tzinfo=datetime_timezone.utc),
        )

    def test_approval_rechecks_cases_opened_after_request(self):
        request_response = self.submit_request()
        case = Case.objects.create(
            title="Newly opened case",
            status=Case.Status.UNDER_INVESTIGATION,
        )
        CaseAccused.objects.create(case=case, service_number=self.subject.service_number)
        self.client.force_authenticate(user=self.hqs_admin)

        approval = self.client.post(
            reverse("clearance-request-approve", args=[request_response.data["id"]]),
            {},
            format="json",
        )

        self.assertEqual(approval.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(
            approval.data["ongoing_cases"],
            [
                {
                    "case_number": case.case_number,
                    "status": Case.Status.UNDER_INVESTIGATION,
                    "status_label": Case.Status.UNDER_INVESTIGATION.label,
                    "investigating_unit": "Not recorded in MPIMS",
                }
            ],
        )
        self.assertEqual(approval.data["ongoing_case_count"], 1)

    def test_live_ongoing_case_blocks_certificate_even_when_signal_was_bypassed(self):
        case = Case.objects.create(
            title="Previously closed case",
            accused_service_number=self.subject.service_number,
            status=Case.Status.CLOSED,
        )
        clearance = self.approve_certificate()

        Case.objects.filter(pk=case.pk).update(status=Case.Status.OPEN)
        self.client.force_authenticate(user=self.requester)
        preview = self.client.get(
            reverse("clearance-request-certificate-preview", args=[clearance.pk])
        )
        download = self.client.get(
            reverse("clearance-request-certificate", args=[clearance.pk])
        )

        self.assertEqual(preview.status_code, status.HTTP_410_GONE)
        self.assertEqual(
            preview.data["ongoing_cases"],
            [
                {
                    "case_number": case.case_number,
                    "status": Case.Status.OPEN,
                    "status_label": Case.Status.OPEN.label,
                    "investigating_unit": "Not recorded in MPIMS",
                }
            ],
        )
        self.assertEqual(download.status_code, status.HTTP_410_GONE)
        clearance.refresh_from_db()
        self.assertIsNotNone(clearance.invalidated_at)
        self.assertEqual(clearance.invalidating_case_id, case.pk)

    def test_non_hqs_admin_cannot_review_requests(self):
        request_response = self.submit_request()
        self.client.force_authenticate(user=self.regular_admin)

        response = self.client.post(
            reverse("clearance-request-approve", args=[request_response.data["id"]]),
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_rejection_requires_reason(self):
        request_response = self.submit_request()
        self.client.force_authenticate(user=self.hqs_admin)

        response = self.client.post(
            reverse("clearance-request-reject", args=[request_response.data["id"]]),
            {"decision_note": ""},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_only_requester_subject_or_hqs_admin_can_download_certificate(self):
        request_response = self.submit_request()
        request_id = request_response.data["id"]
        self.client.force_authenticate(user=self.hqs_admin)
        self.client.post(reverse("clearance-request-approve", args=[request_id]), {}, format="json")
        self.client.force_authenticate(user=self.other_unit_member)

        response = self.client.get(
            reverse("clearance-request-certificate", args=[request_id])
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
