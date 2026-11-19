from ._shared import *
from django.db.models import Avg, Count, DateField, DurationField, ExpressionWrapper, F, Q
from django.db.models.functions import Coalesce, TruncDate


class CaseAnalyticsMixin:

    @action(detail=False, methods=["get"], url_path="analytics")
    def analytics(self, request):
        """
        Deadline-based resolution analytics scoped to the requesting user.
        Returns:
          - total_with_deadline     : cases that have an investigation_deadline set
          - resolved_total          : served or closed cases with a deadline
          - resolved_on_time        : resolved where served_at.date() <= investigation_deadline
          - resolved_late           : resolved where served_at.date() > investigation_deadline
          - on_time_rate_pct        : on_time / resolved_total * 100  (null if none resolved)
          - currently_overdue       : deadline < today AND status not in [served, closed]
          - avg_days_variance       : avg(served_at.date() - investigation_deadline) in days
                                      negative = early, positive = late
          - avg_team_window_days    : avg(investigation_deadline - team_assigned_at.date())
                                      how many days teams were given from assignment to deadline
          - avg_team_resolution_days: avg(served_at.date() - team_assigned_at.date())
                                      how many days teams actually took from assignment to close
          - by_battalion            : per-battalion breakdown (superuser / HQ admin only)
        """
        qs = self.get_queryset()
        today = date.today()

        resolved_statuses = [Case.Status.SERVED, Case.Status.CLOSED]

        with_deadline = qs.filter(investigation_deadline__isnull=False)
        resolved = with_deadline.filter(status__in=resolved_statuses, served_at__isnull=False)

        # On-time: served_at (datetime) cast to date <= investigation_deadline
        resolved_on_time = resolved.filter(
            served_at__date__lte=F("investigation_deadline")
        ).count()
        resolved_late = resolved.filter(
            served_at__date__gt=F("investigation_deadline")
        ).count()
        resolved_total = resolved_on_time + resolved_late

        on_time_rate = round(resolved_on_time / resolved_total * 100, 1) if resolved_total else None

        currently_overdue = with_deadline.filter(
            investigation_deadline__lt=today
        ).exclude(status__in=resolved_statuses).count()

        current_timezone = timezone.get_current_timezone()

        def average_days(queryset, end_date, start_date):
            average = queryset.aggregate(
                duration=Avg(
                    ExpressionWrapper(
                        end_date - start_date,
                        output_field=DurationField(),
                    )
                )
            )["duration"]
            return round(average.total_seconds() / 86400, 1) if average is not None else None

        avg_variance = average_days(
            resolved,
            TruncDate("served_at", tzinfo=current_timezone),
            F("investigation_deadline"),
        )

        team_cases = with_deadline.filter(team_assigned_at__isnull=False)
        avg_team_window = average_days(
            team_cases,
            F("investigation_deadline"),
            TruncDate("team_assigned_at", tzinfo=current_timezone),
        )
        resolved_with_assignment = resolved.filter(team_assigned_at__isnull=False)
        avg_team_resolution = average_days(
            resolved_with_assignment,
            TruncDate("served_at", tzinfo=current_timezone),
            TruncDate("team_assigned_at", tzinfo=current_timezone),
        )

        result = {
            "total_with_deadline":      with_deadline.count(),
            "resolved_total":           resolved_total,
            "resolved_on_time":         resolved_on_time,
            "resolved_late":            resolved_late,
            "on_time_rate_pct":         on_time_rate,
            "currently_overdue":        currently_overdue,
            "avg_days_variance":        avg_variance,
            "avg_team_window_days":     avg_team_window,
            "avg_team_resolution_days": avg_team_resolution,
        }

        # Per-battalion breakdown for superuser / HQ admin
        user = request.user
        is_hq_admin = (
            has_global_read_access(user)
        )
        if is_hq_admin:
            breakdown = []
            battalion_rows = (
                with_deadline.filter(tasked_battalion_id__isnull=False)
                .values("tasked_battalion_id", "tasked_battalion__name")
                .annotate(
                    total=Count("pk", distinct=True),
                    resolved_total=Count(
                        "pk",
                        filter=Q(status__in=resolved_statuses, served_at__isnull=False),
                        distinct=True,
                    ),
                    resolved_on_time=Count(
                        "pk",
                        filter=Q(
                            status__in=resolved_statuses,
                            served_at__isnull=False,
                            served_at__date__lte=F("investigation_deadline"),
                        ),
                        distinct=True,
                    ),
                    currently_overdue=Count(
                        "pk",
                        filter=Q(investigation_deadline__lt=today)
                        & ~Q(status__in=resolved_statuses),
                        distinct=True,
                    ),
                )
                .order_by("tasked_battalion__name")
            )
            for row in battalion_rows:
                total_resolved = row["resolved_total"]
                breakdown.append({
                    "battalion": row["tasked_battalion__name"],
                    "total_with_deadline": row["total"],
                    "resolved_total": total_resolved,
                    "resolved_on_time": row["resolved_on_time"],
                    "on_time_rate_pct": (
                        round(row["resolved_on_time"] / total_resolved * 100, 1)
                        if total_resolved else None
                    ),
                    "currently_overdue": row["currently_overdue"],
                })
            result["by_battalion"] = breakdown

        return Response(result)

    @action(detail=False, methods=["get"], url_path="statistics")
    def statistics(self, request):
        qs = self.get_queryset()

        def shift_month(value, offset):
            month = value.month + offset
            year = value.year + (month - 1) // 12
            month = ((month - 1) % 12) + 1
            return date(year, month, 1)

        def top_text_field(field_name):
            rows = (
                qs.exclude(**{f"{field_name}__isnull": True})
                .exclude(**{field_name: ""})
                .values(field_name)
                .annotate(count=Count("id", distinct=True))
                .order_by("-count", field_name)[:10]
            )
            return [
                {
                    "label": row.get(field_name) or "Not recorded",
                    "count": row["count"],
                }
                for row in rows
            ]

        unit_rows = (
            qs.filter(accused_unit__isnull=False)
            .values("accused_unit_id", "accused_unit__name")
            .annotate(count=Count("id", distinct=True))
            .order_by("-count", "accused_unit__name")[:10]
        )
        top_accused_units = [
            {
                "id": row["accused_unit_id"],
                "label": row["accused_unit__name"] or "Unknown unit",
                "count": row["count"],
            }
            for row in unit_rows
        ]

        criminal_rows = (
            qs.exclude(criminal_offence_type="")
            .values("criminal_offence_type")
            .annotate(count=Count("id", distinct=True))
        )
        criminal_counts = {
            row["criminal_offence_type"]: row["count"]
            for row in criminal_rows
        }
        criminal_offence_types = [
            {
                "key": key,
                "label": label,
                "count": criminal_counts.get(key, 0),
            }
            for key, label in Case.CriminalOffenceType.choices
        ]
        criminal_offence_types.sort(key=lambda item: (-item["count"], item["label"]))

        status_counts = {
            row["status"]: row["count"]
            for row in qs.values("status").annotate(count=Count("id", distinct=True))
        }
        status_breakdown = [
            {
                "key": key,
                "label": label,
                "count": status_counts.get(key, 0),
            }
            for key, label in Case.Status.choices
        ]

        current_month = timezone.localdate().replace(day=1)
        start_month = shift_month(current_month, -11)
        trend_rows = (
            qs.filter(created_at__date__gte=start_month)
            .annotate(month=TruncMonth("created_at"))
            .values("month")
            .annotate(count=Count("id", distinct=True))
            .order_by("month")
        )
        trend_counts = {}
        for row in trend_rows:
            month_value = row.get("month")
            if month_value:
                trend_counts[month_value.date().replace(day=1).isoformat()] = row["count"]
        monthly_case_trend = []
        for offset in range(12):
            month_value = shift_month(start_month, offset)
            monthly_case_trend.append({
                "month": month_value.isoformat(),
                "label": month_value.strftime("%b %Y"),
                "count": trend_counts.get(month_value.isoformat(), 0),
            })

        return Response({
            "total_cases": qs.count(),
            "status_breakdown": status_breakdown,
            "monthly_case_trend": monthly_case_trend,
            "top_hotspots": top_text_field("place_of_offence"),
            "top_accused_units": top_accused_units,
            "top_offences": top_text_field("offence"),
            "criminal_offence_types": criminal_offence_types[:10],
            "service_report": self._service_statistics_report(qs, request),
        })

    @action(detail=False, methods=["get"], url_path="rta-statistics")
    def rta_statistics(self, request):
        today = timezone.localdate()
        period = request.query_params.get("period") or "range"
        cases = (
            self._rta_case_queryset(self.get_queryset())
            .prefetch_related(None)
            .select_related("source_incident", "offence_ref")
            .annotate(
                report_date=Coalesce(
                    "date_of_offence",
                    TruncDate(
                        "source_incident__date_occurred",
                        tzinfo=timezone.get_current_timezone(),
                    ),
                    TruncDate("created_at", tzinfo=timezone.get_current_timezone()),
                    output_field=DateField(),
                )
            )
            .annotate(_rta_classification=self._rta_classification_expression())
            .annotate(type_key=self._rta_type_key_expression())
        )

        if period == "as_at":
            as_at = self._parse_statistics_date(request.query_params.get("as_at"), today, "as_at")
            period_payload = {"period": "as_at", "as_at": as_at.isoformat()}
            date_from = None
            date_to = as_at
        else:
            if period != "range":
                period = "range"
            month_start = today.replace(day=1)
            date_from = self._parse_statistics_date(request.query_params.get("date_from"), month_start, "date_from")
            date_to = self._parse_statistics_date(request.query_params.get("date_to"), today, "date_to")
            if date_from > date_to:
                raise ValidationError({"date_from": "Date from cannot be later than date to."})
            period_payload = {
                "period": period,
                "date_from": date_from.isoformat(),
                "date_to": date_to.isoformat(),
            }

        if date_from:
            cases = cases.filter(report_date__gte=date_from)
        if date_to:
            cases = cases.filter(report_date__lte=date_to)

        grouped = {
            key: {"key": key, "label": label, "reported": 0, "yankee": 0, "xray": 0}
            for key, label in RTA_STAT_TYPES
        }
        grouped["not_recorded"] = {
            "key": "not_recorded",
            "label": "Not recorded",
            "reported": 0,
            "yankee": 0,
            "xray": 0,
        }

        reported_by_type = cases.values("type_key").annotate(reported=Count("pk", distinct=True))
        for item in reported_by_type:
            type_key = item["type_key"]
            bucket = grouped.setdefault(type_key, {
                "key": type_key,
                "label": type_key.replace("_", " ").title(),
                "reported": 0,
                "yankee": 0,
                "xray": 0,
            })
            bucket["reported"] = item["reported"]

        casualty_rows = cases.values_list(
            "pk",
            "type_key",
            "source_incident__rta_casualties",
            "source_incident__injuries",
            "source_incident__description",
            "description",
        )
        for (
            _case_id,
            type_key,
            casualties,
            injuries,
            incident_description,
            description,
        ) in casualty_rows.iterator(chunk_size=500):
            bucket = grouped[type_key]
            counts = self._rta_case_casualty_counts(
                type_key,
                casualties,
                injuries,
                incident_description,
                description,
            )
            bucket["yankee"] += counts["yankee"]
            bucket["xray"] += counts["xray"]

        rows = [
            grouped[key]
            for key, _label in RTA_STAT_TYPES
        ]
        if grouped["not_recorded"]["reported"] or grouped["not_recorded"]["yankee"] or grouped["not_recorded"]["xray"]:
            rows.append(grouped["not_recorded"])

        totals = {
            "reported": sum(row["reported"] for row in rows),
            "yankee": sum(row["yankee"] for row in rows),
            "xray": sum(row["xray"] for row in rows),
        }
        return Response({
            **period_payload,
            "generated_at": timezone.now(),
            "legend": {"yankee": "injured", "xray": "dead"},
            "totals": totals,
            "rows": rows,
        })

    def _service_statistics_report(self, qs, request):
        service_labels = {
            Case.Service.KA: "Kenya Army",
            Case.Service.KAF: "Kenya Air Force",
            Case.Service.KN: "Kenya Navy",
            "not_recorded": "Service Not Recorded",
        }
        service_order = [Case.Service.KA, Case.Service.KAF, Case.Service.KN, "not_recorded"]

        status_key = request.query_params.get("service_report_status") or "pending"
        status_choices = dict(Case.Status.choices)
        if status_key == "active":
            report_qs = qs.filter(status__in=[Case.Status.TASKED, Case.Status.UNDER_INVESTIGATION, Case.Status.PENDING])
            status_label = "Active/Pending"
        elif status_key == "all":
            report_qs = qs
            status_label = "All"
        elif status_key in status_choices:
            report_qs = qs.filter(status=status_key)
            status_label = status_choices[status_key]
        else:
            raise ValidationError({"service_report_status": "Select a valid report status."})

        period = request.query_params.get("period") or "as_at"
        today = timezone.localdate()
        as_at_date = today
        date_from = None
        date_to = None
        if period == "range":
            raw_from = request.query_params.get("date_from") or today.isoformat()
            raw_to = request.query_params.get("date_to") or today.isoformat()
            try:
                date_from = date.fromisoformat(raw_from)
                date_to = date.fromisoformat(raw_to)
            except ValueError as exc:
                raise ValidationError({"date_range": "Use YYYY-MM-DD format for range dates."}) from exc
            if date_from > date_to:
                raise ValidationError({"date_range": "From date cannot be later than To date."})
            report_qs = report_qs.filter(created_at__date__gte=date_from, created_at__date__lte=date_to)
            as_at_date = date_to
        elif period == "as_at":
            as_at = request.query_params.get("as_at") or today.isoformat()
            try:
                as_at_date = date.fromisoformat(as_at)
            except ValueError as exc:
                raise ValidationError({"as_at": "Use YYYY-MM-DD format."}) from exc
            report_qs = report_qs.filter(created_at__date__lte=as_at_date)
        else:
            raise ValidationError({"period": "Select either as_at or range."})

        service_filter = request.query_params.get("service") or ""
        valid_services = {Case.Service.KA, Case.Service.KAF, Case.Service.KN}
        if service_filter and service_filter not in valid_services:
            raise ValidationError({"service": "Select a valid service."})

        services = {}
        for row in report_qs.order_by().values(
            "id",
            "accused_service",
            "accused_unit_id",
            "accused_unit__name",
            "accused_unit__service",
            "offence",
        ):
            service = row["accused_service"] or row["accused_unit__service"] or "not_recorded"
            if service_filter and service != service_filter:
                continue

            service_bucket = services.setdefault(service, {
                "service": service,
                "label": service_labels.get(service, service),
                "offences": set(),
                "rows": {},
                "total": 0,
            })

            offence = (row["offence"] or "").strip() or "Not recorded"
            unit_id = row["accused_unit_id"]
            unit_key = str(unit_id) if unit_id else "not_recorded"
            unit_label = row["accused_unit__name"] or "Not recorded"

            service_bucket["offences"].add(offence)
            unit_row = service_bucket["rows"].setdefault(unit_key, {
                "unit_id": unit_id,
                "formation_unit": unit_label,
                "offences": {},
                "total": 0,
            })
            unit_row["offences"][offence] = unit_row["offences"].get(offence, 0) + 1
            unit_row["total"] += 1
            service_bucket["total"] += 1

        reports = []
        ordered_services = service_order + sorted(set(services.keys()) - set(service_order))
        if service_filter and service_filter not in services:
            ordered_services = [service_filter]
            services[service_filter] = {
                "service": service_filter,
                "label": service_labels.get(service_filter, service_filter),
                "offences": set(),
                "rows": {},
                "total": 0,
            }

        for service in ordered_services:
            bucket = services.get(service)
            if not bucket:
                continue
            offence_columns = sorted(bucket["offences"])
            rows = sorted(bucket["rows"].values(), key=lambda item: item["formation_unit"].lower())
            subtotal = {
                offence: sum(row["offences"].get(offence, 0) for row in rows)
                for offence in offence_columns
            }
            reports.append({
                "service": bucket["service"],
                "label": bucket["label"],
                "offences": offence_columns,
                "rows": rows,
                "subtotal": subtotal,
                "total": bucket["total"],
            })

        return {
            "period": period,
            "as_at": as_at_date.isoformat(),
            "date_from": date_from.isoformat() if date_from else None,
            "date_to": date_to.isoformat() if date_to else None,
            "status": status_key,
            "status_label": status_label,
            "service": service_filter,
            "services": reports,
            "total": sum(report["total"] for report in reports),
        }

    @action(
        detail=True,
        methods=["get", "post"],
        url_path="attachments",
        parser_classes=[MultiPartParser, FormParser],
    )
    def attachments(self, request, pk=None):
        case = self.get_object()
        if request.method == "GET":
            qs = case.extra_attachments.select_related("uploaded_by").all()
            serializer = CaseAttachmentSerializer(qs, many=True, context={"request": request})
            return Response(serializer.data)
        ensure_case_accepts_file_changes(case)
        serializer = CaseAttachmentSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        att = serializer.save(case=case, uploaded_by=request.user)
        filename = att.file.name.split("/")[-1] if att.file else ""
        label = att.label or filename
        self._log_action(case, request.user, CaseActivityLog.Action.ATTACHMENT_UPLOADED,
                         f"Uploaded '{label}'")
        actor_label = self._actor_label(request.user)
        self._notify_team(
            case, actor=request.user,
            message=(
                f"{actor_label} uploaded attachment '{label}' on Case #{case.case_number} "
                f"— '{case.title}'."
            ),
        )
        return Response(serializer.data, status=http_status.HTTP_201_CREATED)
