import json
from collections.abc import Mapping
from django.utils import timezone
from rest_framework import serializers
from ..models import Case, CaseCourtMartialMilestone
from apps.formations.models import Battalion
from apps.users.access import (
    is_hqs_admin,
    is_battalion_admin,
    is_company_command,
    is_detachment_ic,
    is_scoped_to_company,
    user_company_id,
)
from apps.users.models import User

from .constants import CASE_FILE_FIELDS, CLOSED_CASE_FILE_ERROR


class CaseValidationMixin:

    def __init__(self, *args, **kwargs):
        data = kwargs.get("data")
        if isinstance(data, Mapping):
            normalized = {}
            if hasattr(data, "lists"):
                for key, values in data.lists():
                    normalized[key] = values[0] if len(values) == 1 else values
            else:
                for key, value in data.items():
                    normalized[key] = value[0] if isinstance(value, list) and len(value) == 1 else value
            kwargs["data"] = normalized
        super().__init__(*args, **kwargs)

    def to_internal_value(self, data):
        if isinstance(data, Mapping):
            accused_entries = data.get("accused_entries")
            if isinstance(accused_entries, str):
                try:
                    data = dict(data)
                    data["accused_entries"] = json.loads(accused_entries)
                except (ValueError, TypeError):
                    raise serializers.ValidationError({"accused_entries": "Invalid JSON format."})
        return super().to_internal_value(data)

    @staticmethod
    def _resolved_offence_text(raw_offence, offence_ref):
        if offence_ref and getattr(offence_ref, "name", None):
            return offence_ref.name.strip()
        offence_text = (raw_offence or "").strip()
        if offence_text:
            return offence_text
        return ""

    @staticmethod
    def _user_battalion_id(user):
        if not user:
            return None
        return getattr(user, "battalion_id", None) or getattr(
            getattr(user, "detachment", None),
            "battalion_id",
            None,
        )

    @staticmethod
    def _team_battalion_id(team):
        if not team:
            return None
        return getattr(team, "battalion_id", None) or getattr(
            getattr(team, "detachment", None),
            "battalion_id",
            None,
        )

    def _validate_assignment_scope(self, assigned_team, assigned_to, tasked_battalion, tasked_company, tasked_detachment):
        errors = {}

        if assigned_team:
            if tasked_detachment and assigned_team.detachment_id != tasked_detachment.id:
                errors["assigned_team"] = "Selected team must belong to the tasked detachment."
            elif tasked_company and assigned_team.detachment_id and assigned_team.detachment.company_id != tasked_company.id:
                errors["assigned_team"] = "Selected team must belong to the tasked company."
            elif tasked_battalion and self._team_battalion_id(assigned_team) != tasked_battalion.id:
                errors["assigned_team"] = "Selected team must belong to the tasked battalion."

        if assigned_to:
            if assigned_to.role != User.Role.INVESTIGATOR:
                errors["assigned_to"] = "Select an active investigator as the IO."
            elif tasked_detachment and assigned_to.detachment_id != tasked_detachment.id:
                errors["assigned_to"] = "Selected IO must belong to the tasked detachment."
            elif tasked_company and assigned_to.detachment_id and assigned_to.detachment.company_id != tasked_company.id:
                errors["assigned_to"] = "Selected IO must belong to the tasked company."
            elif tasked_battalion and self._user_battalion_id(assigned_to) != tasked_battalion.id:
                errors["assigned_to"] = "Selected IO must belong to the tasked battalion."

        if errors:
            raise serializers.ValidationError(errors)

    @staticmethod
    def _source_incident(obj):
        try:
            return obj.source_incident
        except Exception:
            return None

    @staticmethod
    def _blank(value):
        return not str(value or "").strip()

    @staticmethod
    def _file_name(file_obj):
        return str(getattr(file_obj, "name", "") or file_obj or "")

    def _validate_pdf_upload(self, errors, field_name, file_obj, label):
        if not file_obj:
            return
        if not self._file_name(file_obj).lower().endswith(".pdf"):
            errors[field_name] = f"{label} must be uploaded as a PDF."

    def _is_hqs_user(self, user):
        return bool(user and user.is_authenticated and (user.is_superuser or is_hqs_admin(user)))

    def _can_upload_rta_report(self, user, case):
        if self._is_hqs_user(user):
            return True
        if not user or not user.is_authenticated or not case:
            return False
        if (
            is_detachment_ic(user)
            and user.detachment_id
            and user.detachment_id == case.tasked_detachment_id
        ):
            return True
        if (
            user.role == User.Role.ADMIN
            and user.battalion_id
            and user.battalion_id == case.tasked_battalion_id
            and getattr(user.battalion, "battalion_type", None) == Battalion.BattalionType.SPECIAL
        ):
            return True
        return False

    def _can_mark_served(self, user, case):
        if self._is_hqs_user(user):
            return True
        if not user or not user.is_authenticated or not case:
            return False
        if is_detachment_ic(user) and user.detachment_id:
            return user.detachment_id == case.tasked_detachment_id
        if user.role == User.Role.IC_CASES and user.detachment_id:
            return user.detachment_id == case.tasked_detachment_id
        if user.role in {User.Role.CO, User.Role.OC, User.Role.ADJ, User.Role.TWO_IC, User.Role.COMMANDANT}:
            return bool(
                user.detachment_id
                and user.detachment_id == case.tasked_detachment_id
            )
        if user.role == User.Role.ADMIN:
            return bool(
                user.battalion_id
                and user.battalion_id == case.tasked_battalion_id
                and getattr(user.battalion, "battalion_type", None) == Battalion.BattalionType.SPECIAL
            )
        return False

    @staticmethod
    def _case_has_investigation_assignment(case):
        return bool(
            case
            and (
                getattr(case, "assigned_to_id", None)
                or getattr(case, "assigned_team_id", None)
            )
        )

    def _is_rta_case(self, attrs, instance, offence_ref=None, offence_text=""):
        case_type = attrs.get("case_type", getattr(instance, "case_type", ""))
        if case_type == Case.CaseType.RTA:
            return True

        source_incident_type = ""
        if instance:
            try:
                source_incident_type = instance.source_incident.incident_type
            except Exception:
                source_incident_type = ""

        values = [
            offence_text,
            attrs.get("offence"),
            getattr(offence_ref, "name", ""),
            getattr(attrs.get("offence_ref"), "name", ""),
            attrs.get("title"),
            getattr(instance, "offence", ""),
            getattr(getattr(instance, "offence_ref", None), "name", ""),
            getattr(instance, "title", ""),
            source_incident_type,
        ]
        return any("road traffic accident" in str(value or "").lower() for value in values)

    def _validate_required_create_fields(self, attrs):
        errors = {}
        is_rta_case = self._is_rta_case(
            attrs,
            None,
            attrs.get("offence_ref"),
            attrs.get("offence", ""),
        )

        if not attrs.get("offence_ref") and self._blank(attrs.get("offence")):
            errors["offence"] = "Offence is required."
        if not is_rta_case:
            if not attrs.get("offence_type"):
                errors["offence_type"] = "Offence type is required."
            if attrs.get("offence_type") == Case.OffenceType.SERVICE and not attrs.get("service_offence_severity"):
                errors["service_offence_severity"] = "Severity is required for service offences."
            if attrs.get("offence_type") == Case.OffenceType.CRIMINAL and not attrs.get("criminal_offence_type"):
                errors["criminal_offence_type"] = "Criminal offence type is required."
            if not attrs.get("submitting_unit"):
                errors["submitting_unit"] = "Submitting unit is required."
        if not attrs.get("date_of_offence"):
            errors["date_of_offence"] = "Date of offence is required."
        if self._blank(attrs.get("place_of_offence")):
            errors["place_of_offence"] = "Place of offence is required."
        if self._blank(attrs.get("description")):
            errors["description"] = "Description is required."

        accused_entries = attrs.get("accused_entries") or []
        entry_errors = []
        for item in accused_entries:
            missing = []
            if self._blank(item.get("name")):
                missing.append("name")
            if self._blank(item.get("rank")):
                missing.append("rank")
            if self._blank(item.get("service_number")):
                missing.append("service number")
            if self._blank(item.get("service")):
                missing.append("service")
            if not item.get("unit"):
                missing.append("unit")
            if missing:
                entry_errors.append(f"Accused entry requires {', '.join(missing)}.")
        if entry_errors:
            errors["accused_entries"] = entry_errors

        if errors:
            raise serializers.ValidationError(errors)

    def validate(self, attrs):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        instance = getattr(self, "instance", None)

        tasked_battalion = attrs.get(
            "tasked_battalion",
            getattr(instance, "tasked_battalion", None),
        )
        tasked_company = attrs.get(
            "tasked_company",
            getattr(instance, "tasked_company", None),
        )
        tasking_letter = attrs.get(
            "tasking_letter",
            getattr(instance, "tasking_letter", None),
        )
        tasking_date = attrs.get(
            "tasking_date",
            getattr(instance, "tasking_date", None),
        )
        tasking_no = attrs.get(
            "tasking_no",
            getattr(instance, "tasking_no", ""),
        )
        tasked_detachment = attrs.get(
            "tasked_detachment",
            getattr(instance, "tasked_detachment", None),
        )
        assigned_team_in_payload = "assigned_team" in attrs
        assigned_to_in_payload = "assigned_to" in attrs
        assigned_team = attrs.get(
            "assigned_team",
            getattr(instance, "assigned_team", None),
        )
        assigned_to = attrs.get(
            "assigned_to",
            getattr(instance, "assigned_to", None),
        )
        close_requested_in_payload = "close_requested" in attrs
        close_requested = attrs.get(
            "close_requested",
            getattr(instance, "close_requested", False),
        )
        offence_ref = attrs.get(
            "offence_ref",
            getattr(instance, "offence_ref", None),
        )
        offence_text = attrs.get(
            "offence",
            getattr(instance, "offence", ""),
        )
        criminal_offence_type = attrs.get(
            "criminal_offence_type",
            getattr(instance, "criminal_offence_type", ""),
        )
        status_in_payload = "status" in attrs
        target_status = attrs.get("status", getattr(instance, "status", None))
        prev_status = getattr(instance, "status", None)
        mentioning_date = attrs.get("mentioning_date", getattr(instance, "mentioning_date", None))
        mentioning_remarks = attrs.get("mentioning_remarks", getattr(instance, "mentioning_remarks", ""))
        rfi_document = attrs.get("rfi_document", getattr(instance, "rfi_document", None))
        rfi_no = attrs.get("rfi_no", getattr(instance, "rfi_no", ""))
        rfi_date = attrs.get("rfi_date", getattr(instance, "rfi_date", None))
        closure_basis = attrs.get("closure_basis", getattr(instance, "closure_basis", ""))
        part_ii_order_serial_no = attrs.get(
            "part_ii_order_serial_no",
            getattr(instance, "part_ii_order_serial_no", ""),
        )
        part_ii_order_date = attrs.get(
            "part_ii_order_date",
            getattr(instance, "part_ii_order_date", None),
        )
        traffic_accident_report = attrs.get(
            "traffic_accident_report",
            getattr(instance, "traffic_accident_report", None),
        )
        rta_service_vehicle_damaged = attrs.get(
            "rta_service_vehicle_damaged",
            getattr(instance, "rta_service_vehicle_damaged", False),
        )
        rta_damage_authority_source = attrs.get(
            "rta_damage_authority_source",
            getattr(instance, "rta_damage_authority_source", ""),
        )
        rta_damage_authority = attrs.get(
            "rta_damage_authority",
            getattr(instance, "rta_damage_authority", None),
        )
        is_rta_case = self._is_rta_case(attrs, instance, offence_ref, offence_text)
        battalion_task_requested = any(
            field in attrs
            for field in ("tasked_battalion", "tasking_letter", "tasking_date", "tasking_no")
        )

        if instance and instance.status == Case.Status.CLOSED:
            blocked_file_fields = sorted(field for field in CASE_FILE_FIELDS if field in attrs)
            if blocked_file_fields:
                raise serializers.ValidationError({
                    field: CLOSED_CASE_FILE_ERROR for field in blocked_file_fields
                })

        accused_entries = attrs.get("accused_entries")
        if isinstance(accused_entries, str):
            try:
                accused_entries = json.loads(accused_entries)
            except (ValueError, TypeError):
                raise serializers.ValidationError({"accused_entries": "Invalid JSON format."})
            attrs["accused_entries"] = accused_entries

        if accused_entries is not None:
            if not isinstance(accused_entries, list):
                raise serializers.ValidationError({"accused_entries": "Must be a list of accused entries."})
            filtered_entries = []
            for item in accused_entries:
                if not isinstance(item, dict):
                    raise serializers.ValidationError({"accused_entries": "Each accused entry must be an object."})
                if any(
                    str(item.get(field, "") or "").strip()
                    for field in ["name", "rank", "service_number", "service", "unit"]
                ):
                    filtered_entries.append(item)
            attrs["accused_entries"] = filtered_entries

        if self.instance is None:
            # Force status to "new" on creation
            attrs["status"] = Case.Status.NEW
            if not user or not user.is_authenticated:
                raise serializers.ValidationError("Authentication is required.")
            hqs_admin_user = (
                user.role == "admin"
                and user.battalion
                and user.battalion.battalion_type == Battalion.BattalionType.HQS
            )
            if not (user.is_superuser or hqs_admin_user):
                raise serializers.ValidationError(
                    "Only a superuser or HQ battalion admin can create a new case."
                )
            self._validate_required_create_fields(attrs)

        if instance and "rta_service_vehicle_damaged" in attrs and not self._is_hqs_user(user):
            current_damage = bool(getattr(instance, "rta_service_vehicle_damaged", False))
            requested_damage = bool(attrs.get("rta_service_vehicle_damaged"))
            if requested_damage != current_damage:
                raise serializers.ValidationError(
                    {"rta_service_vehicle_damaged": "Only Superuser or HQ Admin can change service vehicle damage status."}
                )
            attrs.pop("rta_service_vehicle_damaged", None)

        if instance and "served_abstract" in attrs:
            if not self._can_mark_served(user, instance):
                raise serializers.ValidationError({"status": "Only IC Cases, IC Det/Det Commander, or Special Battalion Admin can serve a case."})
            abstract = attrs.get("served_abstract")
            if not abstract:
                raise serializers.ValidationError({"served_abstract": "Attach the abstract before serving this case."})
            attrs["status"] = Case.Status.SERVED
            target_status = Case.Status.SERVED
        elif "abstract_acknowledgement_form" in attrs and target_status != Case.Status.SERVED:
            raise serializers.ValidationError({"abstract_acknowledgement_form": "The abstract can only be attached while serving the case."})

        rta_report_fields = {"traffic_accident_report", "rta_service_vehicle_damaged"} & set(attrs)
        if instance and rta_report_fields:
            if not is_rta_case:
                raise serializers.ValidationError(
                    {"traffic_accident_report": "Traffic Accident Report can only be attached to RTA cases."}
                )
            if not self._can_upload_rta_report(user, instance):
                raise serializers.ValidationError(
                    {"traffic_accident_report": "Only IC Cases for the tasked Coy/Det, Special Admin battalion, or HQ Admin can attach the Traffic Accident Report."}
                )
            if "traffic_accident_report" in attrs and attrs.get("traffic_accident_report") and not self._case_has_investigation_assignment(instance):
                raise serializers.ValidationError(
                    {"traffic_accident_report": "Assign this RTA case to an IO or team before uploading the Traffic Accident Report."}
                )

        rta_authority_fields = {"rta_damage_authority", "rta_damage_authority_source"} & set(attrs)
        if instance and rta_authority_fields and not self._is_hqs_user(user):
            raise serializers.ValidationError(
                {"rta_damage_authority": "Only HQ Admin can attach RTA damage authority from HQ KA Moves or Legal."}
            )

        if tasked_battalion and tasked_battalion.battalion_type not in {
            Battalion.BattalionType.SPECIAL,
            Battalion.BattalionType.NORMAL,
        }:
            raise serializers.ValidationError(
                {"tasked_battalion": "Cases can only be tasked to Special or Normal battalions."}
            )

        if tasked_company and tasked_company.battalion_id != getattr(tasked_battalion, "id", getattr(instance, "tasked_battalion_id", None)):
            raise serializers.ValidationError({"tasked_company": "The company must belong to the tasked battalion."})
        if tasked_detachment and tasked_company and tasked_detachment.company_id != tasked_company.id:
            raise serializers.ValidationError({"tasked_detachment": "The detachment must belong to the tasked company."})

        if battalion_task_requested and user and user.is_authenticated:
            if not (user.is_superuser or is_hqs_admin(user)):
                raise serializers.ValidationError({"tasking": "Only HQS Admin can task a case to a battalion."})

        company_task_requested = "tasked_company" in attrs
        detachment_task_requested = "tasked_detachment" in attrs
        if (company_task_requested or detachment_task_requested) and user and user.is_authenticated:
            if user.is_superuser:
                pass
            elif is_battalion_admin(user):
                if user.battalion_id != getattr(tasked_battalion, "id", None):
                    raise serializers.ValidationError({"tasking": "You can only task cases within your battalion."})
            elif is_company_command(user):
                company_id = user.detachment.company_id
                if tasked_company and tasked_company.id != company_id:
                    raise serializers.ValidationError({"tasking": "You can only task cases within your company."})
                if tasked_detachment and tasked_detachment.company_id != company_id:
                    raise serializers.ValidationError({"tasking": "You can only task cases within your company."})
            elif is_detachment_ic(user):
                detachment_company_id = getattr(getattr(user, "detachment", None), "company_id", None)
                if not detachment_company_id:
                    raise serializers.ValidationError({"tasking": "Detachment commanders must belong to a company before tasking a case to a detachment."})
                if tasked_company and tasked_company.id != detachment_company_id:
                    raise serializers.ValidationError({"tasking": "You can only task a case to a detachment within your company."})
                if tasked_detachment and tasked_detachment.company_id != detachment_company_id:
                    raise serializers.ValidationError({"tasking": "You can only task a case to a detachment within your company."})
            else:
                raise serializers.ValidationError({"tasking": "Only a Battalion Admin or Detachment Commander can task a case to a company or detachment."})

        if rfi_document:
            rfi_errors = {}
            if self._blank(rfi_no):
                rfi_errors["rfi_no"] = "RFI REF No is required when an RFI attachment is uploaded."
            if not rfi_date:
                rfi_errors["rfi_date"] = "RFI date is required when an RFI attachment is uploaded."
            if rfi_errors:
                raise serializers.ValidationError(rfi_errors)

        document_errors = {}
        if instance and "served_abstract" in attrs:
            self._validate_pdf_upload(
                document_errors,
                "served_abstract",
                attrs.get("served_abstract"),
                "Abstract",
            )
        if "traffic_accident_report" in attrs:
            self._validate_pdf_upload(
                document_errors,
                "traffic_accident_report",
                attrs.get("traffic_accident_report"),
                "Traffic Accident Report",
            )
        if "rta_damage_authority" in attrs:
            self._validate_pdf_upload(
                document_errors,
                "rta_damage_authority",
                attrs.get("rta_damage_authority"),
                "RTA damage authority",
            )
        if document_errors:
            raise serializers.ValidationError(document_errors)

        if instance and is_rta_case and "traffic_accident_report" in attrs and attrs.get("traffic_accident_report"):
            if target_status in {Case.Status.TASKED, Case.Status.UNDER_INVESTIGATION, Case.Status.PENDING}:
                attrs["status"] = Case.Status.SERVED
                target_status = Case.Status.SERVED
            if not close_requested:
                attrs["close_requested"] = True
                attrs["close_requested_at"] = timezone.now()
                close_requested = True

        tasking_validation_requested = battalion_task_requested or (
            status_in_payload and target_status == Case.Status.TASKED
        )
        if tasking_validation_requested and not tasked_battalion:
            raise serializers.ValidationError(
                {"tasked_battalion": "Select a battalion before completing tasking."}
            )

        if tasking_validation_requested and tasked_battalion and not tasking_letter:
            raise serializers.ValidationError(
                {"tasking_letter": "Attach a tasking letter before completing tasking."}
            )

        if tasking_validation_requested and tasked_battalion and not tasking_date:
            raise serializers.ValidationError(
                {"tasking_date": "Tasking date and time is required when tasking a battalion."}
            )

        if tasking_validation_requested and tasked_battalion and self._blank(tasking_no):
            raise serializers.ValidationError(
                {"tasking_no": "Tasking REF No is required before this case can be tasked."}
            )

        if (
            battalion_task_requested
            and tasked_battalion
            and tasking_letter
            and tasking_date
            and not self._blank(tasking_no)
            and not status_in_payload
            and target_status in {Case.Status.NEW, Case.Status.OPEN}
        ):
            attrs["status"] = Case.Status.TASKED
            target_status = Case.Status.TASKED

        assignment_requested = assigned_team_in_payload or assigned_to_in_payload
        if assigned_team_in_payload and assigned_to_in_payload and assigned_team and assigned_to:
            raise serializers.ValidationError(
                {"assignment": "Assign the case to either one IO or one team, not both."}
            )

        if assigned_team_in_payload and assigned_team:
            attrs["assigned_to"] = None
            assigned_to = None
        elif assigned_to_in_payload and assigned_to:
            attrs["assigned_team"] = None
            assigned_team = None

        if assignment_requested and user and user.is_authenticated:
            can_assign_case = (
                user.is_superuser
                or is_battalion_admin(user)
                or is_company_command(user)
                or is_detachment_ic(user)
                or user.role == User.Role.IC_CASES
            )
            if not can_assign_case:
                raise serializers.ValidationError({"assignment": "You are not allowed to assign cases for investigation."})
            if is_company_command(user):
                company_id = user_company_id(user)
                case_company_id = (
                    tasked_company.id if tasked_company else
                    tasked_detachment.company_id if tasked_detachment else None
                )
                if case_company_id != company_id:
                    raise serializers.ValidationError({"assignment": "You can only assign cases within your company."})
            elif is_detachment_ic(user):
                if not tasked_detachment or user.detachment_id != tasked_detachment.id:
                    raise serializers.ValidationError({"assignment": "Detachment commanders can only assign cases within their own detachment."})
            elif user.role == User.Role.IC_CASES:
                if user.detachment_id:
                    if not tasked_detachment or user.detachment_id != tasked_detachment.id:
                        raise serializers.ValidationError(
                            {"assignment": "Detachment-level IC Cases can only assign cases tasked to their detachment."}
                        )
                elif user.company_id:
                    case_company_id = (
                        tasked_company.id if tasked_company else
                        tasked_detachment.company_id if tasked_detachment else None
                    )
                    if case_company_id != user.company_id:
                        raise serializers.ValidationError(
                            {"assignment": "Company-level IC Cases can only assign cases within their company."}
                        )
                elif user.battalion_id:
                    case_battalion_id = (
                        tasked_battalion.id if tasked_battalion else
                        tasked_detachment.company.battalion_id if tasked_detachment else None
                    )
                    if case_battalion_id != user.battalion_id:
                        raise serializers.ValidationError(
                            {"assignment": "Battalion-level IC Cases can only assign cases within their battalion."}
                        )
                else:
                    raise serializers.ValidationError(
                        {"assignment": "Assign an IC Cases account to a detachment, company, or battalion before assigning cases."}
                    )
            elif is_battalion_admin(user) and tasked_company and tasked_company.battalion_id != user.battalion_id:
                raise serializers.ValidationError({"assignment": "You can only assign cases within your battalion."})
            self._validate_assignment_scope(
                assigned_team,
                assigned_to,
                tasked_battalion,
                tasked_company,
                tasked_detachment,
            )
            if is_company_command(user):
                company_id = user_company_id(user)
                if assigned_team and (
                    not assigned_team.detachment_id
                    or assigned_team.detachment.company_id != company_id
                ):
                    raise serializers.ValidationError(
                        {"assigned_team": "Selected team must belong to your company."}
                    )
                if assigned_to and (
                    not assigned_to.detachment_id
                    or assigned_to.detachment.company_id != company_id
                ):
                    raise serializers.ValidationError(
                        {"assigned_to": "Selected IO must belong to your company."}
                    )
            elif user.role == User.Role.IC_CASES and user.company_id and not user.detachment_id:
                if assigned_team and (
                    not assigned_team.detachment_id
                    or assigned_team.detachment.company_id != user.company_id
                ):
                    raise serializers.ValidationError(
                        {"assigned_team": "Selected team must belong to your company."}
                    )
                if assigned_to and user_company_id(assigned_to) != user.company_id:
                    raise serializers.ValidationError(
                        {"assigned_to": "Selected IO must belong to your company."}
                    )

        is_court_martial = criminal_offence_type == Case.CriminalOffenceType.COURT_MARTIAL
        assignment_target = assigned_team or assigned_to
        if assignment_target and assignment_requested and not attrs.get("team_assigned_at"):
            attrs["team_assigned_at"] = timezone.now()
        if (
            assignment_target
            and assignment_requested
            and not status_in_payload
            and target_status in {Case.Status.NEW, Case.Status.OPEN, Case.Status.TASKED}
        ):
            attrs["status"] = Case.Status.UNDER_INVESTIGATION
            target_status = Case.Status.UNDER_INVESTIGATION
        if (
            assignment_target
            and close_requested_in_payload
            and close_requested
            and not is_court_martial
            and not status_in_payload
            and target_status == Case.Status.TASKED
        ):
            attrs["status"] = Case.Status.UNDER_INVESTIGATION
            target_status = Case.Status.UNDER_INVESTIGATION
        if (
            close_requested_in_payload
            and close_requested
            and instance
            and not getattr(instance, "close_requested", False)
            and not attrs.get("close_requested_at")
        ):
            attrs["close_requested_at"] = timezone.now()

        if target_status == Case.Status.SERVED and not getattr(instance, "served_at", None):
            attrs["served_at"] = timezone.now()

        if target_status == Case.Status.CLOSED:
            if not instance:
                raise serializers.ValidationError(
                    {"status": "Cases can only be closed after creation and service workflow."}
                )

            if is_rta_case:
                rta_errors = {}
                if not self._is_hqs_user(user):
                    rta_errors["status"] = "Only HQ Admin can close Road Traffic Accident cases."
                if not traffic_accident_report:
                    rta_errors["traffic_accident_report"] = "Attach the Traffic Accident Report before closing this RTA case."
                if not str(attrs.get("action_taken") or getattr(instance, "action_taken", "") or "").strip():
                    rta_errors["action_taken"] = "Verdict is required before closing this RTA case."
                if rta_service_vehicle_damaged:
                    if self._blank(rta_damage_authority_source):
                        rta_errors["rta_damage_authority_source"] = "Select whether authority is from HQ KA Moves or Legal."
                    if not rta_damage_authority:
                        rta_errors["rta_damage_authority"] = "Attach authority from HQ KA Moves or Legal before closing a damaged service-vehicle RTA case."
                if rta_errors:
                    raise serializers.ValidationError(rta_errors)
                attrs["case_type"] = Case.CaseType.RTA
                if not attrs.get("closed_at"):
                    attrs["closed_at"] = timezone.now()

                resolved_offence = self._resolved_offence_text(offence_text, offence_ref)
                if resolved_offence:
                    attrs["offence"] = resolved_offence
                return attrs

            closure_errors = {}
            if self._blank(closure_basis):
                closure_errors["closure_basis"] = "Select what this case is being closed with."
            elif closure_basis == Case.ClosureBasis.PART_II_ORDERS:
                if self._blank(part_ii_order_serial_no):
                    closure_errors["part_ii_order_serial_no"] = "Part II Order Serial No is required."
                if not part_ii_order_date:
                    closure_errors["part_ii_order_date"] = "Part II Order Date is required."
            if closure_errors:
                raise serializers.ValidationError(closure_errors)

            if not str(attrs.get("action_taken") or getattr(instance, "action_taken", "") or "").strip():
                raise serializers.ValidationError(
                    {"action_taken": "Verdict is required before closing this case."}
                )

            # For Court Martial cases, require that a Judgment milestone action has been recorded.
            if is_court_martial:
                has_judgment_action = CaseCourtMartialMilestone.objects.filter(
                    case_id=instance.id,
                    milestone_type=CaseCourtMartialMilestone.MilestoneType.JUDGMENT,
                    action_recorded_at__isnull=False,
                ).exists()
                if not has_judgment_action:
                    raise serializers.ValidationError(
                        {"status": "Court Martial cases cannot be closed: record action on a Judgment milestone first."}
                    )

            if (
                closure_basis != Case.ClosureBasis.PART_II_ORDERS
                and not attrs.get("chargesheet")
            ):
                raise serializers.ValidationError(
                    {"chargesheet": "Attach the selected closure PDF before closing this case."}
                )

        # Keep offence text populated from offence reference when free text is not provided.
        resolved_offence = self._resolved_offence_text(offence_text, offence_ref)
        if resolved_offence:
            attrs["offence"] = resolved_offence
        if is_rta_case:
            attrs["case_type"] = Case.CaseType.RTA

        return attrs
