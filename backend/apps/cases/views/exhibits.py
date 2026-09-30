from ._shared import *
from ..services import (
    approve_exhibit_storage,
    decline_exhibit_storage,
    mark_exhibit_stored,
)
from ..uploads import validate_case_upload
from .exhibit_access import scope_exhibits_for_user

class ExhibitStorageRequestViewSet(viewsets.ModelViewSet):
    serializer_class = ExhibitStorageRequestSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status", "case", "storage_scope", "target_detachment", "target_battalion"]
    search_fields = [
        "case__case_number",
        "case__offence",
        "case__offence_ref__name",
        "case__accused_name",
        "case__accused_service_number",
        "case__accused_entries__name",
        "case__accused_entries__service_number",
        "exhibit_name",
        "storage_reference",
        "physical_location",
        "target_detachment__name",
        "target_battalion__name",
        "requested_by__name",
        "requested_by__service_number",
    ]
    ordering_fields = ["created_at", "updated_at", "status", "exhibit_name"]
    ordering = ["-created_at"]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        is_adj_release_authorization = (
            getattr(self, "action", None) in {"approve_lifecycle", "decline_lifecycle"}
            and getattr(request.user, "role", None) == User.Role.ADJ
        )
        if should_block_command_write(request.user, request.method) and not is_adj_release_authorization:
            raise PermissionDenied(command_read_only_message(request.user))

    def get_queryset(self):
        qs = ExhibitStorageRequest.objects.select_related(
            "case",
            "case__assigned_to",
            "case__assigned_team",
            "case__assigned_team__team_ic",
            "case__tasked_battalion",
            "case__tasked_detachment",
            "target_detachment",
            "target_battalion",
            "requested_by",
            "reviewed_by",
            "stored_by",
            "lifecycle_requested_by",
            "lifecycle_reviewed_by",
            "parent_request",
            "parent_request__case",
        ).prefetch_related(
            "case__assigned_team__members",
            "case__accused_entries",
        )
        return self._apply_exhibit_query_filters(
            scope_exhibits_for_user(self.request.user, qs)
        )

    def _apply_exhibit_query_filters(self, qs):
        date_from = self._parse_date_param("date_from") or self._parse_date_param("created_from")
        date_to = self._parse_date_param("date_to") or self._parse_date_param("created_to")
        if date_from:
            qs = qs.filter(created_at__date__gte=date_from)
        if date_to:
            qs = qs.filter(created_at__date__lte=date_to)
        return qs

    def _parse_date_param(self, name):
        value = self.request.query_params.get(name)
        if not value:
            return None
        try:
            return date.fromisoformat(str(value))
        except ValueError as exc:
            raise ValidationError({name: "Use YYYY-MM-DD format."}) from exc

    def perform_create(self, serializer):
        ensure_case_accepts_file_changes(serializer.validated_data.get("case"))
        exhibit = serializer.save(requested_by=self.request.user)
        self._notify_approvers(exhibit)

    @action(detail=False, methods=["get"], url_path="eligible-cases")
    def eligible_cases(self, request):
        if request.user.role != User.Role.INVESTIGATOR:
            return Response([])
        qs = Case.objects.select_related(
            "assigned_to",
            "assigned_team",
            "assigned_team__team_ic",
            "tasked_battalion",
            "tasked_detachment",
            "accused_unit",
        ).prefetch_related("assigned_team__members", "accused_entries")
        qs = qs.filter(
            Q(assigned_to=request.user)
            | Q(assigned_team__team_ic=request.user)
            | Q(assigned_team__members=request.user)
        ).distinct().order_by("-created_at")
        return Response(CaseSerializer(qs, many=True, context={"request": request}).data)

    @action(detail=False, methods=["get"], url_path="storage-destinations")
    def storage_destinations(self, request):
        if request.user.role != User.Role.INVESTIGATOR:
            return Response({"detachment": None, "battalions": []})

        detachment = None
        if request.user.detachment_id:
            det = request.user.detachment
            detachment = {
                "id": det.id,
                "name": det.name,
                "battalion": det.battalion_id,
                "battalion_name": det.battalion.name if det.battalion else None,
            }

        battalions = Battalion.objects.order_by("name").values(
            "id",
            "name",
            "battalion_type",
        )
        return Response({
            "detachment": detachment,
            "battalions": list(battalions),
        })

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        exhibit = self.get_object()
        self._ensure_can_review(request.user, exhibit)
        exhibit = approve_exhibit_storage(
            exhibit,
            request.user,
            request.data.get("comments"),
        )
        self._notify_requester(exhibit, "approved")
        return Response(self.get_serializer(exhibit).data)

    @action(detail=True, methods=["post"])
    def decline(self, request, pk=None):
        exhibit = self.get_object()
        self._ensure_can_review(request.user, exhibit)
        exhibit = decline_exhibit_storage(
            exhibit,
            request.user,
            request.data.get("reason") or request.data.get("decline_reason"),
            request.data.get("comments"),
        )
        self._notify_requester(exhibit, "declined")
        return Response(self.get_serializer(exhibit).data)

    @action(detail=True, methods=["post"])
    def store(self, request, pk=None):
        exhibit = self.get_object()
        self._ensure_can_store(request.user, exhibit)
        exhibit = mark_exhibit_stored(
            exhibit,
            request.user,
            request.data.get("physical_location"),
            request.data.get("storage_reference"),
        )
        self._notify_requester(exhibit, "stored")
        return Response(self.get_serializer(exhibit).data)

    @action(detail=True, methods=["post"], url_path="request-lifecycle")
    def request_lifecycle(self, request, pk=None):
        exhibit = self.get_object()
        ensure_case_accepts_file_changes(exhibit.case)
        self._ensure_can_request_lifecycle(request.user, exhibit)
        if exhibit.status != ExhibitStorageRequest.Status.STORED:
            raise ValidationError({"status": "Only stored exhibits can be released."})

        lifecycle_action = str(request.data.get("action") or request.data.get("lifecycle_action") or "").strip()
        release_actions = {
            ExhibitStorageRequest.LifecycleAction.RETURN_OWNER,
            ExhibitStorageRequest.LifecycleAction.DISPOSE,
        }
        if lifecycle_action not in release_actions:
            raise ValidationError({"action": "Select Return to the Owner or Dispose as the mode of release."})
        request_status = self._lifecycle_request_status(lifecycle_action)
        if not request_status:
            raise ValidationError({"action": "Select a valid release action."})

        reason = str(request.data.get("reason") or request.data.get("lifecycle_reason") or "").strip()
        if not reason:
            raise ValidationError({"reason": "Reason for release is required."})

        recipient_name = str(request.data.get("recipient_name") or request.data.get("lifecycle_recipient_name") or "").strip()
        recipient_identifier = str(request.data.get("recipient_identifier") or request.data.get("lifecycle_recipient_identifier") or "").strip()
        authority = str(request.data.get("authority") or request.data.get("lifecycle_authority") or "").strip()
        disposal_mode = str(request.data.get("disposal_mode") or request.data.get("lifecycle_disposal_mode") or "").strip()
        lifecycle_attachment = request.FILES.get("attachment") or request.FILES.get("lifecycle_attachment")
        if not lifecycle_attachment:
            raise ValidationError({"attachment": "Evidence document is required before requesting exhibit release."})
        validate_case_upload(
            lifecycle_attachment,
            field_name="lifecycle_attachment",
            allowed_extensions={".pdf", ".doc", ".docx"},
        )
        if lifecycle_action == ExhibitStorageRequest.LifecycleAction.RETURN_OWNER:
            accused_name = (exhibit.case.accused_name or "").strip()
            accused_service_number = (exhibit.case.accused_service_number or "").strip()
            if not accused_name and not accused_service_number:
                raise ValidationError({"action": "Return to the Owner is invalid because the case has no accused name or service number recorded."})
            recipient_name = accused_name or "NIL"
            recipient_identifier = accused_service_number or "NIL"
        if lifecycle_action == ExhibitStorageRequest.LifecycleAction.DISPOSE and not disposal_mode:
            raise ValidationError({"disposal_mode": "Mode of disposal is required when disposing an exhibit."})
        if lifecycle_action == ExhibitStorageRequest.LifecycleAction.DISPOSE:
            recipient_name = ""
            recipient_identifier = ""
        else:
            disposal_mode = ""

        exhibit.status = request_status
        exhibit.lifecycle_action = lifecycle_action
        exhibit.lifecycle_reason = reason
        exhibit.lifecycle_recipient_name = recipient_name
        exhibit.lifecycle_recipient_identifier = recipient_identifier
        exhibit.lifecycle_authority = authority
        exhibit.lifecycle_disposal_mode = disposal_mode
        exhibit.lifecycle_requested_by = request.user
        exhibit.lifecycle_requested_at = timezone.now()
        exhibit.lifecycle_reviewed_by = None
        exhibit.lifecycle_reviewed_at = None
        exhibit.lifecycle_review_comments = ""
        exhibit.lifecycle_decline_reason = ""
        exhibit.lifecycle_attachment = lifecycle_attachment
        exhibit.save(update_fields=[
            "status",
            "lifecycle_action",
            "lifecycle_reason",
            "lifecycle_recipient_name",
            "lifecycle_recipient_identifier",
            "lifecycle_authority",
            "lifecycle_disposal_mode",
            "lifecycle_requested_by",
            "lifecycle_requested_at",
            "lifecycle_reviewed_by",
            "lifecycle_reviewed_at",
            "lifecycle_review_comments",
            "lifecycle_decline_reason",
            "lifecycle_attachment",
            "updated_at",
        ])
        self._notify_lifecycle_approvers(exhibit)
        return Response(self.get_serializer(exhibit).data)

    @action(detail=True, methods=["post"], url_path="approve-lifecycle")
    def approve_lifecycle(self, request, pk=None):
        exhibit = self.get_object()
        self._ensure_can_authorize_release(request.user, exhibit)
        if exhibit.status not in self._lifecycle_pending_statuses():
            raise ValidationError({"status": "Only pending exhibit release requests can be approved."})

        final_status = self._lifecycle_final_status(exhibit.lifecycle_action)
        if not final_status:
            raise ValidationError({"action": "This exhibit has no valid pending release request."})

        exhibit.status = final_status
        exhibit.lifecycle_reviewed_by = request.user
        exhibit.lifecycle_reviewed_at = timezone.now()
        exhibit.lifecycle_review_comments = str(request.data.get("comments") or "").strip()
        exhibit.lifecycle_decline_reason = ""
        exhibit.save(update_fields=[
            "status",
            "lifecycle_reviewed_by",
            "lifecycle_reviewed_at",
            "lifecycle_review_comments",
            "lifecycle_decline_reason",
            "updated_at",
        ])
        self._notify_lifecycle_requester(exhibit, "approved")
        return Response(self.get_serializer(exhibit).data)

    @action(detail=True, methods=["post"], url_path="decline-lifecycle")
    def decline_lifecycle(self, request, pk=None):
        exhibit = self.get_object()
        self._ensure_can_authorize_release(request.user, exhibit)
        if exhibit.status not in self._lifecycle_pending_statuses():
            raise ValidationError({"status": "Only pending exhibit release requests can be declined."})

        reason = str(request.data.get("reason") or request.data.get("decline_reason") or "").strip()
        if not reason:
            raise ValidationError({"reason": "Reason for declining the exhibit release is required."})

        exhibit.status = ExhibitStorageRequest.Status.STORED
        exhibit.lifecycle_reviewed_by = request.user
        exhibit.lifecycle_reviewed_at = timezone.now()
        exhibit.lifecycle_review_comments = str(request.data.get("comments") or "").strip()
        exhibit.lifecycle_decline_reason = reason
        exhibit.save(update_fields=[
            "status",
            "lifecycle_reviewed_by",
            "lifecycle_reviewed_at",
            "lifecycle_review_comments",
            "lifecycle_decline_reason",
            "updated_at",
        ])
        self._notify_lifecycle_requester(exhibit, "declined")
        return Response(self.get_serializer(exhibit).data)

    @action(detail=False, methods=["post"], url_path="scan-release-document")
    def scan_release_document(self, request):
        self._ensure_can_scan_release_document(request.user)
        content, filename, content_type = self._scan_release_document()
        response = HttpResponse(content, content_type=content_type)
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response

    def _ensure_can_review(self, user, exhibit):
        if user.is_superuser:
            return
        if exhibit.storage_scope == ExhibitStorageRequest.StorageScope.DETACHMENT:
            if is_detachment_ic(user) and user.detachment_id == exhibit.target_detachment_id:
                return
            raise PermissionDenied("Only the target IC Cases user can review this exhibit storage request.")
        if exhibit.storage_scope in {
            ExhibitStorageRequest.StorageScope.BATTALION,
            ExhibitStorageRequest.StorageScope.SPECIAL_BATTALION,
        }:
            if user.role == User.Role.ADMIN and user.battalion_id == exhibit.target_battalion_id:
                return
            raise PermissionDenied("Only the target battalion admin can review this exhibit storage request.")
        raise PermissionDenied("You cannot review this exhibit storage request.")

    def _ensure_can_store(self, user, exhibit):
        self._ensure_can_review(user, exhibit)

    def _ensure_can_authorize_release(self, user, exhibit):
        if user.is_superuser:
            return

        if (
            is_detachment_ic(user)
            and user.detachment_id
            and exhibit.storage_scope == ExhibitStorageRequest.StorageScope.DETACHMENT
            and user.detachment_id == exhibit.target_detachment_id
        ):
            return

        command_roles = {
            User.Role.ADMIN,
            User.Role.ADJ,
            User.Role.HOB,
            User.Role.OC,
            User.Role.CO,
            User.Role.TWO_IC,
        }
        if user.role in command_roles and user.battalion_id:
            battalion_ids = {exhibit.target_battalion_id}
            if exhibit.target_detachment_id and exhibit.target_detachment:
                battalion_ids.add(exhibit.target_detachment.company.battalion_id)
            if user.battalion_id in battalion_ids:
                return

        raise PermissionDenied("Only Admin, IC Cases, Adjutant, HOB, OC, CO, or 2IC for the storage unit can authorise exhibit release.")

    def _ensure_can_scan_release_document(self, user):
        allowed_roles = {
            User.Role.INVESTIGATOR,
            User.Role.ADMIN,
            User.Role.DETACHMENT,
            User.Role.ADJ,
            User.Role.HOB,
            User.Role.OC,
            User.Role.CO,
            User.Role.TWO_IC,
        }
        if user.is_superuser or user.role in allowed_roles:
            return
        raise PermissionDenied("You cannot scan exhibit release documents.")

    def _ensure_can_request_lifecycle(self, user, exhibit):
        if user.is_superuser:
            return
        if user.role != User.Role.INVESTIGATOR:
            raise PermissionDenied("Only investigators can request exhibit release.")
        if exhibit.case.assigned_to_id == user.id:
            return
        team = getattr(exhibit.case, "assigned_team", None)
        if team:
            if team.team_ic_id == user.id:
                return
            if team.members.filter(id=user.id).exists():
                return
        raise PermissionDenied("You can only request exhibit release for cases assigned to you or your investigation team.")

    def _lifecycle_pending_statuses(self):
        return {
            ExhibitStorageRequest.Status.RETURN_REQUESTED,
            ExhibitStorageRequest.Status.DISPOSAL_REQUESTED,
            ExhibitStorageRequest.Status.TRANSFER_REQUESTED,
            ExhibitStorageRequest.Status.RETENTION_REQUESTED,
        }

    def _lifecycle_request_status(self, lifecycle_action):
        return {
            ExhibitStorageRequest.LifecycleAction.RETURN_ACCUSED: ExhibitStorageRequest.Status.RETURN_REQUESTED,
            ExhibitStorageRequest.LifecycleAction.RETURN_OWNER: ExhibitStorageRequest.Status.RETURN_REQUESTED,
            ExhibitStorageRequest.LifecycleAction.DISPOSE: ExhibitStorageRequest.Status.DISPOSAL_REQUESTED,
            ExhibitStorageRequest.LifecycleAction.TRANSFER: ExhibitStorageRequest.Status.TRANSFER_REQUESTED,
            ExhibitStorageRequest.LifecycleAction.RETAIN: ExhibitStorageRequest.Status.RETENTION_REQUESTED,
        }.get(lifecycle_action)

    def _lifecycle_final_status(self, lifecycle_action):
        return {
            ExhibitStorageRequest.LifecycleAction.RETURN_ACCUSED: ExhibitStorageRequest.Status.RETURNED,
            ExhibitStorageRequest.LifecycleAction.RETURN_OWNER: ExhibitStorageRequest.Status.RETURNED,
            ExhibitStorageRequest.LifecycleAction.DISPOSE: ExhibitStorageRequest.Status.DISPOSED,
            ExhibitStorageRequest.LifecycleAction.TRANSFER: ExhibitStorageRequest.Status.TRANSFERRED,
            ExhibitStorageRequest.LifecycleAction.RETAIN: ExhibitStorageRequest.Status.RETAINED,
        }.get(lifecycle_action)

    def _lifecycle_action_label(self, lifecycle_action):
        labels = {
            ExhibitStorageRequest.LifecycleAction.RETURN_OWNER: "Return to the Owner",
            ExhibitStorageRequest.LifecycleAction.DISPOSE: "Dispose",
        }
        if lifecycle_action in labels:
            return labels[lifecycle_action]
        try:
            return ExhibitStorageRequest.LifecycleAction(lifecycle_action).label
        except ValueError:
            return lifecycle_action or "Exhibit release"

    def _scan_release_document(self):
        try:
            import win32com.client
        except ImportError as exc:
            raise ValidationError({
                "scanner": (
                    "Direct scanner access requires Windows scanner support on the server "
                    "running MPIMS. Install/configure the scanner driver and pywin32, then try again."
                )
            }) from exc

        try:
            dialog = win32com.client.Dispatch("WIA.CommonDialog")
            image = dialog.ShowAcquireImage()
        except Exception as exc:
            raise ValidationError({
                "scanner": "Unable to scan from the connected scanner. Check that the scanner is connected, powered on, and available to this computer."
            }) from exc

        try:
            data = bytes(image.FileData.BinaryData)
        except Exception as exc:
            raise ValidationError({"scanner": "The scanner did not return a readable document."}) from exc

        extension = str(getattr(image, "FileExtension", "") or "jpg").lower().lstrip(".")
        content_types = {
            "bmp": "image/bmp",
            "gif": "image/gif",
            "jpeg": "image/jpeg",
            "jpg": "image/jpeg",
            "png": "image/png",
            "tif": "image/tiff",
            "tiff": "image/tiff",
        }
        content_type = content_types.get(extension, "application/octet-stream")
        filename = f"release_evidence_scan_{timezone.now().strftime('%Y%m%d_%H%M%S')}.{extension}"
        return data, filename, content_type

    def _approvers_for_exhibit(self, exhibit):
        if exhibit.storage_scope == ExhibitStorageRequest.StorageScope.DETACHMENT and exhibit.target_detachment_id:
            return list(User.objects.filter(
                role=User.Role.DETACHMENT,
                detachment_id=exhibit.target_detachment_id,
                is_active=True,
            ))
        if exhibit.target_battalion_id:
            return list(User.objects.filter(
                role=User.Role.ADMIN,
                battalion_id=exhibit.target_battalion_id,
                is_active=True,
            ))
        return []

    def _case_team_recipients(self, exhibit):
        recipients = set()
        for user in [exhibit.requested_by, exhibit.case.assigned_to]:
            if user and user.is_active:
                recipients.add(user)
        team = getattr(exhibit.case, "assigned_team", None)
        if team:
            if team.team_ic and team.team_ic.is_active:
                recipients.add(team.team_ic)
            for member in team.members.filter(is_active=True):
                recipients.add(member)
        return recipients

    def _notify_approvers(self, exhibit):
        recipients = self._approvers_for_exhibit(exhibit)

        if not recipients:
            return
        destination = exhibit.target_detachment or exhibit.target_battalion
        prefix = "Additional exhibit storage request" if exhibit.parent_request_id else "Exhibit storage request"
        message = (
            f"{prefix} for {exhibit.case.case_number} awaits review: "
            f"{exhibit.exhibit_name} to be stored at {destination}."
        )
        Notification.objects.bulk_create([
            Notification(
                recipient=user,
                message=message,
                notification_type=Notification.Type.CASE,
                related_model="exhibit_storage_request",
                related_id=exhibit.id,
            )
            for user in recipients
        ])
        self._send_email(recipients, f"[MPIMS] Exhibit storage request {exhibit.case.case_number}", message)

    def _notify_requester(self, exhibit, event):
        recipients = self._case_team_recipients(exhibit)
        actor = exhibit.stored_by if event == "stored" else exhibit.reviewed_by
        if actor:
            recipients.discard(actor)
        if not recipients:
            return
        if event == "approved":
            message = (
                f"Exhibit storage request for {exhibit.case.case_number} was approved. "
                f"Deliver '{exhibit.exhibit_name}' physically for storage confirmation."
            )
        elif event == "declined":
            message = (
                f"Exhibit storage request for {exhibit.case.case_number} was declined. "
                f"Reason: {exhibit.decline_reason}"
            )
        else:
            message = (
                f"Exhibit '{exhibit.exhibit_name}' for {exhibit.case.case_number} has been physically received "
                f"and stored at {exhibit.physical_location}."
            )
        Notification.objects.bulk_create([
            Notification(
                recipient=user,
                message=message,
                notification_type=Notification.Type.CASE,
                related_model="exhibit_storage_request",
                related_id=exhibit.id,
            )
            for user in recipients
        ])
        self._send_email(list(recipients), f"[MPIMS] Exhibit storage {event}", message)

    def _release_approvers_for_exhibit(self, exhibit):
        recipients = set()
        if exhibit.storage_scope == ExhibitStorageRequest.StorageScope.DETACHMENT and exhibit.target_detachment_id:
            recipients.update(User.objects.filter(
                role=User.Role.DETACHMENT,
                detachment_id=exhibit.target_detachment_id,
                is_active=True,
            ))

        battalion_id = exhibit.target_battalion_id
        if not battalion_id and exhibit.target_detachment_id and exhibit.target_detachment:
            battalion_id = exhibit.target_detachment.company.battalion_id

        if battalion_id:
            recipients.update(User.objects.filter(
                role__in=[
                    User.Role.ADMIN,
                    User.Role.ADJ,
                    User.Role.HOB,
                    User.Role.OC,
                    User.Role.CO,
                    User.Role.TWO_IC,
                ],
                battalion_id=battalion_id,
                is_active=True,
            ))
        return list(recipients)

    def _notify_lifecycle_approvers(self, exhibit):
        recipients = self._release_approvers_for_exhibit(exhibit)
        if exhibit.lifecycle_requested_by:
            recipients = [user for user in recipients if user.id != exhibit.lifecycle_requested_by_id]
        if not recipients:
            return
        action_label = self._lifecycle_action_label(exhibit.lifecycle_action)
        message = (
            f"{action_label} request for exhibit '{exhibit.exhibit_name}' "
            f"on {exhibit.case.case_number} awaits approval."
        )
        Notification.objects.bulk_create([
            Notification(
                recipient=user,
                message=message,
                notification_type=Notification.Type.CASE,
                related_model="exhibit_storage_request",
                related_id=exhibit.id,
            )
            for user in recipients
        ])
        self._send_email(recipients, f"[MPIMS] Exhibit release request {exhibit.case.case_number}", message)

    def _notify_lifecycle_requester(self, exhibit, event):
        recipients = self._case_team_recipients(exhibit)
        if exhibit.lifecycle_reviewed_by:
            recipients.discard(exhibit.lifecycle_reviewed_by)
        if not recipients:
            return
        action_label = self._lifecycle_action_label(exhibit.lifecycle_action)
        if event == "approved":
            message = (
                f"{action_label} request for exhibit '{exhibit.exhibit_name}' "
                f"on {exhibit.case.case_number} was approved. Current status: {exhibit.get_status_display()}."
            )
        else:
            message = (
                f"{action_label} request for exhibit '{exhibit.exhibit_name}' "
                f"on {exhibit.case.case_number} was declined. Reason: {exhibit.lifecycle_decline_reason}"
            )
        Notification.objects.bulk_create([
            Notification(
                recipient=user,
                message=message,
                notification_type=Notification.Type.CASE,
                related_model="exhibit_storage_request",
                related_id=exhibit.id,
            )
            for user in recipients
        ])
        self._send_email(list(recipients), f"[MPIMS] Exhibit release {event}", message)

    def _send_email(self, users, subject, message):
        recipients = [user.email for user in users if getattr(user, "email", "")]
        if not recipients:
            return
        try:
            enqueue_email(
                subject=subject,
                message=message,
                from_email=django_settings.DEFAULT_FROM_EMAIL,
                recipient_list=recipients,
                fail_silently=True,
            )
        except Exception:
            logger.exception("Failed to queue exhibit notification email.")
