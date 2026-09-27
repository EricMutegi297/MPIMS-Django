from ._shared import *


class CaseWorkflowsMixin:

    def perform_create(self, serializer):
        instance = serializer.save(created_by=self.request.user, status=Case.Status.NEW)
        accused_entries = list(instance.accused_entries.all())
        if len(accused_entries) > 1:
            self._create_duplicate_cases_for_accused(instance, accused_entries)
            self._send_tasking_notification(instance, created=True)
            self._log_action(instance, self.request.user, CaseActivityLog.Action.CASE_CREATED,
                             f"Case {instance.case_number} created")
        else:
            self._send_tasking_notification(instance, created=True)
            self._log_action(instance, self.request.user, CaseActivityLog.Action.CASE_CREATED,
                             f"Case {instance.case_number} created")

    def perform_update(self, serializer):
        instance = serializer.instance
        previous_status = instance.status
        previous_assigned_team_id = instance.assigned_team_id
        previous_assigned_to_id = instance.assigned_to_id
        previous_tasked_battalion_id = instance.tasked_battalion_id
        previous_tasked_detachment_id = instance.tasked_detachment_id
        previous_close_requested = instance.close_requested
        previous_traffic_accident_report = instance.traffic_accident_report.name if instance.traffic_accident_report else ""
        previous_rta_damage_authority = instance.rta_damage_authority.name if instance.rta_damage_authority else ""
        previous_served_abstract = instance.served_abstract.name if instance.served_abstract else ""
        case = serializer.save()
        current_traffic_accident_report = case.traffic_accident_report.name if case.traffic_accident_report else ""
        current_rta_damage_authority = case.rta_damage_authority.name if case.rta_damage_authority else ""

        if current_traffic_accident_report and current_traffic_accident_report != previous_traffic_accident_report:
            damage_label = "Yes" if case.rta_service_vehicle_damaged else "No"
            self._log_action(
                case,
                self.request.user,
                CaseActivityLog.Action.ATTACHMENT_UPLOADED,
                f"Traffic Accident Report attached. Service vehicle damaged: {damage_label}.",
            )
            self._send_rta_report_notification(case, self.request.user)

        if current_rta_damage_authority and current_rta_damage_authority != previous_rta_damage_authority:
            authority_label = dict(Case.RtaDamageAuthoritySource.choices).get(
                case.rta_damage_authority_source,
                case.rta_damage_authority_source or "Not specified",
            )
            self._log_action(
                case,
                self.request.user,
                CaseActivityLog.Action.ATTACHMENT_UPLOADED,
                f"RTA damage authority attached from {authority_label}.",
            )

        battalion_tasking_changed = (
            previous_tasked_battalion_id != case.tasked_battalion_id
            and case.tasked_battalion_id
        )
        if battalion_tasking_changed:
            self._send_tasking_notification(case, created=False)
            self._log_action(
                case,
                self.request.user,
                CaseActivityLog.Action.BATTALION_TASKED,
                f"Case {case.case_number} tasked to {case.tasked_battalion}",
            )

        detachment_tasking_changed = (
            previous_tasked_detachment_id != case.tasked_detachment_id
            and case.tasked_detachment_id
        )
        if detachment_tasking_changed:
            self._send_detachment_tasking_notification(case)
            self._log_action(
                case,
                self.request.user,
                CaseActivityLog.Action.DETACHMENT_TASKED,
                f"Case {case.case_number} tasked to {case.tasked_detachment}",
            )

        assignment_changed = (
            previous_assigned_team_id != case.assigned_team_id
            or previous_assigned_to_id != case.assigned_to_id
        )
        if assignment_changed:
            self._send_assignment_notification(case, self.request.user)

        if not previous_close_requested and case.close_requested:
            self._send_close_request_notification(case, self.request.user)
            self._log_action(
                case,
                self.request.user,
                CaseActivityLog.Action.CASE_UPDATED,
                f"Close requested for Case {case.case_number}",
            )

        current_served_abstract = case.served_abstract.name if case.served_abstract else ""
        if current_served_abstract and current_served_abstract != previous_served_abstract:
            self._notify_accused_unit_users(
                case,
                self.request.user,
                f"Case #{case.case_number} has been served with the abstract attached. Please upload the acknowledgement sheet to confirm receipt.",
            )
            self._log_action(case, self.request.user, CaseActivityLog.Action.CASE_UPDATED, f"Case {case.case_number} served awaiting unit acknowledgement")

        if previous_status != case.status:
            if case.status == Case.Status.SERVED:
                if not case.served_at:
                    case.served_at = timezone.now()
                    case.save(update_fields=["served_at"])
                self._send_served_notification(case, self.request.user)
                self._log_action(
                    case,
                    self.request.user,
                    CaseActivityLog.Action.CASE_UPDATED,
                    f"Case {case.case_number} served",
                )
            elif case.status == Case.Status.CLOSED:
                self._send_closed_notification(case)
                self._log_action(
                    case,
                    self.request.user,
                    CaseActivityLog.Action.CASE_UPDATED,
                    f"Case {case.case_number} closed",
                )

    def destroy(self, request, *args, **kwargs):
        can_delete = request.user.is_superuser or (
            request.user.role == User.Role.ADMIN and is_hqs_admin(request.user)
        )
        if not can_delete:
            raise PermissionDenied("Only HQ admin users can delete cases.")
        return super().destroy(request, *args, **kwargs)

    def _send_assignment_notification(self, case, actor):
        if case.assigned_to_id:
            assignee_label = self._actor_label(case.assigned_to)
            detail = f"Assigned IO {assignee_label}"
            message = (
                f"{self._actor_label(actor)} assigned Case #{case.case_number} "
                f"'{case.title}' to IO {assignee_label}."
            )
        elif case.assigned_team_id:
            team_name = case.assigned_team.name if case.assigned_team else "investigation team"
            detail = f"Assigned investigation team {team_name}"
            message = (
                f"{self._actor_label(actor)} assigned Case #{case.case_number} "
                f"'{case.title}' to investigation team {team_name}."
            )
        else:
            self._log_action(
                case,
                actor,
                CaseActivityLog.Action.TEAM_ASSIGNED,
                "Cleared investigation assignment",
            )
            return

        if case.investigation_deadline:
            detail = f"{detail}; deadline {case.investigation_deadline}"
            message = f"{message} Investigation deadline: {case.investigation_deadline}."

        self._log_action(case, actor, CaseActivityLog.Action.TEAM_ASSIGNED, detail)
        self._notify_team(case, actor=actor, message=message)

    def _create_duplicate_cases_for_accused(self, original_case, accused_entries):
        def suffix_for_index(index):
            letters = []
            while index >= 0:
                letters.append(chr(ord("A") + (index % 26)))
                index = index // 26 - 1
            return "".join(reversed(letters))

        with transaction.atomic():
            base_number = original_case.case_number
            original_case.accused_entries.all().delete()
            for index, accused in enumerate(accused_entries):
                suffix = suffix_for_index(index)
                if index == 0:
                    original_case.accused_entries.create(
                        name=(accused.name or "").strip(),
                        rank=(accused.rank or "").strip(),
                        service_number=(accused.service_number or "").strip(),
                        service=(accused.service or "").strip(),
                        unit=accused.unit,
                    )
                    original_case.accused_name = accused.name or ""
                    original_case.accused_rank = accused.rank or ""
                    original_case.accused_service_number = accused.service_number or ""
                    original_case.accused_service = accused.service or ""
                    original_case.accused_unit = accused.unit
                    original_case.case_number = f"{base_number}{suffix}"
                    original_case.save(update_fields=[
                        "accused_name",
                        "accused_rank",
                        "accused_service_number",
                        "accused_service",
                        "accused_unit",
                        "case_number",
                    ])
                    continue

                case_copy = Case.objects.get(pk=original_case.pk)
                case_copy.pk = None
                case_copy.case_number = f"{base_number}{suffix}"
                case_copy.accused_name = accused.name or ""
                case_copy.accused_rank = accused.rank or ""
                case_copy.accused_service_number = accused.service_number or ""
                case_copy.accused_service = accused.service or ""
                case_copy.accused_unit = accused.unit
                case_copy.save(force_insert=True)
                case_copy.accused_entries.create(
                    name=(accused.name or "").strip(),
                    rank=(accused.rank or "").strip(),
                    service_number=(accused.service_number or "").strip(),
                    service=(accused.service or "").strip(),
                    unit=accused.unit,
                )

    def _send_tasking_notification(self, case, created):
        if not case.tasked_battalion_id:
            return
        battalion_users = User.objects.filter(
            battalion_id=case.tasked_battalion_id,
            is_active=True,
        ).exclude(role__in=[
            User.Role.DETACHMENT,
            User.Role.DET_CMD,
            User.Role.PLT_CMD,
            User.Role.DET_TWO_IC,
            User.Role.CORPS_CMD,
        ])
        corps_commanders = User.objects.filter(role=User.Role.CORPS_CMD, is_active=True)
        if not battalion_users.exists() and not corps_commanders.exists():
            return
        case_ref = case.case_number or case.id
        msg = f"A new case (#{case_ref}) has been tasked to your battalion: {case.title}"
        if not created:
            msg = f"Case (#{case_ref}) has been newly tasked to your battalion: {case.title}"
        battalion_name = case.tasked_battalion.name if case.tasked_battalion else str(case.tasked_battalion_id)
        corps_msg = f"Case (#{case_ref}) has been tasked to {battalion_name}: {case.title}"
        notifications = [
            Notification(
                recipient=u,
                message=msg,
                notification_type=Notification.Type.CASE,
                related_model="case",
                related_id=case.id,
            ) for u in battalion_users
        ]
        notifications.extend(
            Notification(
                recipient=u,
                message=corps_msg,
                notification_type=Notification.Type.CASE,
                related_model="case",
                related_id=case.id,
            ) for u in corps_commanders
        )
        Notification.objects.bulk_create(notifications)

    def _notify_brief_recipients(self, case, actor, message):
        try:
            brief = case.brief
        except (CaseBrief.DoesNotExist, AttributeError):
            return

        battalion_id = self._case_battalion_id(case)
        detachment_id = self._case_detachment_id(actor, case)

        recipients = set()
        if brief.forwarded_to_role == CaseBrief.ForwardRole.HOD:
            recipients.update(
                User.objects.filter(role=User.Role.HOD, battalion_id=battalion_id, is_active=True)
            )
        elif brief.forwarded_to_role == CaseBrief.ForwardRole.CO:
            recipients.update(
                User.objects.filter(role=User.Role.CO, battalion_id=battalion_id, is_active=True)
            )
        elif brief.forwarded_to_role == CaseBrief.ForwardRole.OC:
            recipients.update(
                User.objects.filter(role=User.Role.OC, battalion_id=battalion_id, is_active=True)
            )
        elif brief.forwarded_to_role == CaseBrief.ForwardRole.CORPS_CMD:
            recipients.update(
                User.objects.filter(role=User.Role.CORPS_CMD, is_active=True)
            )
        elif brief.forwarded_to_role == CaseBrief.ForwardRole.DETACHMENT:
            recipients.update(
                User.objects.filter(
                    role__in=[
                        User.Role.DETACHMENT,
                        User.Role.DET_CMD,
                        User.Role.PLT_CMD,
                        User.Role.DET_TWO_IC,
                    ],
                    detachment_id=detachment_id,
                    is_active=True,
                )
            )
        elif brief.forwarded_to_role == CaseBrief.ForwardRole.ADJ:
            recipients.update(
                User.objects.filter(role=User.Role.ADJ, battalion_id=battalion_id, is_active=True)
            )
        elif brief.forwarded_to_role == CaseBrief.ForwardRole.TWO_IC:
            recipients.update(
                User.objects.filter(role=User.Role.TWO_IC, battalion_id=battalion_id, is_active=True)
            )
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
                    subject=f"[MPIMS] Case {case.case_number} — Brief Forwarded",
                    message=message,
                    from_email=django_settings.DEFAULT_FROM_EMAIL,
                    recipient_list=email_list,
                    fail_silently=True,
                )
            except Exception:
                logger.exception("Failed to queue brief-forward email for case %s.", case.pk)

    def _can_upload_back_brief(self, user):
        return bool(user and user.is_authenticated and (user.is_superuser or is_hqs_admin(user)))

    def _notify_back_brief_recipients(self, case, actor, back_brief):
        battalion_id = self._case_battalion_id(case)
        recipients = set()

        if case.assigned_to and case.assigned_to.is_active:
            recipients.add(case.assigned_to)

        if case.assigned_team_id:
            team = case.assigned_team
            if team.team_ic and team.team_ic.is_active:
                recipients.add(team.team_ic)
            for member in team.members.filter(is_active=True):
                recipients.add(member)

        if battalion_id:
            recipients.update(
                User.objects.filter(
                    role__in=[
                        User.Role.ADMIN,
                        User.Role.ADJ,
                        User.Role.HOD,
                        User.Role.CO,
                        User.Role.OC,
                        User.Role.TWO_IC,
                    ],
                    battalion_id=battalion_id,
                    is_active=True,
                )
            )

        recipients.update(User.objects.filter(role=User.Role.CORPS_CMD, is_active=True))

        if actor:
            recipients.discard(actor)
        if not recipients:
            return

        msg = (
            f"{self._actor_label(actor)} uploaded a back-brief for Case #{case.case_number}. "
            "The brief and back-brief are available for review and printing."
        )
        Notification.objects.bulk_create([
            Notification(
                recipient=user,
                message=msg,
                notification_type=Notification.Type.CASE,
                related_model="case",
                related_id=case.id,
            ) for user in recipients
        ])

        email_list = [user.email for user in recipients if user.email]
        if email_list:
            try:
                enqueue_email(
                    subject=f"[MPIMS] Case {case.case_number} - Back-Brief Uploaded",
                    message=msg,
                    from_email=django_settings.DEFAULT_FROM_EMAIL,
                    recipient_list=email_list,
                    fail_silently=True,
                )
            except Exception:
                logger.exception("Failed to queue back-brief email for case %s.", case.pk)

    def _notify_brief_approval_recipients(self, case, actor, brief):
        recipients = set(
            User.objects.filter(
                Q(is_superuser=True)
                | Q(
                    role__in=[User.Role.ADMIN, User.Role.MPC_HQS],
                    battalion__battalion_type=Battalion.BattalionType.HQS,
                ),
                is_active=True,
            )
        )
        if actor:
            recipients.discard(actor)
        if not recipients:
            return

        msg = (
            f"{self._actor_label(actor)} approved the brief for Case #{case.case_number}. "
            "HQ admin can now attach the back-brief."
        )
        Notification.objects.bulk_create([
            Notification(
                recipient=user,
                message=msg,
                notification_type=Notification.Type.CASE,
                related_model="case",
                related_id=case.id,
            ) for user in recipients
        ])

        email_list = [user.email for user in recipients if user.email]
        if email_list:
            try:
                enqueue_email(
                    subject=f"[MPIMS] Case {case.case_number} - Brief Approved",
                    message=msg,
                    from_email=django_settings.DEFAULT_FROM_EMAIL,
                    recipient_list=email_list,
                    fail_silently=True,
                )
            except Exception:
                logger.exception("Failed to queue brief-approval email for case %s.", case.pk)

    def _send_detachment_tasking_notification(self, case):
        """Notify all users in the tasked company (role=detachment as IC Cases)."""
        if not case.tasked_detachment_id:
            return
        # Notify users whose company record matches and whose role is 'detachment' (IC Cases).
        users = User.objects.filter(
            detachment_id=case.tasked_detachment_id,
            role="detachment",
            is_active=True,
        )
        if not users.exists():
            return
        det_name = case.tasked_detachment.name if case.tasked_detachment else str(case.tasked_detachment_id)
        msg = (
            f"Case #{case.case_number} — '{case.title}' has been tasked to {det_name}. "
            f"Please assign an investigation team."
        )
        Notification.objects.bulk_create([
            Notification(
                recipient=u,
                message=msg,
                notification_type=Notification.Type.CASE,
                related_model="case",
                related_id=case.id,
            ) for u in users
        ])

    def _send_served_notification(self, case, actor=None):
        """Notify HQ reviewers and accused-unit users that a case has been served."""
        hqs_admins = User.objects.filter(
            role="admin",
            battalion__battalion_type=Battalion.BattalionType.HQS,
            is_active=True,
        )
        recipients = set(hqs_admins)
        recipients.update(User.objects.filter(role=User.Role.CORPS_CMD, is_active=True))
        unit_ids = set(case.accused_entries.values_list("unit_id", flat=True))
        if case.accused_unit_id:
            unit_ids.add(case.accused_unit_id)
        unit_ids.discard(None)
        recipients.update(User.objects.filter(unit_id__in=unit_ids, is_active=True))
        if not recipients:
            return
        # Build actor attribution: "by Rank Name of Company/Battalion"
        if actor:
            actor_label = f"{actor.rank} {actor.name}".strip()
            if actor.detachment_id and actor.detachment:
                unit_label = actor.detachment.name
            elif actor.battalion_id and actor.battalion:
                unit_label = actor.battalion.name
            else:
                unit_label = None
            served_by = f" by {actor_label}" + (f" of {unit_label}" if unit_label else "")
        else:
            served_by = ""
        msg = (
            f"Case #{case.case_number} \u2014 '{case.title}' has been served{served_by} "
            f"and is awaiting closure."
        )
        Notification.objects.bulk_create([
            Notification(
                recipient=u,
                message=msg,
                notification_type=Notification.Type.CASE,
                related_model="case",
                related_id=case.id,
            ) for u in recipients
        ])

        email_list = [u.email for u in recipients if u.email]
        if email_list:
            try:
                enqueue_email(
                    subject=f"[MPIMS] Case Served — Case {case.case_number}",
                    message=msg,
                    from_email=django_settings.DEFAULT_FROM_EMAIL,
                    recipient_list=email_list,
                    fail_silently=True,
                )
            except Exception:
                logger.exception("Failed to queue case-tasking email for case %s.", case.pk)

    def _send_closed_notification(self, case):
        """Notify assigned team (IC + members), tasked battalion admin, and IC Cases if company-level."""
        recipients = set()
        if case.assigned_to and case.assigned_to.is_active:
            recipients.add(case.assigned_to)
        # Assigned team IC + members
        if case.assigned_team_id:
            try:
                team = case.assigned_team
                if team.team_ic and team.team_ic.is_active:
                    recipients.add(team.team_ic)
                for member in team.members.filter(is_active=True):
                    recipients.add(member)
            except Exception:
                pass

        # Admin of the tasked battalion
        if case.tasked_battalion_id:
            recipients.update(User.objects.filter(
                role="admin",
                battalion_id=case.tasked_battalion_id,
                is_active=True,
            ))

        # IC Cases if this is a company-level case.
        if case.tasked_detachment_id:
            recipients.update(User.objects.filter(
                role="detachment",
                detachment_id=case.tasked_detachment_id,
                is_active=True,
            ))

        recipients.update(User.objects.filter(role=User.Role.CORPS_CMD, is_active=True))

        if not recipients:
            return
        verdict = (case.action_taken or "").strip() or "Not provided."
        msg = (
            f"Case #{case.case_number} -- '{case.title}' has been officially closed. "
            f"Verdict: {verdict}"
        )
        Notification.objects.bulk_create([
            Notification(
                recipient=u,
                message=msg,
                notification_type=Notification.Type.CASE,
                related_model="case",
                related_id=case.id,
            ) for u in recipients
        ])

    def _send_case_update_notification(self, case, actor=None, update_date=None, update_text=""):
        """Notify HQ, tasked battalion/company, IO, and team members on case updates."""
        recipients = set()

        # HQ admins
        recipients.update(
            User.objects.filter(
                role="admin",
                battalion__battalion_type=Battalion.BattalionType.HQS,
                is_active=True,
            )
        )

        # Tasked battalion admins
        if case.tasked_battalion_id:
            recipients.update(
                User.objects.filter(
                    role="admin",
                    battalion_id=case.tasked_battalion_id,
                    is_active=True,
                )
            )

        # Tasked IC Cases users.
        if case.tasked_detachment_id:
            recipients.update(
                User.objects.filter(
                    role="detachment",
                    detachment_id=case.tasked_detachment_id,
                    is_active=True,
                )
            )

        # IO directly assigned to the case
        if case.assigned_to and case.assigned_to.is_active:
            recipients.add(case.assigned_to)

        # Team IO and members
        if case.assigned_team_id:
            team = case.assigned_team
            if team.team_ic and team.team_ic.is_active:
                recipients.add(team.team_ic)
            for member in team.members.filter(is_active=True):
                recipients.add(member)

        if actor:
            recipients.discard(actor)
        if not recipients:
            return

        actor_label = self._actor_label(actor)
        date_label = str(update_date) if update_date else "Not provided"
        trimmed_update = (update_text or "").strip()
        if len(trimmed_update) > 160:
            trimmed_update = f"{trimmed_update[:157]}..."

        offence_label = (
            case.offence_ref.name.strip()
            if case.offence_ref and case.offence_ref.name
            else (case.offence or "Not provided").strip() or "Not provided"
        )
        case_type_label = "DCI/Civ police" if case.criminal_offence_type == Case.CriminalOffenceType.DCI_CIV else case.get_criminal_offence_type_display()

        msg = (
            f"{actor_label} updated {case_type_label} Case No {case.case_number} "
            f"Offence {offence_label} On {date_label}. "
            f"Update: {trimmed_update or 'No details provided.'}"
        )

        Notification.objects.bulk_create([
            Notification(
                recipient=u,
                message=msg,
                notification_type=Notification.Type.CASE,
                related_model="case",
                related_id=case.id,
            ) for u in recipients
        ])

    def _send_close_request_notification(self, case, actor=None):
        """Notify HQ admins via dashboard notification and email when close is requested by team."""
        hq_admins = User.objects.filter(
            role="admin",
            battalion__battalion_type=Battalion.BattalionType.HQS,
            is_active=True,
        )
        if not hq_admins.exists():
            return

        actor_label = self._actor_label(actor)
        offence_label = (
            case.offence_ref.name.strip()
            if case.offence_ref and case.offence_ref.name
            else (case.offence or "Not provided").strip() or "Not provided"
        )
        msg = (
            f"{actor_label} requested close for DCI/Civ Police Case No {case.case_number}. "
            f"Offence: {offence_label}. Please review and close on HQ dashboard."
        )

        Notification.objects.bulk_create([
            Notification(
                recipient=u,
                message=msg,
                notification_type=Notification.Type.CASE,
                related_model="case",
                related_id=case.id,
            ) for u in hq_admins
        ])

        email_list = [u.email for u in hq_admins if u.email]
        if email_list:
            try:
                enqueue_email(
                    subject=f"[MPIMS] Close Request — Case {case.case_number}",
                    message=msg,
                    from_email=django_settings.DEFAULT_FROM_EMAIL,
                    recipient_list=email_list,
                    fail_silently=True,
                )
            except Exception:
                logger.exception("Failed to queue case-closure email for case %s.", case.pk)

    def _send_rta_report_notification(self, case, actor=None):
        """Notify HQ admins when IC Cases attaches the Traffic Accident Report."""
        recipients = set(User.objects.filter(
            Q(is_superuser=True)
            | Q(
                role__in=[User.Role.ADMIN, User.Role.MPC_HQS],
                battalion__battalion_type=Battalion.BattalionType.HQS,
            ),
            is_active=True,
        ))
        if actor:
            recipients.discard(actor)
        if not recipients:
            return

        damage_message = (
            "Service vehicle damage is recorded; attach HQ KA Moves or Legal authority before closure."
            if case.rta_service_vehicle_damaged
            else "No service vehicle damage is recorded; the case is ready for HQ closure review."
        )
        msg = (
            f"Traffic Accident Report for RTA Case No {case.case_number} has been attached by "
            f"{self._actor_label(actor)}. {damage_message}"
        )
        Notification.objects.bulk_create([
            Notification(
                recipient=user,
                message=msg,
                notification_type=Notification.Type.CASE,
                related_model="case",
                related_id=case.id,
            )
            for user in recipients
        ])

        email_list = [user.email for user in recipients if user.email]
        if email_list:
            try:
                enqueue_email(
                    subject=f"[MPIMS] Traffic Accident Report {case.case_number}",
                    message=msg,
                    from_email=django_settings.DEFAULT_FROM_EMAIL,
                    recipient_list=email_list,
                    fail_silently=True,
                )
            except Exception:
                logger.exception("Failed to queue RTA notification email for case %s.", case.pk)

    @action(detail=False, methods=["get"], url_path="detachment-summary")
    def detachment_summary(self, request):
        """
        Returns per-company case count breakdown for the requesting user's battalion.
        Accessible to battalion admins and superusers.
        Superusers must supply ?battalion=<id> query param.
        Returns: { battalion_id, detachments: [{id, name, company, under_investigation, pending, closed, total}] }
        """
        from apps.formations.models import Company

        user = request.user

        if user.is_superuser:
            battalion_id = request.query_params.get("battalion")
            if not battalion_id:
                return Response(
                    {"detail": "Supply ?battalion=<id> to specify a battalion."},
                    status=http_status.HTTP_400_BAD_REQUEST,
                )
            base_qs = Case.objects.all()
        elif is_battalion_command(user):
            battalion_id = user.battalion_id
            base_qs = self.get_queryset()
        else:
            return Response(
                {"detail": "Only battalion command users can access this endpoint."},
                status=http_status.HTTP_403_FORBIDDEN,
            )

        companies = Company.objects.filter(battalion_id=battalion_id).order_by("name")
        summary = []
        for company in companies:
            company_qs = base_qs.filter(
                Q(tasked_company_id=company.id)
                | Q(tasked_detachment__company_id=company.id)
            ).distinct()
            summary.append({
                "id": company.id,
                "name": company.name,
                "company": company.company,
                "tasked": company_qs.filter(status=Case.Status.TASKED).count(),
                "under_investigation": company_qs.filter(status=Case.Status.UNDER_INVESTIGATION).count(),
                "pending": company_qs.filter(status=Case.Status.PENDING).count(),
                "closed": company_qs.filter(status=Case.Status.CLOSED).count(),
                "total": company_qs.count(),
            })

        return Response({"battalion_id": battalion_id, "detachments": summary})
