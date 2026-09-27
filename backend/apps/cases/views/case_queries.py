from ._shared import *


class CaseQueriesMixin:

    def _apply_case_type_filter(self, queryset):
        case_type = str(self.request.query_params.get("case_type") or "").strip().lower()
        if case_type != "rta":
            return queryset
        return self._rta_case_queryset(queryset)

    def _prepare_case_queryset(self, queryset):
        return self._apply_case_query_filters(self._apply_case_type_filter(queryset)).distinct()

    def _apply_case_query_filters(self, queryset):
        params = self.request.query_params
        accused_unit = params.get("accused_unit")
        if accused_unit:
            queryset = queryset.filter(
                Q(accused_unit_id=accused_unit)
                | Q(accused_entries__unit_id=accused_unit)
            )

        accused_service = params.get("accused_service")
        if accused_service:
            queryset = queryset.filter(
                Q(accused_service=accused_service)
                | Q(accused_entries__service=accused_service)
            )

        place = str(params.get("place_of_offence") or "").strip()
        if place:
            queryset = queryset.filter(
                Q(place_of_offence__iexact=place)
                | Q(source_incident__location__iexact=place)
            )

        offence = str(params.get("offence") or "").strip()
        if offence:
            queryset = queryset.filter(
                Q(offence__iexact=offence)
                | Q(offence_ref__name__iexact=offence)
                | Q(source_incident__incident_type__iexact=offence)
            )

        date_from = self._parse_case_list_date("date_from") or self._parse_case_list_date("created_from")
        date_to = self._parse_case_list_date("date_to") or self._parse_case_list_date("created_to")
        if date_from or date_to:
            queryset = queryset.filter(self._case_date_range_q(date_from, date_to))

        return queryset

    def _parse_case_list_date(self, name):
        value = self.request.query_params.get(name)
        if not value:
            return None
        try:
            return date.fromisoformat(str(value))
        except ValueError as exc:
            raise ValidationError({name: "Use YYYY-MM-DD format."}) from exc

    @staticmethod
    def _case_date_range_q(date_from, date_to):
        fields = [
            "date_of_offence",
            "created_at__date",
            "updated_at__date",
            "tasking_date__date",
            "team_assigned_at__date",
            "served_at__date",
            "closed_at__date",
            "mentioning_date",
            "rfi_date",
            "investigation_deadline",
            "source_incident__date_occurred__date",
        ]
        combined = Q()
        for field in fields:
            lookups = {}
            if date_from:
                lookups[f"{field}__gte"] = date_from
            if date_to:
                lookups[f"{field}__lte"] = date_to
            combined |= Q(**lookups)
        return combined

    @staticmethod
    def _rta_case_queryset(queryset):
        return queryset.filter(
            Q(case_type=Case.CaseType.RTA)
            | Q(offence__icontains="road traffic accident")
            | Q(offence_ref__name__icontains="road traffic accident")
            | Q(title__icontains="road traffic accident")
            | Q(source_incident__incident_type__icontains="road traffic accident")
        ).distinct()

    @staticmethod
    def _case_source_incident(case):
        try:
            return case.source_incident
        except Exception:
            return None

    @staticmethod
    def _parse_statistics_date(value, fallback, field_name):
        if not value:
            return fallback
        try:
            return date.fromisoformat(str(value))
        except ValueError as exc:
            raise ValidationError({field_name: "Use YYYY-MM-DD format."}) from exc

    def _rta_case_report_date(self, case):
        if case.date_of_offence:
            return case.date_of_offence
        incident = self._case_source_incident(case)
        if incident and incident.date_occurred:
            return timezone.localtime(incident.date_occurred).date()
        if case.created_at:
            return timezone.localtime(case.created_at).date()
        return None

    def _rta_case_type_key(self, case):
        incident = self._case_source_incident(case)
        text = " ".join(
            str(value or "")
            for value in [
                getattr(incident, "incident_type", ""),
                case.offence,
                getattr(case.offence_ref, "name", ""),
                case.title,
            ]
        ).lower()
        normalized = text.replace("-", " ")
        if "non injury" in normalized or "noninjury" in normalized:
            return "non_injury"
        if "self involved" in normalized:
            return "self_involved"
        if "hit and run" in normalized or "hit run" in normalized:
            return "hit_and_run"
        if "fatal" in normalized:
            return "fatal"
        if "injury" in normalized:
            return "injury"
        return "not_recorded"

    @staticmethod
    def _rta_count_from_text(text, label):
        pattern = rf"{label}\s*(?:\([^)]*\))?\s*:\s*(nil|none|[0-9]+)"
        match = re.search(pattern, str(text or ""), flags=re.IGNORECASE)
        if not match:
            return None
        value = match.group(1).lower()
        if value in {"nil", "none"}:
            return 0
        return int(value)

    def _rta_case_casualty_counts(self, case, type_key):
        incident = self._case_source_incident(case)
        casualties = getattr(incident, "rta_casualties", None) if incident else None
        if isinstance(casualties, list) and casualties:
            xray = sum(1 for casualty in casualties if casualty.get("casualty_status") == "dead")
            return {
                "yankee": max(0, len(casualties) - xray),
                "xray": xray,
            }

        text_parts = [
            getattr(incident, "injuries", "") if incident else "",
            getattr(incident, "description", "") if incident else "",
            case.description,
        ]
        text = "\n".join(str(part or "") for part in text_parts)
        yankee = self._rta_count_from_text(text, "yankee")
        xray = self._rta_count_from_text(text, "zulu")
        if xray is None:
            xray = self._rta_count_from_text(text, "x-ray")

        if yankee is None:
            yankee = 1 if type_key == "injury" else 0
        if xray is None:
            xray = 1 if type_key == "fatal" else 0
        return {"yankee": yankee, "xray": xray}
