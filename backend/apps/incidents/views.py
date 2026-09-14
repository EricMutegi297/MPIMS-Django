from datetime import date, timedelta

from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from apps.cases.models import Case, CaseActivityLog
from apps.cases.serializers import CaseSerializer
from .models import Incident
from .serializers import IncidentSerializer
from apps.users.access import command_read_only_message, is_hqs_admin, should_block_command_write
from apps.users.models import User


class IncidentViewSet(viewsets.ModelViewSet):
    queryset = Incident.objects.all()
    serializer_class = IncidentSerializer
    filterset_fields = ["status", "severity", "unit", "battalion", "is_belated"]
    search_fields = [
        "incident_number",
        "incident_type",
        "location",
        "service_vehicle",
        "service_member",
        "civilian",
        "unit_involved",
        "originating_unit",
        "police_ob_reference",
        "unit__name",
        "unit__code",
        "battalion__name",
    ]
    ordering_fields = ["incident_number", "date_occurred", "created_at", "updated_at", "status", "severity"]
    ordering = ["-date_occurred"]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if should_block_command_write(request.user, request.method):
            raise PermissionDenied(command_read_only_message(request.user))

    def get_queryset(self):
        qs = Incident.objects.select_related(
            "reported_by",
            "unit",
            "battalion",
            "morning_brief",
            "source_ob_entry",
            "source_ob_entry__book",
        ).all()
        user = self.request.user
        if not user or not user.is_authenticated:
            return qs.none()
        scoped = qs

        kind = str(self.request.query_params.get("kind") or "").strip().lower()
        if kind == "rta":
            scoped = scoped.filter(incident_type__icontains="road traffic accident")
        elif kind == "incident":
            scoped = scoped.exclude(incident_type__icontains="road traffic accident")

        date_from = self._parse_date_param("date_from")
        date_to = self._parse_date_param("date_to")
        if date_from:
            scoped = scoped.filter(date_occurred__date__gte=date_from)
        if date_to:
            scoped = scoped.filter(date_occurred__date__lte=date_to)

        requires_investigation = str(self.request.query_params.get("requires_investigation", "")).lower()
        if requires_investigation in {"1", "true", "yes"}:
            scoped = scoped.filter(source_ob_entry__requires_investigation=True)
        elif requires_investigation in {"0", "false", "no"}:
            scoped = scoped.exclude(source_ob_entry__requires_investigation=True)

        pending_morning_brief = str(self.request.query_params.get("pending_morning_brief", "")).lower()
        if pending_morning_brief in {"1", "true", "yes"}:
            scoped = scoped.filter(morning_brief__isnull=True)
        elif pending_morning_brief in {"0", "false", "no"}:
            scoped = scoped.filter(morning_brief__isnull=False)

        return scoped

    def perform_create(self, serializer):
        if not self._can_manage_incidents(self.request.user):
            raise PermissionDenied("Only Superuser or HQ Admin can add new incidents.")
        obj = serializer.save(reported_by=self.request.user)
        # Mark belated if reported more than 24h after occurrence
        if obj.date_occurred and (timezone.now() - obj.date_occurred) > timedelta(hours=24):
            obj.is_belated = True
            obj.save(update_fields=["is_belated"])

    def perform_update(self, serializer):
        if not self._can_manage_incidents(self.request.user):
            raise PermissionDenied("Only Superuser or HQ Admin can edit incidents.")
        serializer.save()

    def perform_destroy(self, instance):
        if not self._can_manage_incidents(self.request.user):
            raise PermissionDenied("Only Superuser or HQ Admin can delete incidents.")
        instance.delete()

    @action(detail=True, methods=["post"], url_path="convert-to-case")
    def convert_to_case(self, request, pk=None):
        incident = self.get_object()
        if not self._can_convert_to_case(request.user):
            raise PermissionDenied("Only Admin HQ can convert morning-brief incidents to cases.")
        if incident.converted_case_id:
            raise ValidationError({"detail": "This incident has already been converted to a case."})
        if request.data.get("tasked_battalion"):
            raise ValidationError({
                "tasked_battalion": "Convert the incident to a case first. Task the battalion from the case module after conversion."
            })

        payload = self._case_payload_from_incident(request.data, incident)
        errors = self._validate_case_conversion_payload(payload)
        if errors:
            raise ValidationError(errors)

        serializer = CaseSerializer(data=payload, context={"request": request})
        serializer.is_valid(raise_exception=True)
        case = serializer.save(
            created_by=request.user,
            status=Case.Status.NEW,
            tasked_battalion=None,
            tasking_date=None,
        )
        CaseActivityLog.objects.create(
            case=case,
            actor=request.user,
            action=CaseActivityLog.Action.CASE_CREATED,
            detail=f"Converted from morning brief incident {incident.incident_number}",
        )
        incident.converted_case = case
        incident.status = Incident.Status.UNDER_INVESTIGATION
        incident.save(update_fields=["converted_case", "status", "updated_at"])
        return Response(IncidentSerializer(incident, context={"request": request}).data)

    def _case_payload_from_incident(self, data, incident):
        def first_value(key, fallback=""):
            value = data.get(key, fallback)
            if isinstance(value, list):
                value = value[0] if value else fallback
            return value if value not in {None, ""} else fallback

        occurred_on = ""
        if incident.date_occurred:
            occurred_on = timezone.localtime(incident.date_occurred).date().isoformat()

        def truthy_value(value):
            if isinstance(value, bool):
                return value
            text = str(value or "").strip().lower()
            if text in {"1", "true", "yes", "y", "on"}:
                return True
            if text in {"0", "false", "no", "n", "off", ""}:
                return False
            return True

        damage_default = bool(str(incident.damages or "").strip())

        payload = {
            "title": first_value("title", incident.incident_type or ""),
            "case_type": first_value(
                "case_type",
                Case.CaseType.RTA
                if "road traffic accident" in str(incident.incident_type or "").lower()
                else Case.CaseType.INCIDENT,
            ),
            "description": first_value("description", incident.history or incident.description or ""),
            "offence": first_value("offence", incident.incident_type or ""),
            "offence_type": first_value("offence_type"),
            "service_offence_severity": first_value("service_offence_severity"),
            "criminal_offence_type": first_value("criminal_offence_type"),
            "date_of_offence": first_value("date_of_offence", occurred_on),
            "place_of_offence": first_value("place_of_offence", incident.location or ""),
            "submitting_unit": first_value("submitting_unit"),
            "police_station": first_value("police_station", incident.police_ob_reference or ""),
            "accused_name": first_value("accused_name"),
            "accused_rank": first_value("accused_rank"),
            "accused_service_number": first_value("accused_service_number"),
            "accused_service": first_value("accused_service"),
            "rta_service_vehicle_damaged": truthy_value(first_value("rta_service_vehicle_damaged", damage_default)),
            "status": Case.Status.NEW,
        }
        if data.get("offence_ref"):
            payload["offence_ref"] = data.get("offence_ref")
        accused_entries = data.get("accused_entries")
        if accused_entries:
            payload["accused_entries"] = accused_entries
        if payload.get("criminal_offence_type") != Case.CriminalOffenceType.DCI_CIV:
            payload.pop("police_station", None)
        for optional_field in ["submitting_unit", "police_station", "service_offence_severity", "criminal_offence_type"]:
            if not payload.get(optional_field):
                payload.pop(optional_field, None)
        return payload

    def _validate_case_conversion_payload(self, payload):
        errors = {}
        required_text_fields = {
            "title": "Case title is required.",
            "description": "Description is required.",
            "date_of_offence": "Date of offence is required.",
            "place_of_offence": "Place of offence is required.",
        }
        for field, message in required_text_fields.items():
            if not str(payload.get(field) or "").strip():
                errors[field] = message

        if not str(payload.get("offence") or "").strip() and not payload.get("offence_ref"):
            errors["offence"] = "Offence is required."

        is_rta_case = (
            payload.get("case_type") == Case.CaseType.RTA
            or "road traffic accident" in str(payload.get("offence") or "").lower()
            or "road traffic accident" in str(payload.get("title") or "").lower()
        )
        if not is_rta_case:
            offence_type = payload.get("offence_type")
            if offence_type not in {Case.OffenceType.SERVICE, Case.OffenceType.CRIMINAL}:
                errors["offence_type"] = "Select whether this is a service offence or criminal offence."
            elif offence_type == Case.OffenceType.SERVICE and not payload.get("service_offence_severity"):
                errors["service_offence_severity"] = "Select service offence severity."
            elif offence_type == Case.OffenceType.CRIMINAL:
                criminal_offence_type = payload.get("criminal_offence_type")
                if not criminal_offence_type:
                    errors["criminal_offence_type"] = "Select criminal offence type."
                elif (
                    criminal_offence_type == Case.CriminalOffenceType.DCI_CIV
                    and not str(payload.get("police_station") or "").strip()
                ):
                    errors["police_station"] = "Police Station / OB Ref is required for DCI / Civ Police cases."

        return errors

    def _can_convert_to_case(self, user):
        if user.is_superuser:
            return True
        if user.role == User.Role.MPC_HQS:
            return True
        return user.role == User.Role.ADMIN and getattr(user.battalion, "battalion_type", "") == "hqs"

    def _can_manage_incidents(self, user):
        return bool(user and user.is_authenticated and (user.is_superuser or is_hqs_admin(user)))

    def _parse_date_param(self, name):
        value = self.request.query_params.get(name)
        if not value:
            return None
        try:
            return date.fromisoformat(str(value))
        except ValueError as exc:
            raise ValidationError({name: "Use YYYY-MM-DD format."}) from exc
