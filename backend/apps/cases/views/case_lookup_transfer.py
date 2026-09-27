from ._shared import *
from ..uploads import validate_case_upload


class CaseLookupTransferMixin:

    @action(detail=False, methods=["get"], url_path="accused-lookup")
    def accused_lookup(self, request):
        service_number = str(request.query_params.get("service_number", "")).strip()
        if not service_number.isdigit():
            return Response(
                {"service_number": "Service number must contain numbers only."},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        visible_cases = self.get_queryset().filter(
            Q(accused_entries__service_number=service_number)
            | Q(accused_service_number=service_number)
        ).distinct()
        visible_case_ids = visible_cases.values_list("id", flat=True)
        accused = (
            CaseAccused.objects.select_related("unit")
            .filter(case_id__in=visible_case_ids, service_number=service_number)
            .order_by("-updated_at", "-id")
            .first()
        )
        if accused:
            return Response({
                "service_number": accused.service_number,
                "name": accused.name,
                "rank": accused.rank,
                "service": accused.service,
                "unit": accused.unit_id,
                "unit_name": accused.unit.name if accused.unit else "",
            })

        legacy_case = visible_cases.order_by("-updated_at", "-id").first()
        if legacy_case:
            return Response({
                "service_number": legacy_case.accused_service_number,
                "name": legacy_case.accused_name,
                "rank": legacy_case.accused_rank,
                "service": legacy_case.accused_service,
                "unit": legacy_case.accused_unit_id,
                "unit_name": legacy_case.accused_unit.name if legacy_case.accused_unit else "",
            })

        return Response(
            {"detail": "No accused with this service number was found."},
            status=http_status.HTTP_404_NOT_FOUND,
        )

    @action(detail=False, methods=["get"], url_path="transferable")
    def transferable(self, request):
        if not (request.user.is_superuser or is_hqs_admin(request.user)):
            raise PermissionDenied("Only HQ users can transfer cases.")
        excluded = [Case.Status.NEW, Case.Status.CLOSED, Case.Status.SERVED]
        queryset = self.get_queryset().exclude(status__in=excluded)
        return Response(CaseSerializer(queryset, many=True, context={"request": request}).data)

    @action(detail=False, methods=["get"], url_path="transferred")
    def transferred(self, request):
        if not (request.user.is_superuser or is_hqs_admin(request.user)):
            raise PermissionDenied("Only HQ users can view transferred cases.")
        queryset = self.get_queryset().filter(
            activity_logs__action=CaseActivityLog.Action.CASE_TRANSFERRED
        ).prefetch_related(
            Prefetch(
                "activity_logs",
                queryset=CaseActivityLog.objects.filter(
                    action=CaseActivityLog.Action.CASE_TRANSFERRED
                ).order_by("-created_at", "-id"),
                to_attr="transfer_history_logs",
            )
        ).distinct()
        return Response(CaseSerializer(queryset, many=True, context={"request": request}).data)

    @action(detail=False, methods=["get"], url_path="transfer-summary")
    def transfer_summary(self, request):
        user = request.user
        if not user.is_authenticated or not user.battalion_id:
            return Response({"received": [], "released": []})

        battalion = user.battalion
        summary = {"received": [], "released": []}
        logs = CaseActivityLog.objects.filter(
            action=CaseActivityLog.Action.CASE_TRANSFERRED,
            case__tasked_battalion__isnull=False,
        ).select_related("case").order_by("-created_at", "-id")
        pattern = re.compile(
            r"Transferred from (?P<source>.*?) to (?P<destination>.*?)\. "
            r"Reason: (?P<reason>.*?)\. Instructions: (?P<instructions>.*)"
        )
        for log in logs:
            match = pattern.match(str(log.detail or ""))
            if not match:
                continue
            transfer = match.groupdict()
            direction = (
                "received" if transfer["destination"] == battalion.name
                else "released" if transfer["source"] == battalion.name
                else None
            )
            if not direction:
                continue
            item = CaseSerializer(log.case, context={"request": request}).data
            item.update({
                "transfer_from": transfer["source"],
                "transfer_to": transfer["destination"],
                "transfer_reason": transfer["reason"],
                "transfer_instructions": transfer["instructions"],
                "transfer_date": log.created_at.isoformat(),
            })
            summary[direction].append(item)
        return Response(summary)

    @action(
        detail=False,
        methods=["post"],
        url_path="transfer",
        parser_classes=[MultiPartParser, FormParser, JSONParser],
    )
    def transfer(self, request):
        if not (request.user.is_superuser or is_hqs_admin(request.user)):
            raise PermissionDenied("Only HQ users can transfer cases.")

        raw_ids = request.data.getlist("case_ids") if hasattr(request.data, "getlist") else request.data.get("case_ids")
        if isinstance(raw_ids, str):
            try:
                raw_ids = json.loads(raw_ids)
            except (TypeError, ValueError):
                raw_ids = [part.strip() for part in raw_ids.split(",") if part.strip()]
        if not isinstance(raw_ids, (list, tuple)) or not raw_ids:
            raise ValidationError({"case_ids": "Select at least one case."})
        try:
            case_ids = [int(value) for value in raw_ids]
        except (TypeError, ValueError) as exc:
            raise ValidationError({"case_ids": "Case IDs must be numeric."}) from exc

        destination_id = request.data.get("destination_battalion")
        reason = str(request.data.get("reason") or "").strip()
        instructions = str(request.data.get("instructions") or "").strip()
        letter = request.FILES.get("transfer_letter")
        if not destination_id:
            raise ValidationError({"destination_battalion": "Destination Battalion is required."})
        if not reason:
            raise ValidationError({"reason": "Reason is required."})
        if not instructions:
            raise ValidationError({"instructions": "Instructions are required."})
        if not letter:
            raise ValidationError({"transfer_letter": "A transfer letter attachment is required."})
        validate_case_upload(letter, field_name="transfer_letter", allowed_extensions={".pdf"})
        letter_bytes = letter.read()
        try:
            destination = Battalion.objects.get(pk=destination_id)
        except (TypeError, ValueError, Battalion.DoesNotExist) as exc:
            raise ValidationError({"destination_battalion": "Select a valid Battalion."}) from exc

        excluded = [Case.Status.NEW, Case.Status.CLOSED, Case.Status.SERVED]
        cases = list(self.get_queryset().filter(id__in=case_ids).exclude(status__in=excluded))
        if len(cases) != len(set(case_ids)):
            raise ValidationError({"case_ids": "One or more selected cases are no longer transferable."})

        with transaction.atomic():
            for case in cases:
                origin_battalion = case.tasked_battalion
                old_battalion = origin_battalion.name if origin_battalion else "Unassigned"
                case.tasked_battalion = destination
                case.tasked_company = None
                case.tasked_detachment = None
                case.assigned_to = None
                case.assigned_team = None
                case.team_assigned_at = None
                case.save(update_fields=[
                    "tasked_battalion", "tasked_company", "tasked_detachment",
                    "assigned_to", "assigned_team", "team_assigned_at", "updated_at",
                ])
                detail = (
                    f"Transferred from {old_battalion} to {destination.name}. "
                    f"Reason: {reason}. Instructions: {instructions}"
                )
                CaseActivityLog.objects.create(
                    case=case,
                    actor=request.user,
                    action=CaseActivityLog.Action.CASE_TRANSFERRED,
                    detail=detail,
                    reference_pdf=ContentFile(letter_bytes, name=letter.name),
                )
                recipients = User.objects.filter(
                    battalion_id=destination.id, is_active=True
                ).exclude(role__in=[
                    User.Role.DETACHMENT, User.Role.DET_CMD, User.Role.PLT_CMD,
                    User.Role.DET_TWO_IC, User.Role.CORPS_CMD,
                ])
                destination_message = (
                    f"Case (#{case.case_number or case.id}) has been transferred to "
                    f"{destination.name}: {case.title}. Reason: {reason}. "
                    f"Instructions: {instructions}"
                )
                notifications = [
                    Notification(
                        recipient=user,
                        message=destination_message,
                        notification_type=Notification.Type.CASE,
                        related_model="case",
                        related_id=case.id,
                    ) for user in recipients
                ]
                if origin_battalion and origin_battalion.id != destination.id:
                    origin_recipients = User.objects.filter(
                        (
                            Q(battalion_id=origin_battalion.id)
                            & Q(role__in=BATTALION_COMMAND_ROLES | DETACHMENT_ATTACHMENT_ROLES | {User.Role.INVESTIGATOR})
                        )
                        | Q(pk=case.assigned_to_id)
                        | Q(investigation_teams__assigned_cases=case)
                        | Q(led_teams__assigned_cases=case),
                        is_active=True,
                    ).distinct()
                    origin_message = (
                        f"Case (#{case.case_number or case.id}) has been transferred "
                        f"from {origin_battalion.name} to {destination.name}. "
                        f"Reason: {reason}. Instructions: {instructions}"
                    )
                    notifications.extend(
                        Notification(
                            recipient=user,
                            message=origin_message,
                            notification_type=Notification.Type.CASE,
                            related_model="case",
                            related_id=case.id,
                        )                         for user in origin_recipients
                    )
                Notification.objects.bulk_create(notifications)
                self._send_email(
                    list(recipients),
                    f"[MPIMS] Case transferred to {destination.name}",
                    destination_message,
                )
                if origin_battalion and origin_battalion.id != destination.id:
                    self._send_email(
                        list(origin_recipients),
                        f"[MPIMS] Case transferred from {origin_battalion.name}",
                        origin_message,
                    )
        return Response({"transferred": len(cases), "destination_battalion": destination.name})
