from django.test import RequestFactory, SimpleTestCase
from django.utils import timezone

from .middleware import AuditLogMiddleware
from .models import AuditLog
from .serializers import AuditLogSerializer


class AuditLogImmutabilityTests(SimpleTestCase):
    def test_existing_audit_log_cannot_be_saved_or_deleted(self):
        log = AuditLog(pk=1, action=AuditLog.Action.UPDATE)
        log._state.adding = False

        with self.assertRaisesRegex(PermissionError, "append-only"):
            log.save()
        with self.assertRaisesRegex(PermissionError, "append-only"):
            log.delete()

    def test_queryset_cannot_update_or_delete_audit_logs(self):
        logs = AuditLog.objects.filter(pk=1)

        with self.assertRaisesRegex(PermissionError, "append-only"):
            logs.update(success=False)
        with self.assertRaisesRegex(PermissionError, "append-only"):
            logs.delete()


class AuditLogPrivacyTests(SimpleTestCase):
    def test_sensitive_query_parameters_are_redacted(self):
        request = RequestFactory().get(
            "/api/cases/?service_number=AB1234&search=accused+name&status=open"
        )

        result = AuditLogMiddleware._sanitized_query(request)

        self.assertIn("status=open", result)
        self.assertNotIn("AB1234", result)
        self.assertNotIn("accused", result)

    def test_sensitive_record_changes_are_not_added_to_description(self):
        request = RequestFactory().patch(
            "/api/cases/17/",
            data={
                "status": "closed",
                "case_description": "Sensitive case narrative",
                "investigation_remarks": "Sensitive investigator note",
                "accused_name": "Sensitive person",
                "evidence_details": "Sensitive evidence",
            },
            content_type="application/json",
        )

        details = AuditLogMiddleware._change_details(request, {"status": "open"})

        self.assertEqual(len(details), 1)
        self.assertIn("status changed", details[0])
        for sensitive_value in (
            "Sensitive case narrative",
            "Sensitive investigator note",
            "Sensitive person",
            "Sensitive evidence",
        ):
            self.assertNotIn(sensitive_value, " ".join(details))

    def test_api_masks_service_number_and_omits_legacy_details(self):
        log = AuditLog(
            action=AuditLog.Action.UPDATE,
            module="cases",
            object_id="17",
            service_number="AB1234",
            user_name="AB1234",
            description="Legacy description containing accused identity",
            query_string="search=accused-name",
            created_at=timezone.now(),
        )

        serialized = AuditLogSerializer(log).data

        self.assertEqual(serialized["service_number"], "****34")
        self.assertEqual(serialized["user_name"], "Unknown user")
        self.assertEqual(serialized["description"], "updated Cases #17")
        self.assertEqual(serialized["query_string"], "")
        self.assertNotIn("AB1234", str(serialized))
        self.assertNotIn("accused identity", str(serialized))
        self.assertNotIn("AB1234", str(log))

    def test_description_does_not_repeat_actor_or_file_identity(self):
        request = RequestFactory().post(
            "/api/cases/",
            data={"service_number": "AB1234"},
        )
        request.user = None

        description = AuditLogMiddleware._description(
            {"user_name": "Private Name", "service_number": "AB1234"},
            AuditLog.Action.CREATE,
            "cases",
            request,
            "",
        )

        self.assertEqual(description, "created Cases")
        self.assertNotIn("Private Name", description)
        self.assertNotIn("AB1234", description)
