from ._shared import *
from django.db.models import Case as ConditionalCase, CharField, Q, Value, When
from django.db.models.functions import Coalesce, Concat, Lower, Replace


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

        if getattr(self, "action", None) != "rta_statistics":
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
    def _parse_statistics_date(value, fallback, field_name):
        if not value:
            return fallback
        try:
            return date.fromisoformat(str(value))
        except ValueError as exc:
            raise ValidationError({field_name: "Use YYYY-MM-DD format."}) from exc

    @staticmethod
    def _rta_classification_expression():
        empty_text = Value("", output_field=CharField())
        text = Concat(
            Coalesce("source_incident__incident_type", empty_text, output_field=CharField()),
            Value(" "),
            Coalesce("offence", empty_text, output_field=CharField()),
            Value(" "),
            Coalesce("offence_ref__name", empty_text, output_field=CharField()),
            Value(" "),
            Coalesce("title", empty_text, output_field=CharField()),
            output_field=CharField(),
        )
        return Lower(Replace(text, Value("-"), Value(" ")))

    @staticmethod
    def _rta_type_key_expression():
        return ConditionalCase(
            When(
                Q(_rta_classification__icontains="non injury")
                | Q(_rta_classification__icontains="noninjury"),
                then=Value("non_injury"),
            ),
            When(
                _rta_classification__icontains="self involved",
                then=Value("self_involved"),
            ),
            When(
                Q(_rta_classification__icontains="hit and run")
                | Q(_rta_classification__icontains="hit run"),
                then=Value("hit_and_run"),
            ),
            When(_rta_classification__icontains="fatal", then=Value("fatal")),
            When(_rta_classification__icontains="injury", then=Value("injury")),
            default=Value("not_recorded"),
            output_field=CharField(),
        )

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

    def _rta_case_casualty_counts(
        self, type_key, casualties, incident_injuries, incident_description, case_description
    ):
        if isinstance(casualties, list) and casualties:
            xray = sum(1 for casualty in casualties if casualty.get("casualty_status") == "dead")
            return {
                "yankee": max(0, len(casualties) - xray),
                "xray": xray,
            }

        text_parts = [
            incident_injuries,
            incident_description,
            case_description,
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
