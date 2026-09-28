from ._shared import *
from ..services import approve_case_brief, forward_case_brief


class CaseRecordsMixin:

    @action(
        detail=False,
        methods=["get"],
        url_path="briefable-cases",
        parser_classes=[JSONParser],
    )
    def briefable_cases(self, request):
        if request.user.role not in {User.Role.INVESTIGATOR, User.Role.COMPANY_CMD}:
            return Response([])
        qs = self.get_queryset().select_related(
            "assigned_to",
            "assigned_team",
            "assigned_team__team_ic",
            "tasked_battalion",
            "tasked_detachment",
            "accused_unit",
        ).prefetch_related("assigned_team__members", "accused_entries")
        qs = self._brief_case_scope(request.user, qs).filter(brief__isnull=True).exclude(status=Case.Status.CLOSED).order_by("-created_at")
        serializer = CaseSerializer(qs, many=True, context={"request": request})
        return Response(serializer.data)

    @action(
        detail=False,
        methods=["get"],
        url_path="briefs",
        parser_classes=[JSONParser],
    )
    def briefs(self, request):
        qs = self.get_queryset().select_related(
            "assigned_to",
            "assigned_team",
            "assigned_team__team_ic",
            "tasked_battalion",
            "tasked_detachment",
            "accused_unit",
            "brief",
            "brief__attached_by",
            "brief__forwarded_by",
            "brief__approved_by",
        ).prefetch_related(
            "assigned_team__members",
            "accused_entries",
            "brief__forward_history",
            "brief__forward_history__forwarded_by",
        )
        qs = self._brief_case_scope(request.user, qs).filter(brief__isnull=False)
        qs = self._brief_visible_scope(request.user, qs).order_by("-brief__updated_at")
        serializer = CaseSerializer(qs, many=True, context={"request": request})
        return Response(serializer.data)

    @action(
        detail=False,
        methods=["get"],
        url_path="back-briefs",
        parser_classes=[JSONParser],
    )
    def back_briefs(self, request):
        qs = self.get_queryset().select_related(
            "assigned_to",
            "assigned_team",
            "assigned_team__team_ic",
            "tasked_battalion",
            "tasked_detachment",
            "accused_unit",
            "brief",
            "brief__attached_by",
            "brief__forwarded_by",
            "brief__approved_by",
            "brief__back_brief",
            "brief__back_brief__uploaded_by",
        ).prefetch_related(
            "assigned_team__members",
            "accused_entries",
            "brief__forward_history",
            "brief__forward_history__forwarded_by",
        )
        qs = qs.filter(brief__isnull=False)

        if self._can_upload_back_brief(request.user):
            serializer = CaseSerializer(qs.order_by("-brief__updated_at"), many=True, context={"request": request})
            return Response(serializer.data)

        if request.user.role == User.Role.INVESTIGATOR:
            qs = self._brief_case_scope(request.user, qs)
        elif is_detachment_ic(request.user):
            if not request.user.detachment_id:
                qs = qs.none()
            else:
                qs = qs.filter(
                    Q(tasked_detachment_id=request.user.detachment_id)
                    | Q(assigned_to__detachment_id=request.user.detachment_id)
                    | Q(assigned_team__detachment_id=request.user.detachment_id)
                ).distinct()
        else:
            qs = self._brief_visible_scope(request.user, qs)

        serializer = CaseSerializer(qs.order_by("-brief__back_brief__uploaded_at", "-brief__updated_at"), many=True, context={"request": request})
        return Response(serializer.data)

    @action(
        detail=True,
        methods=["get", "post", "patch"],
        url_path="brief",
        parser_classes=[MultiPartParser, FormParser],
    )
    def brief(self, request, pk=None):
        case = self.get_object()
        if request.method == "GET":
            if not hasattr(case, "brief"):
                return Response(None, status=http_status.HTTP_204_NO_CONTENT)
            if not self._can_view_case_brief(request.user, case, case.brief):
                raise PermissionDenied("This brief has not been forwarded to your role.")
            serializer = CaseBriefSerializer(case.brief, context={"request": request})
            return Response(serializer.data)

        if request.method == "POST" or request.FILES.get("file"):
            ensure_case_accepts_file_changes(case)

        data = request.data.copy()
        if request.method == "POST":
            allowed_creator = request.user.role in {
                User.Role.INVESTIGATOR,
                User.Role.COMPANY_CMD,
            }
            if not allowed_creator or not self._can_manage_case_brief(request.user, case):
                raise PermissionDenied(
                    "Only assigned investigators or the Company Commander for this case can create briefs."
                )
        if request.method == "POST" and hasattr(case, "brief"):
            return Response(
                {"detail": "A brief already exists for this case. Use forwarding or update instead."},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        if request.method == "PATCH" and not hasattr(case, "brief"):
            return Response(
                {"detail": "No brief exists for this case to update or forward."},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        had_brief = hasattr(case, "brief")
        is_forward = request.method == "PATCH" and bool(data.get("forwarded_to_role"))
        if is_forward:
            if not had_brief:
                raise PermissionDenied("No brief exists for this case to forward.")
            requested_role = data.get("forwarded_to_role")
            allowed_roles = self._brief_forward_allowed_roles(request.user, case, case.brief)
            if requested_role not in allowed_roles:
                duplicate = self._brief_duplicate_forward(case.brief, requested_role)
                if duplicate:
                    forwarded_by = self._actor_label(duplicate.forwarded_by) if duplicate.forwarded_by else "another user"
                    target_label = self._brief_forward_label(requested_role)
                    raise ValidationError({
                        "detail": (
                            f"This brief was already forwarded to {target_label} by {forwarded_by}. "
                            f"Edit the brief before forwarding to {target_label} again."
                        )
                    })
                raise PermissionDenied("You cannot forward this brief to that role at this stage.")
        elif request.method == "PATCH":
            if not self._can_edit_case_brief(request.user, case, case.brief):
                raise PermissionDenied("You cannot edit this brief at this stage.")
        if had_brief:
            serializer = CaseBriefSerializer(case.brief, data=data, partial=True, context={"request": request})
        else:
            serializer = CaseBriefSerializer(data=data, context={"request": request})

        serializer.is_valid(raise_exception=True)
        if had_brief:
            brief = serializer.save()
        else:
            brief = serializer.save(case=case, attached_by=request.user)

        if is_forward:
            brief = forward_case_brief(brief, request.user)
            action = CaseActivityLog.Action.BRIEF_FORWARDED
            detail = f"Forwarded brief to {brief.get_forwarded_to_role_display()}"
            self._notify_brief_recipients(
                case,
                request.user,
                f"{self._actor_label(request.user)} forwarded brief for Case #{case.case_number} to {brief.get_forwarded_to_role_display()}."
            )
        else:
            action = CaseActivityLog.Action.BRIEF_ATTACHED if request.method == "POST" and not had_brief else CaseActivityLog.Action.BRIEF_UPDATED
            detail = f"{'Attached' if action == CaseActivityLog.Action.BRIEF_ATTACHED else 'Updated'} brief"
            if request.method == "PATCH" and had_brief:
                update_fields = ["revision", "updated_at"]
                brief.revision = (brief.revision or 1) + 1
                editor_stage = self._brief_forward_target_for_role(request.user)
                if request.user.role == User.Role.INVESTIGATOR:
                    brief.status = CaseBrief.Status.DRAFT
                    brief.forwarded_to_role = ""
                    update_fields.extend(["status", "forwarded_to_role"])
                elif editor_stage:
                    brief.status = CaseBrief.Status.FORWARDED
                    brief.forwarded_to_role = editor_stage
                    update_fields.extend(["status", "forwarded_to_role"])
                if brief.approved_at:
                    brief.approved_by = None
                    brief.approved_at = None
                    brief.approved_note = ""
                    update_fields.extend(["approved_by", "approved_at", "approved_note"])
                brief.save(update_fields=update_fields)

        if not is_forward:
            self._log_action(case, request.user, action, detail)
        return Response(CaseBriefSerializer(brief, context={"request": request}).data, status=http_status.HTTP_200_OK)

    @action(
        detail=True,
        methods=["post"],
        url_path="brief/approve",
        parser_classes=[JSONParser],
    )
    def approve_brief(self, request, pk=None):
        if request.user.role != User.Role.CORPS_CMD:
            raise PermissionDenied("Only Corps Commander can approve briefs for back-brief attachment.")

        case = self.get_object()
        ensure_case_accepts_file_changes(case)
        if not hasattr(case, "brief"):
            return Response(
                {"detail": "No brief exists for this case."},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        brief = case.brief
        if not self._can_view_case_brief(request.user, case, brief):
            raise PermissionDenied("This brief has not been forwarded to Corps Commander.")
        brief = approve_case_brief(
            brief,
            request.user,
            request.data.get("approved_note") or request.data.get("note"),
        )
        self._notify_brief_approval_recipients(case, request.user, brief)
        return Response(CaseBriefSerializer(brief, context={"request": request}).data, status=http_status.HTTP_200_OK)

    @action(
        detail=True,
        methods=["post"],
        url_path="back-brief",
        parser_classes=[MultiPartParser, FormParser],
    )
    def back_brief(self, request, pk=None):
        if not self._can_upload_back_brief(request.user):
            raise PermissionDenied("Only HQ admin users can upload back-briefs.")

        case = self.get_object()
        if not hasattr(case, "brief"):
            return Response(
                {"detail": "No brief exists for this case."},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        if hasattr(case.brief, "back_brief"):
            return Response(
                {"detail": "A back-brief has already been attached to this brief."},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        if not case.brief.approved_at:
            return Response(
                {"detail": "Back-brief can only be attached after the brief has been approved by Corps Commander."},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        serializer = CaseBackBriefSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        back_brief = serializer.save(brief=case.brief, uploaded_by=request.user)
        self._log_action(case, request.user, CaseActivityLog.Action.BRIEF_UPDATED, "Uploaded back-brief")
        self._notify_back_brief_recipients(case, request.user, back_brief)
        return Response(
            CaseBackBriefSerializer(back_brief, context={"request": request}).data,
            status=http_status.HTTP_201_CREATED,
        )

    @action(
        detail=True,
        methods=["delete"],
        url_path=r"attachments/(?P<att_pk>[^/.]+)",
        parser_classes=[JSONParser],
    )
    def delete_attachment(self, request, pk=None, att_pk=None):
        case = self.get_object()
        ensure_case_accepts_file_changes(case)
        try:
            att = case.extra_attachments.get(pk=att_pk)
            filename = att.file.name.split("/")[-1] if att.file else str(att_pk)
            label = att.label or filename
            att.file.delete(save=False)
            att.delete()
            self._log_action(case, request.user, CaseActivityLog.Action.ATTACHMENT_DELETED,
                             f"Deleted '{label}'")
            actor_label = self._actor_label(request.user)
            self._notify_team(
                case, actor=request.user,
                message=(
                    f"{actor_label} deleted attachment '{label}' from Case #{case.case_number} "
                    f"— '{case.title}'."
                ),
            )
            return Response(status=http_status.HTTP_204_NO_CONTENT)
        except CaseAttachment.DoesNotExist:
            return Response({"detail": "Not found."}, status=http_status.HTTP_404_NOT_FOUND)

    @action(
        detail=True,
        methods=["get", "post"],
        url_path="court-milestones",
        parser_classes=[JSONParser],
    )
    def court_milestones(self, request, pk=None):
        case = self.get_object()
        if case.criminal_offence_type != Case.CriminalOffenceType.COURT_MARTIAL:
            return Response(
                {"detail": "Court milestones are only available for Court Martial cases."},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        if not self._can_set_court_martial_schedule(request.user, case):
            return Response(
                {"detail": "Only investigator/team IO/members or HQ admins can manage Court Martial milestones."},
                status=http_status.HTTP_403_FORBIDDEN,
            )

        if request.method == "GET":
            qs = case.court_martial_milestones.select_related("created_by", "action_recorded_by").all()
            serializer = CaseCourtMartialMilestoneSerializer(qs, many=True)
            return Response(serializer.data)

        serializer = CaseCourtMartialMilestoneSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        milestone = serializer.save(case=case, created_by=request.user)
        self._log_action(
            case,
            request.user,
            CaseActivityLog.Action.CASE_UPDATED,
            f"Added {milestone.milestone_type} date {milestone.scheduled_date}",
        )
        return Response(CaseCourtMartialMilestoneSerializer(milestone).data, status=http_status.HTTP_201_CREATED)

    @action(
        detail=True,
        methods=["patch", "delete"],
        url_path=r"court-milestones/(?P<milestone_pk>[^/.]+)",
        parser_classes=[JSONParser],
    )
    def court_milestone_detail(self, request, pk=None, milestone_pk=None):
        case = self.get_object()
        if case.criminal_offence_type != Case.CriminalOffenceType.COURT_MARTIAL:
            return Response(
                {"detail": "Court milestones are only available for Court Martial cases."},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        if not self._can_set_court_martial_schedule(request.user, case):
            return Response(
                {"detail": "Only investigator/team IO/members or HQ admins can manage Court Martial milestones."},
                status=http_status.HTTP_403_FORBIDDEN,
            )

        try:
            milestone = case.court_martial_milestones.get(pk=milestone_pk)
        except CaseCourtMartialMilestone.DoesNotExist:
            return Response({"detail": "Not found."}, status=http_status.HTTP_404_NOT_FOUND)

        if request.method == "DELETE":
            detail = f"Deleted {milestone.milestone_type} date {milestone.scheduled_date}"
            milestone.delete()
            self._log_action(case, request.user, CaseActivityLog.Action.CASE_UPDATED, detail)
            return Response(status=http_status.HTTP_204_NO_CONTENT)

        serializer = CaseCourtMartialMilestoneSerializer(milestone, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        updating_action_remarks = "action_remarks" in request.data
        if updating_action_remarks:
            if not self._can_edit_court_action_remarks(request.user, case):
                return Response(
                    {"detail": "Only team IO/members can edit Court Action / Remarks."},
                    status=http_status.HTTP_403_FORBIDDEN,
                )
            latest = self._latest_court_milestone(case)
            if not latest or latest.id != milestone.id:
                return Response(
                    {"detail": "Court Action / Remarks can only be edited on the most current milestone."},
                    status=http_status.HTTP_400_BAD_REQUEST,
                )

        previous_action_remarks = milestone.action_remarks or ""
        updated = serializer.save()
        new_action_remarks = (updated.action_remarks or "").strip()
        if new_action_remarks and new_action_remarks != previous_action_remarks.strip():
            updated.action_recorded_by = request.user
            updated.action_recorded_at = timezone.now()
            updated.save(update_fields=["action_recorded_by", "action_recorded_at", "updated_at"])

            # If this is a JUDGMENT milestone and the case is not already closed,
            # mark the case as ready to be explicitly closed by HQ (can_be_closed=True).
            try:
                from apps.cases.models import CaseCourtMartialMilestone
            except Exception:
                CaseCourtMartialMilestone = None

            if (
                CaseCourtMartialMilestone
                and getattr(updated, "milestone_type", None) == CaseCourtMartialMilestone.MilestoneType.JUDGMENT
                and updated.action_recorded_at
                and case.status != Case.Status.CLOSED
            ):
                # Set the flag without touching other fields
                case.can_be_closed = True
                case.save(update_fields=["can_be_closed", "updated_at"])

        self._log_action(
            case,
            request.user,
            CaseActivityLog.Action.CASE_UPDATED,
            f"Updated {updated.milestone_type} milestone",
        )
        return Response(CaseCourtMartialMilestoneSerializer(updated).data)

    @action(
        detail=True,
        methods=["get", "post"],
        url_path="court-hearings",
        parser_classes=[JSONParser],
    )
    def court_hearings(self, request, pk=None):
        case = self.get_object()
        if case.criminal_offence_type != Case.CriminalOffenceType.COURT_MARTIAL:
            return Response(
                {"detail": "Court hearings are only available for Court Martial cases."},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        if not self._can_manage_court_martial_progress(request.user, case):
            return Response(
                {"detail": "Only team IO/members or HQ admins can manage Court Martial hearings."},
                status=http_status.HTTP_403_FORBIDDEN,
            )

        if request.method == "GET":
            qs = case.court_martial_hearings.select_related("created_by").all()
            serializer = CaseCourtMartialHearingSerializer(qs, many=True)
            return Response(serializer.data)

        if case.status not in {Case.Status.SERVED, Case.Status.CLOSED}:
            return Response(
                {"detail": "Hearing dates can be recorded after the case is served."},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        serializer = CaseCourtMartialHearingSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        hearing = serializer.save(case=case, created_by=request.user)
        self._log_action(
            case,
            request.user,
            CaseActivityLog.Action.CASE_UPDATED,
            f"Added hearing date {hearing.hearing_date}",
        )
        return Response(CaseCourtMartialHearingSerializer(hearing).data, status=http_status.HTTP_201_CREATED)

    @action(
        detail=True,
        methods=["patch", "delete"],
        url_path=r"court-hearings/(?P<hearing_pk>[^/.]+)",
        parser_classes=[JSONParser],
    )
    def court_hearing_detail(self, request, pk=None, hearing_pk=None):
        case = self.get_object()
        if case.criminal_offence_type != Case.CriminalOffenceType.COURT_MARTIAL:
            return Response(
                {"detail": "Court hearings are only available for Court Martial cases."},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        if not self._can_manage_court_martial_progress(request.user, case):
            return Response(
                {"detail": "Only team IO/members or HQ admins can manage Court Martial hearings."},
                status=http_status.HTTP_403_FORBIDDEN,
            )
        try:
            hearing = case.court_martial_hearings.get(pk=hearing_pk)
        except CaseCourtMartialHearing.DoesNotExist:
            return Response({"detail": "Not found."}, status=http_status.HTTP_404_NOT_FOUND)

        if request.method == "DELETE":
            hearing.delete()
            self._log_action(
                case,
                request.user,
                CaseActivityLog.Action.CASE_UPDATED,
                "Deleted a hearing date",
            )
            return Response(status=http_status.HTTP_204_NO_CONTENT)

        serializer = CaseCourtMartialHearingSerializer(hearing, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        self._log_action(
            case,
            request.user,
            CaseActivityLog.Action.CASE_UPDATED,
            f"Updated hearing date {serializer.instance.hearing_date}",
        )
        return Response(serializer.data)

    @action(detail=True, methods=["get"], url_path="activity")
    def activity(self, request, pk=None):
        case = self.get_object()
        if not self._can_view_case_progress(request.user, case):
            raise ValidationError({"detail": "You may not view progress updates for this case."})
        qs = case.activity_logs.select_related("actor").all()
        serializer = CaseActivityLogSerializer(qs, many=True, context={"request": request})
        return Response(serializer.data)
