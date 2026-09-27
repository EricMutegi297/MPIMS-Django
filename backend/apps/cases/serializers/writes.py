from django.utils import timezone
from rest_framework import serializers
from ..models import Case, CaseAccusedOffence


class CaseWriteMixin:

    def _sync_legacy_accused_fields(self, case):
        first_accused = case.accused_entries.order_by("created_at").first()
        if first_accused:
            case.accused_name = first_accused.name or ""
            case.accused_rank = first_accused.rank or ""
            case.accused_service_number = first_accused.service_number or ""
            case.accused_service = first_accused.service or ""
            case.accused_unit = first_accused.unit
        else:
            case.accused_name = ""
            case.accused_rank = ""
            case.accused_service_number = ""
            case.accused_service = ""
            case.accused_unit = None
        case.save(update_fields=[
            "accused_name",
            "accused_rank",
            "accused_service_number",
            "accused_service",
            "accused_unit",
        ])

    def _create_or_update_accused_entries(self, case, accused_entries):
        case.accused_entries.all().delete()
        for entry in accused_entries:
            offences = entry.pop("offences", [])
            accused = case.accused_entries.create(
                name=(entry.get("name") or "").strip(),
                rank=(entry.get("rank") or "").strip(),
                service_number=(entry.get("service_number") or "").strip(),
                service=(entry.get("service") or "").strip(),
                unit=entry.get("unit") or None,
            )
            seen_offences = set()
            for offence in offences:
                key = (offence["offence"].id, offence.get("count_number", 1))
                if key in seen_offences:
                    raise serializers.ValidationError(
                        {"accused_entries": "An accused cannot have the same offence count more than once."}
                    )
                seen_offences.add(key)
                CaseAccusedOffence.objects.create(accused=accused, **offence)
        self._sync_legacy_accused_fields(case)

    def create(self, validated_data):
        accused_entries = validated_data.pop("accused_entries", None)
        case = super().create(validated_data)
        if accused_entries is not None:
            self._create_or_update_accused_entries(case, accused_entries)
        return case

    def update(self, instance, validated_data):
        accused_entries = validated_data.pop("accused_entries", None)
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if validated_data.get("traffic_accident_report"):
            validated_data["traffic_accident_report_uploaded_at"] = timezone.now()
            if user and user.is_authenticated:
                validated_data["traffic_accident_report_uploaded_by"] = user
        if validated_data.get("rta_damage_authority"):
            validated_data["rta_damage_authority_uploaded_at"] = timezone.now()
        case = super().update(instance, validated_data)
        # If the case was closed as part of this update, clear the can_be_closed flag
        try:
            if case.status == Case.Status.CLOSED and getattr(case, "can_be_closed", False):
                case.can_be_closed = False
                case.save(update_fields=["can_be_closed", "updated_at"])
        except Exception:
            # Defensive: if for any reason the model does not have can_be_closed, ignore
            pass
        if accused_entries is not None:
            self._create_or_update_accused_entries(case, accused_entries)
        return case
