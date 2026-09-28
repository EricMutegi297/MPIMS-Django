from ._shared import *
from ..uploads import validate_case_upload


class CaseAccessMixin:

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        command_write_allowed = (
            getattr(self, "action", None) == "approve_brief"
            and request.method == "POST"
            and getattr(request.user, "role", None) == User.Role.CORPS_CMD
        ) or (
            getattr(self, "action", None) == "brief"
            and request.method == "PATCH"
            and getattr(request.user, "role", None) == User.Role.ADJ
        ) or (
            getattr(self, "action", None) in {"acknowledge", "request_closure", "clearance_certificate"}
            and request.method == "POST"
            and is_unit_level_case_viewer(request.user)
        )
        if should_block_command_write(request.user, request.method) and not command_write_allowed:
            raise PermissionDenied(command_read_only_message(request.user))

    def _can_view_case_progress(self, user, case_obj):
        if not user or not user.is_authenticated:
            return False
        if has_global_read_access(user):
            return True
        if is_unit_level_case_viewer(user):
            return (
                case_obj.accused_unit_id == user.unit_id
                or case_obj.accused_entries.filter(unit_id=user.unit_id).exists()
                or (
                    case_obj.accused_unit_id is None
                    and case_obj.submitting_unit_id == user.unit_id
                )
            )
        if user.role == User.Role.INVESTIGATOR:
            if case_obj.assigned_to_id == user.id:
                return True
            if case_obj.assigned_team_id:
                team = case_obj.assigned_team
                return bool(team and (team.team_ic_id == user.id or team.members.filter(id=user.id).exists()))
            return False
        if is_company_command(user):
            company_id = user.detachment.company_id
            return bool(
                case_obj.tasked_company_id == company_id
                or getattr(getattr(case_obj, "tasked_detachment", None), "company_id", None) == company_id
                or getattr(getattr(getattr(case_obj, "assigned_to", None), "detachment", None), "company_id", None) == company_id
                or getattr(getattr(getattr(case_obj, "assigned_team", None), "detachment", None), "company_id", None) == company_id
            )
        if case_obj.tasked_battalion_id and user.battalion_id == case_obj.tasked_battalion_id:
            return True
        if case_obj.tasked_detachment_id and user.battalion_id == getattr(case_obj.tasked_detachment, "battalion_id", None):
            return True
        if case_obj.tasked_detachment_id and user.detachment_id == case_obj.tasked_detachment_id:
            return True
        if case_obj.assigned_to_id == user.id:
            return True
        if case_obj.assigned_team_id:
            team = case_obj.assigned_team
            if team and (team.team_ic_id == user.id or team.members.filter(id=user.id).exists()):
                return True
        return False

    def get_queryset(self):
        user = self.request.user
        base_qs = Case.objects.select_related(
            "assigned_to",
            "created_by",
            "accused_unit",
            "submitting_unit",
            "tasked_battalion",
            "tasked_company",
            "tasked_detachment",
            "source_incident",
        ).prefetch_related(
            "accused_entries",
            "extra_attachments",
            "court_martial_hearings",
            "court_martial_milestones",
            Prefetch(
                "activity_logs",
                queryset=CaseActivityLog.objects.filter(
                    action=CaseActivityLog.Action.CASE_UPDATED
                ).order_by("-created_at"),
                to_attr="case_update_logs",
            ),
        )

        if not user.is_authenticated:
            return base_qs.none()

        if has_global_read_access(user):
            return self._prepare_case_queryset(base_qs.all())

        if is_unit_level_case_viewer(user):
            return self._prepare_case_queryset(base_qs.filter(unit_case_scope_q(user)).distinct())

        if user.role == User.Role.INVESTIGATOR:
            return self._prepare_case_queryset(base_qs.filter(
                Q(assigned_to=user)
                | Q(assigned_team__team_ic=user)
                | Q(assigned_team__members=user)
            ).distinct())

        if is_company_command(user):
            return self._prepare_case_queryset(
                base_qs.filter(company_case_scope_q(user)).distinct()
            )

        # Battalion command users see cases tasked to their battalion or its companies.
        if is_battalion_command(user):
            return self._prepare_case_queryset(base_qs.filter(
                battalion_scope_q(
                    user,
                    battalion_field="tasked_battalion_id",
                    detachment_field="tasked_detachment",
                )
                | Q(assigned_to__battalion_id=user.battalion_id)
                | Q(assigned_to__detachment__company__battalion_id=user.battalion_id)
                | Q(assigned_team__battalion_id=user.battalion_id)
                | Q(assigned_team__detachment__company__battalion_id=user.battalion_id)
            ).distinct())

        # Detachment roles see cases assigned to their own detachment only.
        if is_detachment_ic(user) and user.detachment_id:
            return self._prepare_case_queryset(base_qs.filter(
                Q(tasked_detachment_id=user.detachment_id)
                | Q(assigned_to__detachment_id=user.detachment_id)
                | Q(assigned_team__detachment_id=user.detachment_id)
            ).distinct())

        if user.battalion_id:
            return self._prepare_case_queryset(base_qs.filter(
                Q(tasked_battalion_id=user.battalion_id)
                | Q(tasked_detachment__company__battalion_id=user.battalion_id)
                | Q(assigned_to=user)
                | Q(assigned_team__team_ic=user)
                | Q(assigned_team__members=user)
            ).distinct())

        return self._prepare_case_queryset(base_qs.filter(assigned_to=user))

    def _log_action(self, case, actor, action, detail=""):
        CaseActivityLog.objects.create(case=case, actor=actor, action=action, detail=detail)

    def _actor_label(self, actor):
        if not actor:
            return "System"
        parts = [p for p in [actor.rank, actor.name] if p]
        return " ".join(parts) or actor.service_number

    def _notify_team(self, case, actor, message):
        """Create dashboard notifications + send email to every active IO / team member / IC,
        excluding the actor who triggered the action."""
        recipients = set()
        if case.assigned_to and case.assigned_to.is_active:
            recipients.add(case.assigned_to)
        if case.assigned_team_id:
            try:
                team = case.assigned_team
            except Exception:
                team = None
            if team:
                if team.team_ic and team.team_ic.is_active:
                    recipients.add(team.team_ic)
                for m in team.members.filter(is_active=True):
                    recipients.add(m)
        if actor:
            recipients.discard(actor)
        if not recipients:
            return
        Notification.objects.bulk_create([
            Notification(
                recipient=u,
                message=message,
                notification_type=Notification.Type.CASE,
                related_model="case",
                related_id=case.id,
            ) for u in recipients
        ])
        email_list = [u.email for u in recipients if u.email]
        if email_list:
            try:
                enqueue_email(
                    subject=f"[MPIMS] Case {case.case_number} — Activity",
                    message=message,
                    from_email=django_settings.DEFAULT_FROM_EMAIL,
                    recipient_list=email_list,
                    fail_silently=True,
                )
            except Exception:
                logger.exception("Failed to queue case activity email for case %s.", case.pk)

    def _is_hq_admin_or_superuser(self, user):
        if not user or not user.is_authenticated:
            return False
        return has_global_read_access(user)

    def _can_manage_court_martial_progress(self, user, case_obj):
        if not user or not user.is_authenticated:
            return False
        if self._is_hq_admin_or_superuser(user):
            return True
        if case_obj.assigned_to_id and case_obj.assigned_to_id == user.id:
            return True
        team = getattr(case_obj, "assigned_team", None)
        if not team:
            return False
        if team.team_ic_id and team.team_ic_id == user.id:
            return True
        return team.members.filter(id=user.id).exists()

    def _can_set_court_martial_schedule(self, user, case_obj):
        if self._can_manage_court_martial_progress(user, case_obj):
            return True
        if case_obj.assigned_to_id and case_obj.assigned_to_id == getattr(user, "id", None):
            return True
        if user and user.is_authenticated and user.role == "investigator":
            return self._can_view_case_progress(user, case_obj)
        return False

    def _can_edit_court_action_remarks(self, user, case_obj):
        if not user or not user.is_authenticated:
            return False
        # Team IC or team members can edit court action remarks
        team = getattr(case_obj, "assigned_team", None)
        if team and (team.team_ic_id == user.id or team.members.filter(id=user.id).exists()):
            return True
        # Assigned investigator can edit
        if case_obj.assigned_to_id and case_obj.assigned_to_id == user.id:
            return True
        # Allow HQ Admins and superusers to edit action remarks
        if user.is_superuser or is_hqs_admin(user):
            return True
        return False

    def _can_request_close(self, user, case_obj):
        if not user or not user.is_authenticated:
            return False
        if case_obj.assigned_to_id and case_obj.assigned_to_id == user.id:
            return True
        team = getattr(case_obj, "assigned_team", None)
        if not team:
            return False
        return team.team_ic_id == user.id or team.members.filter(id=user.id).exists()

    def _can_manage_unit_service(self, user, case_obj):
        return bool(
            is_unit_level_case_viewer(user)
            and case_obj.criminal_offence_type not in {
                Case.CriminalOffenceType.DCI_CIV,
            }
            and (
                case_obj.accused_unit_id == user.unit_id
                or case_obj.accused_entries.filter(unit_id=user.unit_id).exists()
                or (
                    case_obj.accused_unit_id is None
                    and case_obj.submitting_unit_id == user.unit_id
                )
            )
        )

    def _notify_hq_reviewers(self, case, actor, message):
        recipients = set(User.objects.filter(
            is_active=True,
            role__in=[User.Role.ADMIN, User.Role.MPC_HQS],
            battalion__battalion_type="hqs",
        ))
        recipients.update(User.objects.filter(is_active=True, is_superuser=True))
        recipients.discard(actor)
        if not recipients:
            return
        Notification.objects.bulk_create([
            Notification(
                recipient=recipient,
                message=message,
                notification_type=Notification.Type.CASE,
                related_model="case",
                related_id=case.id,
            )
            for recipient in recipients
        ])
        email_list = [recipient.email for recipient in recipients if recipient.email]
        if email_list:
            enqueue_email(
                subject=f"[MPIMS] Case {case.case_number} — Unit service workflow",
                message=message,
                from_email=django_settings.DEFAULT_FROM_EMAIL,
                recipient_list=email_list,
                fail_silently=True,
            )

    def _notify_accused_unit_users(self, case, actor, message):
        unit_ids = set(case.accused_entries.values_list("unit_id", flat=True))
        if case.accused_unit_id:
            unit_ids.add(case.accused_unit_id)
        unit_ids.discard(None)
        if not unit_ids:
            return
        recipients = set(User.objects.filter(is_active=True, unit_id__in=unit_ids))
        recipients.discard(actor)
        if not recipients:
            return
        Notification.objects.bulk_create([
            Notification(
                recipient=recipient,
                message=message,
                notification_type=Notification.Type.CASE,
                related_model="case",
                related_id=case.id,
            )
            for recipient in recipients
        ])
        email_list = [recipient.email for recipient in recipients if recipient.email]
        if email_list:
            enqueue_email(
                subject=f"[MPIMS] Case {case.case_number} — Unit service workflow",
                message=message,
                from_email=django_settings.DEFAULT_FROM_EMAIL,
                recipient_list=email_list,
                fail_silently=True,
            )

    def _can_manage_case_brief(self, user, case_obj):
        if not user or not user.is_authenticated:
            return False
        if has_global_read_access(user):
            return True
        if user.role == User.Role.COMPANY_CMD:
            return Case.objects.filter(pk=case_obj.pk).filter(company_case_scope_q(user)).exists()
        if case_obj.assigned_to_id == user.id:
            return True
        team = getattr(case_obj, "assigned_team", None)
        if team and (team.team_ic_id == user.id or team.members.filter(id=user.id).exists()):
            return True
        return False

    def _case_media_name_from_param(self, value):
        raw_value = str(value or "").strip()
        if not raw_value:
            raise ValidationError({"path": "File path is required."})

        parsed = urlparse(raw_value)
        raw_path = parsed.path if parsed.scheme or parsed.netloc else raw_value.split("?", 1)[0]
        raw_path = unquote(raw_path).replace("\\", "/").lstrip("/")

        media_prefix = django_settings.MEDIA_URL.lstrip("/")
        if media_prefix and raw_path.startswith(media_prefix):
            raw_path = raw_path[len(media_prefix):]

        path = PurePosixPath(raw_path)
        if (
            not raw_path
            or raw_path.startswith("/")
            or ".." in path.parts
            or not raw_path.startswith("cases/")
        ):
            raise ValidationError({"path": "Invalid case file path."})
        return raw_path

    def _case_file_scope_q(self, media_name):
        return (
            Q(rfi_document=media_name)
            | Q(tasking_letter=media_name)
            | Q(chargesheet=media_name)
            | Q(part_one_orders=media_name)
            | Q(served_abstract=media_name)
            | Q(abstract_acknowledgement_form=media_name)
            | Q(traffic_accident_report=media_name)
            | Q(rta_damage_authority=media_name)
            | Q(clearance_certificate=media_name)
            | Q(extra_attachments__file=media_name)
            | Q(brief__file=media_name)
            | Q(brief__back_brief__file=media_name)
            | Q(activity_logs__reference_pdf=media_name)
            | Q(exhibit_storage_requests__photo=media_name)
            | Q(exhibit_storage_requests__lifecycle_attachment=media_name)
        )

    @action(
        detail=True,
        methods=["post"],
        url_path="acknowledge",
        parser_classes=[MultiPartParser, FormParser],
    )
    def acknowledge(self, request, pk=None):
        case = self.get_object()
        if case.status not in {Case.Status.UNDER_INVESTIGATION, Case.Status.SERVED} or not case.served_abstract:
            raise ValidationError({"detail": "The case must have a served abstract before acknowledgement."})
        if case.abstract_acknowledged_at:
            raise ValidationError({"detail": "This abstract has already been acknowledged."})
        case.abstract_acknowledged_at = timezone.now()
        case.abstract_acknowledged_by = request.user
        form = request.FILES.get("abstract_acknowledgement_form")
        if form:
            validate_case_upload(
                form,
                field_name="abstract_acknowledgement_form",
                allowed_extensions={".pdf"},
            )
            case.abstract_acknowledgement_form = form
        case.status = Case.Status.SERVED
        case.served_at = timezone.now()
        case.save(update_fields=[
            "status", "served_at", "abstract_acknowledged_at", "abstract_acknowledged_by",
            "abstract_acknowledgement_form", "updated_at",
        ])
        self._log_action(case, request.user, CaseActivityLog.Action.CASE_UPDATED, "Unit acknowledged receipt of abstract")
        self._send_served_notification(case, request.user)
        self._notify_hq_reviewers(
            case,
            request.user,
            f"{self._actor_label(request.user)} acknowledged receipt of the abstract for Case #{case.case_number}.",
        )
        return Response(CaseSerializer(case, context={"request": request}).data)
