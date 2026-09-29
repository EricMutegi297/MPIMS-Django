import json
import shutil
import tempfile
from unittest.mock import MagicMock, patch

from django.core.files.base import ContentFile
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.test import APIClient

from apps.formations.models import Battalion, Company, Detachment, Formation, Unit
from apps.notifications.models import Notification
from apps.users.models import User
from .models import Case, CaseAttachment, CaseNumberSequence, InvestigationTeam
from .uploads import UploadScanUnavailable, validate_case_upload


class CaseUploadValidationTests(SimpleTestCase):
    @override_settings(CASE_DOCUMENT_MAX_UPLOAD_BYTES=1024, CASE_UPLOAD_CLAMAV_ENABLED=False)
    def test_accepts_pdf_signature_and_normalizes_filename(self):
        upload = SimpleUploadedFile(
            "sensitive name.pdf",
            b"%PDF-1.7\nvalid test content",
            content_type="application/pdf",
        )

        validate_case_upload(upload, field_name="file", allowed_extensions={".pdf"})

        self.assertEqual(upload.name, "sensitive-name.pdf")

    @override_settings(CASE_DOCUMENT_MAX_UPLOAD_BYTES=1024, CASE_UPLOAD_CLAMAV_ENABLED=False)
    def test_rejects_extension_signature_mismatch(self):
        upload = SimpleUploadedFile(
            "payload.pdf",
            b"not a PDF",
            content_type="application/pdf",
        )

        with self.assertRaises(serializers.ValidationError):
            validate_case_upload(upload, field_name="file", allowed_extensions={".pdf"})

    @override_settings(CASE_DOCUMENT_MAX_UPLOAD_BYTES=1024, CASE_UPLOAD_CLAMAV_ENABLED=False)
    def test_rejects_mismatched_mime_type(self):
        upload = SimpleUploadedFile(
            "document.pdf",
            b"%PDF-1.7\nvalid test content",
            content_type="image/png",
        )

        with self.assertRaises(serializers.ValidationError):
            validate_case_upload(upload, field_name="file", allowed_extensions={".pdf"})

    @override_settings(CASE_DOCUMENT_MAX_UPLOAD_BYTES=1024, CASE_UPLOAD_CLAMAV_ENABLED=False)
    def test_rejects_extension_outside_field_allowlist(self):
        upload = SimpleUploadedFile(
            "document.png",
            b"%PDF-1.7\nvalid test content",
            content_type="application/pdf",
        )

        with self.assertRaises(serializers.ValidationError):
            validate_case_upload(upload, field_name="file", allowed_extensions={".pdf"})

    @override_settings(CASE_DOCUMENT_MAX_UPLOAD_BYTES=8, CASE_UPLOAD_CLAMAV_ENABLED=False)
    def test_rejects_oversized_upload(self):
        upload = SimpleUploadedFile(
            "large.pdf",
            b"%PDF-1.4\ncontent",
            content_type="application/pdf",
        )

        with self.assertRaises(serializers.ValidationError):
            validate_case_upload(upload, field_name="file", allowed_extensions={".pdf"})

    @override_settings(
        CASE_DOCUMENT_MAX_UPLOAD_BYTES=1024,
        CASE_UPLOAD_CLAMAV_ENABLED=True,
        CASE_UPLOAD_CLAMAV_HOST="localhost",
        CASE_UPLOAD_CLAMAV_PORT=3310,
        CASE_UPLOAD_CLAMAV_TIMEOUT=1,
    )
    @patch("apps.cases.uploads.socket.create_connection")
    def test_rejects_malware_reported_by_clamav(self, create_connection):
        connection = MagicMock()
        connection.__enter__.return_value = connection
        connection.recv.return_value = b"stream: Eicar-Test-Signature FOUND\0"
        create_connection.return_value = connection
        upload = SimpleUploadedFile(
            "document.pdf",
            b"%PDF-1.7\nvalid test content",
            content_type="application/pdf",
        )

        with self.assertRaises(serializers.ValidationError):
            validate_case_upload(upload, field_name="file", allowed_extensions={".pdf"})

    @override_settings(
        CASE_DOCUMENT_MAX_UPLOAD_BYTES=1024,
        CASE_UPLOAD_CLAMAV_ENABLED=True,
        CASE_UPLOAD_CLAMAV_HOST="localhost",
        CASE_UPLOAD_CLAMAV_PORT=3310,
        CASE_UPLOAD_CLAMAV_TIMEOUT=1,
    )
    @patch("apps.cases.uploads.socket.create_connection", side_effect=OSError("offline"))
    def test_rejects_upload_when_configured_scanner_is_unavailable(self, _create_connection):
        upload = SimpleUploadedFile(
            "document.pdf",
            b"%PDF-1.7\nvalid test content",
            content_type="application/pdf",
        )

        with self.assertRaises(UploadScanUnavailable):
            validate_case_upload(upload, field_name="file", allowed_extensions={".pdf"})


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

    def test_case_list_filters_status_and_criminal_offence_type(self):
        Case.objects.create(
            title="Court Martial case",
            status=Case.Status.NEW,
            criminal_offence_type=Case.CriminalOffenceType.COURT_MARTIAL,
            created_by=self.superuser,
        )
        Case.objects.create(
            title="DCI pending case",
            status=Case.Status.PENDING,
            criminal_offence_type=Case.CriminalOffenceType.DCI_CIV,
            created_by=self.superuser,
        )
        Case.objects.create(
            title="DCI new case",
            status=Case.Status.NEW,
            criminal_offence_type=Case.CriminalOffenceType.DCI_CIV,
            created_by=self.superuser,
        )

        pending_response = self.client.get(
            reverse("case-list"),
            {"status": Case.Status.PENDING, "page_size": 1},
        )
        court_martial_response = self.client.get(
            reverse("case-list"),
            {"criminal_offence_type": Case.CriminalOffenceType.COURT_MARTIAL, "page_size": 1},
        )
        combined_response = self.client.get(
            reverse("case-list"),
            {
                "status": Case.Status.NEW,
                "criminal_offence_type": Case.CriminalOffenceType.DCI_CIV,
                "page_size": 1,
            },
        )

        self.assertEqual(pending_response.status_code, status.HTTP_200_OK)
        self.assertEqual(pending_response.data["count"], 1)
        self.assertEqual(court_martial_response.data["count"], 1)
        self.assertEqual(combined_response.data["count"], 1)

    def test_unit_viewer_can_see_cases_submitted_by_their_unit(self):
        submitted_case = Case.objects.create(
            title="Served case submitted by unit",
            status=Case.Status.SERVED,
            submitting_unit=self.unit,
            tasked_battalion=self.special_battalion,
            created_by=self.superuser,
        )
        unrelated_unit = Unit.objects.create(
            name="2 KR BN",
            battalion=self.battalion,
            formation=self.formation,
            service=Unit.Service.KA,
        )
        unrelated_case = Case.objects.create(
            title="Case assigned to another accused unit",
            status=Case.Status.SERVED,
            submitting_unit=self.unit,
            accused_unit=unrelated_unit,
            tasked_battalion=self.special_battalion,
            created_by=self.superuser,
        )
        unit_viewer = User.objects.create_user(
            "300003",
            "test-password",
            name="Docus Clerk",
            role=User.Role.DOCUS_CLERK,
            unit=self.unit,
        )
        self.client.force_authenticate(user=unit_viewer)

        response = self.client.get(reverse("case-list"), {"status": Case.Status.SERVED})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(
            [case["id"] for case in response.data["results"]],
            [submitted_case.id],
        )
        self.assertNotIn(unrelated_case.id, [case["id"] for case in response.data["results"]])
        self.assertEqual(response.data["results"][0]["accused_unit_name"], self.unit.name)

    def test_detachment_ic_can_see_cases_tasked_to_their_detachment_only(self):
        company = Company.objects.create(
            battalion=self.battalion,
            company=Company.Company.A,
            name="A Company",
        )
        other_company = Company.objects.create(
            battalion=self.battalion,
            company=Company.Company.B,
            name="B Company",
        )
        detachment = Detachment.objects.create(company=company, name="Alpha Detachment")
        user = User.objects.create_user(
            "300004",
            "test-password",
            name="Detachment IC",
            role=User.Role.DETACHMENT,
            battalion=self.battalion,
            detachment=detachment,
        )
        own_detachment_case = Case.objects.create(
            title="Case tasked to own detachment",
            tasked_company=company,
            tasked_detachment=detachment,
            status=Case.Status.TASKED,
            created_by=self.superuser,
        )
        company_case = Case.objects.create(
            title="Company-level case",
            tasked_company=company,
            status=Case.Status.TASKED,
            created_by=self.superuser,
        )
        sibling_detachment = Detachment.objects.create(company=company, name="Bravo Detachment")
        sibling_detachment_case = Case.objects.create(
            title="Sibling-detachment case",
            tasked_company=company,
            tasked_detachment=sibling_detachment,
            status=Case.Status.TASKED,
            created_by=self.superuser,
        )
        unrelated_case = Case.objects.create(
            title="Other-company case",
            tasked_company=other_company,
            status=Case.Status.TASKED,
            created_by=self.superuser,
        )
        self.client.force_authenticate(user=user)

        response = self.client.get(reverse("case-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["id"], own_detachment_case.id)
        visible_ids = [case["id"] for case in response.data["results"]]
        self.assertNotIn(company_case.id, visible_ids)
        self.assertNotIn(sibling_detachment_case.id, visible_ids)
        self.assertNotIn(unrelated_case.id, visible_ids)

    def test_company_command_can_see_company_and_child_detachment_cases(self):
        company = Company.objects.create(
            battalion=self.battalion,
            company=Company.Company.A,
            name="A Company",
        )
        other_company = Company.objects.create(
            battalion=self.battalion,
            company=Company.Company.B,
            name="B Company",
        )
        own_detachment = Detachment.objects.create(company=company, name="Alpha Detachment")
        child_detachment = Detachment.objects.create(company=company, name="Bravo Detachment")
        other_detachment = Detachment.objects.create(company=other_company, name="Other Detachment")
        company_commander = User.objects.create_user(
            "300005",
            "test-password",
            name="Company Commander",
            role=User.Role.COMPANY_CMD,
            battalion=self.battalion,
            detachment=own_detachment,
        )
        company_case = Case.objects.create(
            title="Company-level case",
            tasked_company=company,
            status=Case.Status.TASKED,
            created_by=self.superuser,
        )
        child_case = Case.objects.create(
            title="Child-detachment case",
            tasked_company=company,
            tasked_detachment=child_detachment,
            status=Case.Status.TASKED,
            created_by=self.superuser,
        )
        unrelated_case = Case.objects.create(
            title="Other-company case",
            tasked_company=other_company,
            tasked_detachment=other_detachment,
            status=Case.Status.TASKED,
            created_by=self.superuser,
        )
        self.client.force_authenticate(user=company_commander)

        response = self.client.get(reverse("case-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        visible_ids = {case["id"] for case in response.data["results"]}
        self.assertEqual(response.data["count"], 2)
        self.assertEqual(visible_ids, {company_case.id, child_case.id})
        self.assertNotIn(unrelated_case.id, visible_ids)

    def test_company_ic_cases_can_view_and_assign_only_company_cases(self):
        company = Company.objects.create(
            battalion=self.battalion,
            company=Company.Company.A,
            name="IC Cases Company",
        )
        other_company = Company.objects.create(
            battalion=self.battalion,
            company=Company.Company.B,
            name="Other IC Cases Company",
        )
        ic_cases_user = User.objects.create_user(
            "300006",
            "test-password",
            name="Company IC Cases",
            role=User.Role.IC_CASES,
            battalion=self.battalion,
            company=company,
        )
        investigator = User.objects.create_user(
            "300007",
            "test-password",
            name="Company Investigator",
            role=User.Role.INVESTIGATOR,
            battalion=self.battalion,
            company=company,
        )
        company_case = Case.objects.create(
            title="IC Cases company case",
            tasked_company=company,
            status=Case.Status.TASKED,
            created_by=self.superuser,
        )
        unrelated_case = Case.objects.create(
            title="Other company case",
            tasked_company=other_company,
            status=Case.Status.TASKED,
            created_by=self.superuser,
        )
        self.client.force_authenticate(user=ic_cases_user)

        list_response = self.client.get(reverse("case-list"))
        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual(list_response.data["count"], 1)
        self.assertEqual(list_response.data["results"][0]["id"], company_case.id)

        assign_response = self.client.patch(
            reverse("case-detail", args=[company_case.id]),
            {"assigned_to": investigator.id},
            format="json",
        )
        self.assertEqual(assign_response.status_code, status.HTTP_200_OK, assign_response.data)
        company_case.refresh_from_db()
        self.assertEqual(company_case.assigned_to_id, investigator.id)

        unrelated_response = self.client.patch(
            reverse("case-detail", args=[unrelated_case.id]),
            {"assigned_to": investigator.id},
            format="json",
        )
        self.assertEqual(unrelated_response.status_code, status.HTTP_404_NOT_FOUND)

    def test_company_commander_can_view_and_attach_briefs_within_company_scope(self):
        company = Company.objects.create(
            battalion=self.battalion,
            company=Company.Company.A,
            name="Briefs Company",
        )
        other_company = Company.objects.create(
            battalion=self.battalion,
            company=Company.Company.B,
            name="Other Briefs Company",
        )
        own_detachment = Detachment.objects.create(company=company, name="HQ Detachment")
        child_detachment = Detachment.objects.create(company=company, name="Child Detachment")
        other_detachment = Detachment.objects.create(company=other_company, name="Other Detachment")
        commander = User.objects.create_user(
            "300006",
            "test-password",
            name="Briefs Company Commander",
            role=User.Role.COMPANY_CMD,
            battalion=self.battalion,
            detachment=own_detachment,
        )
        company_case = Case.objects.create(
            title="Company brief case",
            tasked_company=company,
            status=Case.Status.TASKED,
            created_by=self.superuser,
        )
        child_case = Case.objects.create(
            title="Child detachment brief case",
            tasked_company=company,
            tasked_detachment=child_detachment,
            status=Case.Status.TASKED,
            created_by=self.superuser,
        )
        unrelated_case = Case.objects.create(
            title="Unrelated brief case",
            tasked_company=other_company,
            tasked_detachment=other_detachment,
            status=Case.Status.TASKED,
            created_by=self.superuser,
        )
        self.client.force_authenticate(user=commander)

        briefable_response = self.client.get(reverse("case-briefable-cases"))
        self.assertEqual(briefable_response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            {case["id"] for case in briefable_response.data},
            {company_case.id, child_case.id},
        )

        media_root = tempfile.mkdtemp()
        try:
            with override_settings(MEDIA_ROOT=media_root, CASE_UPLOAD_CLAMAV_ENABLED=False):
                upload_response = self.client.post(
                    reverse("case-brief", args=[child_case.id]),
                    {
                        "summary": "Company commander brief",
                        "file": SimpleUploadedFile(
                            "brief.pdf",
                            b"%PDF-1.4\nbrief content",
                            content_type="application/pdf",
                        ),
                    },
                    format="multipart",
                )

                self.assertEqual(upload_response.status_code, status.HTTP_200_OK)
                self.assertEqual(upload_response.data["attached_by"], commander.pk)

                detail_response = self.client.get(reverse("case-detail", args=[child_case.id]))
                self.assertEqual(detail_response.status_code, status.HTTP_200_OK)
                self.assertIsNotNone(detail_response.data["brief"])

                file_response = self.client.get(upload_response.data["file"])
                self.assertEqual(file_response.status_code, status.HTTP_200_OK)

                briefs_response = self.client.get(reverse("case-briefs"))
                self.assertEqual(briefs_response.status_code, status.HTTP_200_OK)
                self.assertEqual(
                    {case["id"] for case in briefs_response.data},
                    {child_case.id},
                )

                unrelated_response = self.client.get(
                    reverse("case-brief", args=[unrelated_case.id])
                )
                self.assertEqual(unrelated_response.status_code, status.HTTP_404_NOT_FOUND)
        finally:
            shutil.rmtree(media_root, ignore_errors=True)

    def test_clearance_certificate_uses_existing_unit_service_access_policy(self):
        unit_user = User.objects.create_user(
            service_number="300001",
            password="test-password",
            name="Unit Officer",
            role=User.Role.CI,
            unit=self.unit,
        )
        case = Case.objects.create(
            title="DCI case with unit access",
            criminal_offence_type=Case.CriminalOffenceType.DCI_CIV,
            accused_unit=self.unit,
            created_by=self.superuser,
        )
        self.client.force_authenticate(user=unit_user)

        response = self.client.post(
            reverse("case-clearance-certificate", args=[case.id]),
            {},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            response.data["detail"],
            "Only the accused unit can attach a clearance certificate.",
        )

    def test_attachment_upload_uses_existing_attachment_access_policy(self):
        unit_user = User.objects.create_user(
            service_number="300002",
            password="test-password",
            name="Unit Officer",
            role=User.Role.CI,
            unit=self.unit,
        )
        case = Case.objects.create(
            title="Unit case attachment access",
            accused_unit=self.unit,
            created_by=self.superuser,
        )
        self.client.force_authenticate(user=unit_user)

        response = self.client.post(
            reverse("case-attachments", args=[case.id]),
            {},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            response.data["detail"],
            "Only authorised Company or Detachment command users can upload case attachments.",
        )

    def test_document_download_requires_case_access_and_sets_private_headers(self):
        media_root = tempfile.mkdtemp()
        try:
            with override_settings(MEDIA_ROOT=media_root):
                case = Case.objects.create(title="Protected document test", created_by=self.superuser)
                case.rfi_document.save(
                    "protected.pdf",
                    ContentFile(b"%PDF-1.4\nprotected"),
                    save=True,
                )
                download_url = f"/api/cases/{case.pk}/documents/field-rfi_document/download/"

                response = self.client.get(download_url)

                self.assertEqual(response.status_code, status.HTTP_200_OK)
                self.assertEqual(response["X-Content-Type-Options"], "nosniff")
                self.assertIn("no-store", response["Cache-Control"])
                self.assertIn("attachment", response["Content-Disposition"])
                self.assertEqual(b"".join(response.streaming_content), b"%PDF-1.4\nprotected")

                foreign_case = Case.objects.create(
                    title="Foreign document owner",
                    created_by=self.superuser,
                )
                foreign_attachment = CaseAttachment.objects.create(
                    case=foreign_case,
                    file=ContentFile(b"%PDF-1.4\nforeign", name="foreign.pdf"),
                )
                wrong_owner_url = (
                    f"/api/cases/{case.pk}/documents/{foreign_attachment.pk}/download/"
                )
                self.assertEqual(
                    self.client.get(wrong_owner_url).status_code,
                    status.HTTP_404_NOT_FOUND,
                )

                self.client.force_authenticate(user=self.investigator)
                denied_response = self.client.get(download_url)
                self.assertEqual(denied_response.status_code, status.HTTP_404_NOT_FOUND)
        finally:
            shutil.rmtree(media_root, ignore_errors=True)

    def test_create_case_without_accused_or_rfi_allows_hqs_admin(self):
        url = reverse("case-list")
        payload = {
            "description": "HQS case without accused or RFI attachment",
            "offence": "Theft",
            "offence_type": Case.OffenceType.SERVICE,
            "service_offence_severity": Case.ServiceOffenceSeverity.SERIOUS,
            "date_of_offence": "2026-06-28",
            "place_of_offence": "Kahawa Barracks",
            "submitting_unit": str(self.unit.id),
        }

        response = self.client.post(url, payload, format="multipart")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("case_number", response.data)
        self.assertEqual(Case.objects.filter(case_number=response.data["case_number"]).count(), 1)

    def test_create_case_requires_core_fields_but_not_title_accused_or_rfi(self):
        response = self.client.post(reverse("case-list"), {}, format="multipart")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        for field in [
            "offence",
            "offence_type",
            "submitting_unit",
            "date_of_offence",
            "place_of_offence",
            "description",
        ]:
            self.assertIn(field, response.data)
        self.assertNotIn("title", response.data)
        self.assertNotIn("accused_entries", response.data)
        self.assertNotIn("rfi_document", response.data)

    def test_create_case_with_rfi_attachment_requires_rfi_no_and_date(self):
        payload = {
            "description": "Case with RFI file but missing reference metadata",
            "offence": "Theft",
            "offence_type": Case.OffenceType.SERVICE,
            "service_offence_severity": Case.ServiceOffenceSeverity.SERIOUS,
            "date_of_offence": "2026-06-28",
            "place_of_offence": "Kahawa Barracks",
            "submitting_unit": str(self.unit.id),
            "rfi_document": SimpleUploadedFile("rfi.pdf", b"%PDF-1.4\n", content_type="application/pdf"),
        }

        response = self.client.post(reverse("case-list"), payload, format="multipart")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("rfi_no", response.data)
        self.assertIn("rfi_date", response.data)

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
            "title": "HQS multipart create",
            "description": "HQS multipart create",
            "offence": "Theft",
            "offence_type": Case.OffenceType.SERVICE,
            "service_offence_severity": Case.ServiceOffenceSeverity.SERIOUS,
            "date_of_offence": "2026-06-28",
            "place_of_offence": "Embakasi Barracks",
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
                "tasking_no": "TASK/001/2026",
                "tasking_date": timezone.now().isoformat(),
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assert_notification_message(case, "tasked to Special Investigation Battalion")

    def test_tasking_case_requires_tasking_no(self):
        case = Case.objects.create(
            title="Tasking number required",
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

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("tasking_no", response.data)

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
                "closure_basis": Case.ClosureBasis.CANCELLATION_LETTER,
                "action_taken": action_taken,
                "chargesheet": SimpleUploadedFile(
                    "cancellation.pdf",
                    b"%PDF-1.4\n",
                    content_type="application/pdf",
                ),
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assert_notification_message(case, action_taken)

    def test_close_case_requires_closure_basis_and_verdict(self):
        case = Case.objects.create(
            title="Close Validation",
            offence="Theft",
            status=Case.Status.SERVED,
            tasked_battalion=self.special_battalion,
            assigned_to=self.investigator,
            rfi_document="cases/rfi.pdf",
            chargesheet="cases/closure.pdf",
            created_by=self.superuser,
        )
        CaseAttachment.objects.create(
            case=case,
            label="Judgment",
            document_type=CaseAttachment.DocumentType.JUDGMENT,
            file="cases/judgment.pdf",
            uploaded_by=self.superuser,
        )

        response = self.client.patch(
            reverse("case-detail", args=[case.id]),
            {"status": Case.Status.CLOSED},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("closure_basis", response.data)
        self.assertIn("action_taken", response.data)

    def test_part_ii_orders_close_requires_serial_no_and_date(self):
        case = Case.objects.create(
            title="Part II Validation",
            offence="Theft",
            status=Case.Status.SERVED,
            tasked_battalion=self.special_battalion,
            assigned_to=self.investigator,
            rfi_document="cases/rfi.pdf",
            created_by=self.superuser,
        )
        CaseAttachment.objects.create(
            case=case,
            label="Judgment",
            document_type=CaseAttachment.DocumentType.JUDGMENT,
            file="cases/judgment.pdf",
            uploaded_by=self.superuser,
        )

        response = self.client.patch(
            reverse("case-detail", args=[case.id]),
            {
                "status": Case.Status.CLOSED,
                "closure_basis": Case.ClosureBasis.PART_II_ORDERS,
                "action_taken": "Convicted and punished.",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("part_ii_order_serial_no", response.data)
        self.assertIn("part_ii_order_date", response.data)

    def test_cancellation_letter_close_requires_pdf(self):
        case = Case.objects.create(
            title="Cancellation Close",
            offence="Theft",
            status=Case.Status.SERVED,
            tasked_battalion=self.special_battalion,
            assigned_to=self.investigator,
            rfi_document="cases/rfi.pdf",
            created_by=self.superuser,
        )
        CaseAttachment.objects.create(
            case=case,
            label="Judgment",
            document_type=CaseAttachment.DocumentType.JUDGMENT,
            file="cases/judgment.pdf",
            uploaded_by=self.superuser,
        )

        response = self.client.patch(
            reverse("case-detail", args=[case.id]),
            {
                "status": Case.Status.CLOSED,
                "closure_basis": Case.ClosureBasis.CANCELLATION_LETTER,
                "action_taken": "Cancelled by competent authority.",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("chargesheet", response.data)

    def test_cancellation_letter_close_requires_new_pdf_even_if_previous_file_exists(self):
        case = Case.objects.create(
            title="Cancellation Close Existing File",
            offence="Theft",
            status=Case.Status.SERVED,
            tasked_battalion=self.special_battalion,
            assigned_to=self.investigator,
            rfi_document="cases/rfi.pdf",
            chargesheet="cases/old-closure.pdf",
            created_by=self.superuser,
        )
        CaseAttachment.objects.create(
            case=case,
            label="Judgment",
            document_type=CaseAttachment.DocumentType.JUDGMENT,
            file="cases/judgment.pdf",
            uploaded_by=self.superuser,
        )

        response = self.client.patch(
            reverse("case-detail", args=[case.id]),
            {
                "status": Case.Status.CLOSED,
                "closure_basis": Case.ClosureBasis.CANCELLATION_LETTER,
                "action_taken": "Cancelled by competent authority.",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("chargesheet", response.data)

    def test_part_ii_orders_close_does_not_require_pdf(self):
        case = Case.objects.create(
            title="Part II Close",
            offence="Theft",
            status=Case.Status.SERVED,
            tasked_battalion=self.special_battalion,
            assigned_to=self.investigator,
            rfi_document="cases/rfi.pdf",
            created_by=self.superuser,
        )
        CaseAttachment.objects.create(
            case=case,
            label="Judgment",
            document_type=CaseAttachment.DocumentType.JUDGMENT,
            file="cases/judgment.pdf",
            uploaded_by=self.superuser,
        )

        response = self.client.patch(
            reverse("case-detail", args=[case.id]),
            {
                "status": Case.Status.CLOSED,
                "closure_basis": Case.ClosureBasis.PART_II_ORDERS,
                "part_ii_order_serial_no": "P2/001/2026",
                "part_ii_order_date": "2026-09-02",
                "action_taken": "Convicted and sentenced.",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_part_ii_orders_close_does_not_require_rfi_or_judgment_files(self):
        case = Case.objects.create(
            title="Part II Close Without RFI",
            offence="Theft",
            status=Case.Status.SERVED,
            tasked_battalion=self.special_battalion,
            assigned_to=self.investigator,
            created_by=self.superuser,
        )

        response = self.client.patch(
            reverse("case-detail", args=[case.id]),
            {
                "status": Case.Status.CLOSED,
                "closure_basis": Case.ClosureBasis.PART_II_ORDERS,
                "part_ii_order_serial_no": "P2/002/2026",
                "part_ii_order_date": "2026-09-02",
                "action_taken": "Convicted and sentenced.",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_close_rta_requires_traffic_accident_report(self):
        case = Case.objects.create(
            title="RTA Report Required",
            offence="Road Traffic Accident",
            case_type=Case.CaseType.RTA,
            status=Case.Status.SERVED,
            tasked_battalion=self.special_battalion,
            assigned_to=self.investigator,
            created_by=self.superuser,
        )

        response = self.client.patch(
            reverse("case-detail", args=[case.id]),
            {
                "status": Case.Status.CLOSED,
                "action_taken": "Reviewed and closed.",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("traffic_accident_report", response.data)

    def test_close_rta_without_damage_does_not_require_authority(self):
        case = Case.objects.create(
            title="RTA No Damage",
            offence="Road Traffic Accident",
            case_type=Case.CaseType.RTA,
            status=Case.Status.SERVED,
            tasked_battalion=self.special_battalion,
            assigned_to=self.investigator,
            traffic_accident_report="cases/traffic-report.pdf",
            rta_service_vehicle_damaged=False,
            created_by=self.superuser,
        )

        response = self.client.patch(
            reverse("case-detail", args=[case.id]),
            {
                "status": Case.Status.CLOSED,
                "action_taken": "Traffic Accident Report reviewed. No service vehicle damage.",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_close_damaged_rta_requires_authority_source_and_pdf(self):
        case = Case.objects.create(
            title="RTA Damage",
            offence="Road Traffic Accident",
            case_type=Case.CaseType.RTA,
            status=Case.Status.SERVED,
            tasked_battalion=self.special_battalion,
            assigned_to=self.investigator,
            traffic_accident_report="cases/traffic-report.pdf",
            rta_service_vehicle_damaged=True,
            created_by=self.superuser,
        )

        response = self.client.patch(
            reverse("case-detail", args=[case.id]),
            {
                "status": Case.Status.CLOSED,
                "action_taken": "Damage case reviewed.",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("rta_damage_authority_source", response.data)
        self.assertIn("rta_damage_authority", response.data)

    def test_close_damaged_rta_with_authority_succeeds(self):
        case = Case.objects.create(
            title="RTA Damage With Authority",
            offence="Road Traffic Accident",
            case_type=Case.CaseType.RTA,
            status=Case.Status.SERVED,
            tasked_battalion=self.special_battalion,
            assigned_to=self.investigator,
            traffic_accident_report="cases/traffic-report.pdf",
            rta_service_vehicle_damaged=True,
            created_by=self.superuser,
        )

        response = self.client.patch(
            reverse("case-detail", args=[case.id]),
            {
                "status": Case.Status.CLOSED,
                "action_taken": "Authority reviewed and case closed.",
                "rta_damage_authority_source": Case.RtaDamageAuthoritySource.HQ_KA_MOVES,
                "rta_damage_authority": SimpleUploadedFile(
                    "authority.pdf",
                    b"%PDF-1.4\n",
                    content_type="application/pdf",
                ),
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_upload_rta_report_marks_case_served_and_requests_close(self):
        case = Case.objects.create(
            title="RTA Upload Report",
            offence="Road Traffic Accident",
            case_type=Case.CaseType.RTA,
            status=Case.Status.UNDER_INVESTIGATION,
            tasked_battalion=self.special_battalion,
            assigned_to=self.investigator,
            created_by=self.superuser,
        )

        response = self.client.patch(
            reverse("case-detail", args=[case.id]),
            {
                "traffic_accident_report": SimpleUploadedFile(
                    "traffic-report.pdf",
                    b"%PDF-1.4\n",
                    content_type="application/pdf",
                ),
                "rta_service_vehicle_damaged": "false",
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        case.refresh_from_db()
        self.assertEqual(case.status, Case.Status.SERVED)
        self.assertTrue(case.close_requested)

    def test_upload_rta_report_requires_io_or_team_assignment(self):
        case = Case.objects.create(
            title="RTA Unassigned Report",
            offence="Road Traffic Accident",
            case_type=Case.CaseType.RTA,
            status=Case.Status.UNDER_INVESTIGATION,
            tasked_battalion=self.special_battalion,
            created_by=self.superuser,
        )
        self.client.force_authenticate(user=self.special_admin)

        response = self.client.patch(
            reverse("case-detail", args=[case.id]),
            {
                "traffic_accident_report": SimpleUploadedFile(
                    "traffic-report.pdf",
                    b"%PDF-1.4\n",
                    content_type="application/pdf",
                ),
                "rta_service_vehicle_damaged": "false",
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("traffic_accident_report", response.data)

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

    def test_protected_file_streams_case_media_for_authorized_user(self):
        media_root = tempfile.mkdtemp()
        self.addCleanup(lambda: shutil.rmtree(media_root, ignore_errors=True))
        with override_settings(MEDIA_ROOT=media_root):
            case = Case.objects.create(
                title="Protected Tasking Letter",
                offence="Theft",
                status=Case.Status.TASKED,
                tasking_letter=SimpleUploadedFile(
                    "tasking.pdf",
                    b"%PDF-1.4\nprotected-tasking\n",
                    content_type="application/pdf",
                ),
                created_by=self.superuser,
            )

            response = self.client.get(
                reverse("case-protected-file"),
                {"path": f"/media/{case.tasking_letter.name}"},
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertIn(b"protected-tasking", b"".join(response.streaming_content))

    def test_protected_file_hides_case_media_from_unauthorized_user(self):
        media_root = tempfile.mkdtemp()
        self.addCleanup(lambda: shutil.rmtree(media_root, ignore_errors=True))
        with override_settings(MEDIA_ROOT=media_root):
            case = Case.objects.create(
                title="Hidden Tasking Letter",
                offence="Theft",
                status=Case.Status.TASKED,
                tasking_letter=SimpleUploadedFile(
                    "hidden-tasking.pdf",
                    b"%PDF-1.4\nhidden-tasking\n",
                    content_type="application/pdf",
                ),
                created_by=self.superuser,
            )
            path = f"/media/{case.tasking_letter.name}"

            self.client.force_authenticate(user=self.investigator)
            response = self.client.get(reverse("case-protected-file"), {"path": path})

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class CaseNumberSequenceTests(TestCase):
    def test_case_numbers_increment_from_the_locked_yearly_sequence(self):
        year = timezone.now().year
        CaseNumberSequence.objects.create(year=year, last_number=40)

        first_case = Case.objects.create(title="First generated case")
        second_case = Case.objects.create(title="Second generated case")

        self.assertEqual(first_case.case_number, f"CASE/{year}/0041")
        self.assertEqual(second_case.case_number, f"CASE/{year}/0042")
        self.assertEqual(
            CaseNumberSequence.objects.get(year=year).last_number,
            42,
        )
