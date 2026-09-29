from ._shared import *
from ..services import (
    request_unit_closure,
    review_unit_closure,
    upload_clearance_certificate,
)
from ..serializers.constants import CASE_FILE_FIELDS
from .exhibit_access import scope_exhibits_for_user


class CaseActionsMixin:

    @action(detail=True, methods=["get"], url_path=r"documents/(?P<document_key>[^/.]+)/download")
    def download_document(self, request, pk=None, document_key=None):
        case = self.get_object()
        document = None
        if document_key.startswith("field-"):
            field_name = document_key[len("field-"):]
            if field_name in CASE_FILE_FIELDS:
                document = getattr(case, field_name, None)
        elif document_key.isdigit():
            attachment = case.extra_attachments.filter(pk=document_key).first()
            document = attachment.file if attachment else None
        elif document_key.startswith("brief-"):
            brief = getattr(case, "brief", None)
            if brief and str(brief.pk) == document_key[len("brief-"):]:
                if not self._can_view_case_brief(request.user, case, brief):
                    raise PermissionDenied("This brief has not been forwarded to your role.")
                document = brief.file
        elif document_key.startswith("back-brief-"):
            brief = getattr(case, "brief", None)
            back_brief = getattr(brief, "back_brief", None) if brief else None
            if back_brief and str(back_brief.pk) == document_key[len("back-brief-"):]:
                if not self._can_view_case_brief(request.user, case, brief):
                    raise PermissionDenied("This brief has not been forwarded to your role.")
                document = back_brief.file
        elif document_key.startswith("activity-"):
            activity = case.activity_logs.filter(pk=document_key[len("activity-"):]).first()
            document = activity.reference_pdf if activity else None
        elif document_key.startswith(("exhibit-photo-", "exhibit-lifecycle-")):
            prefix = "exhibit-lifecycle-" if document_key.startswith("exhibit-lifecycle-") else "exhibit-photo-"
            exhibit = scope_exhibits_for_user(
                request.user,
                case.exhibit_storage_requests.all(),
            ).filter(pk=document_key[len(prefix):]).first()
            if exhibit:
                field_name = "lifecycle_attachment" if prefix == "exhibit-lifecycle-" else "photo"
                document = getattr(exhibit, field_name)

        if not document or not document.name or not document.storage.exists(document.name):
            raise Http404("File not found.")

        filename = document.name.rsplit("/", 1)[-1].replace("\\", "_")
        content_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"
        response = FileResponse(
            document.storage.open(document.name, "rb"),
            as_attachment=True,
            filename=filename,
            content_type=content_type,
        )
        response["X-Content-Type-Options"] = "nosniff"
        response["Cache-Control"] = "private, no-store, max-age=0"
        response["Pragma"] = "no-cache"
        return response

    @action(
        detail=True,
        methods=["post"],
        url_path="request-closure",
        parser_classes=[MultiPartParser, FormParser],
    )
    def request_closure(self, request, pk=None):
        case = self.get_object()
        chargesheet = request.FILES.get("chargesheet")
        case = request_unit_closure(
            case,
            request.user,
            chargesheet,
            request.data.get("note"),
        )
        self._notify_hq_reviewers(
            case,
            request.user,
            f"{self._actor_label(request.user)} requested closure of Case #{case.case_number} after acknowledging service.",
        )
        return Response(CaseSerializer(case, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="review-closure", parser_classes=[JSONParser])
    def review_closure(self, request, pk=None):
        if not (is_hqs_admin(request.user) or request.user.is_superuser):
            raise PermissionDenied("Only Admin HQs can approve or reject unit closure requests.")
        case = self.get_object()
        case, decision, note = review_unit_closure(
            case,
            request.user,
            request.data.get("decision"),
            request.data.get("comment") or request.data.get("note"),
        )
        self._notify_team(
            case,
            request.user,
            f"HQ {decision}d the unit closure request for Case #{case.case_number}." + (f" Comment: {note}" if note else ""),
        )
        self._notify_accused_unit_users(
            case,
            request.user,
            f"HQ {decision}d the unit closure request for Case #{case.case_number}." + (f" Comment: {note}" if note else ""),
        )
        return Response(CaseSerializer(case, context={"request": request}).data)

    @action(
        detail=True,
        methods=["post"],
        url_path="clearance-certificate",
        parser_classes=[MultiPartParser, FormParser],
    )
    def clearance_certificate(self, request, pk=None):
        case = self.get_object()
        certificate = request.FILES.get("clearance_certificate")
        case = upload_clearance_certificate(case, request.user, certificate)
        self._notify_hq_reviewers(
            case,
            request.user,
            f"{self._actor_label(request.user)} uploaded a clearance certificate for Case #{case.case_number}.",
        )
        return Response(CaseSerializer(case, context={"request": request}).data)

    @action(detail=False, methods=["get"], url_path="protected-file", parser_classes=[JSONParser])
    def protected_file(self, request):
        media_name = self._case_media_name_from_param(
            request.query_params.get("path") or request.query_params.get("url")
        )
        case = self.get_queryset().filter(self._case_file_scope_q(media_name)).distinct().first()
        if not case or not default_storage.exists(media_name):
            raise Http404("File not found.")

        brief = getattr(case, "brief", None)
        if brief and brief.file.name == media_name and not self._can_view_case_brief(request.user, case, brief):
            raise PermissionDenied("This brief has not been forwarded to your role.")
        back_brief = getattr(brief, "back_brief", None) if brief else None
        if (
            back_brief
            and back_brief.file.name == media_name
            and not self._can_view_case_brief(request.user, case, brief)
        ):
            raise PermissionDenied("This brief has not been forwarded to your role.")
        exhibit = scope_exhibits_for_user(
            request.user,
            case.exhibit_storage_requests.filter(
                Q(photo=media_name) | Q(lifecycle_attachment=media_name)
            ),
        ).first()
        has_exhibit_file = case.exhibit_storage_requests.filter(
            Q(photo=media_name) | Q(lifecycle_attachment=media_name)
        ).exists()
        if has_exhibit_file and not exhibit:
            raise PermissionDenied("You do not have permission to access this exhibit file.")

        content_type = mimetypes.guess_type(media_name)[0] or "application/octet-stream"
        file_handle = default_storage.open(media_name, "rb")
        response = FileResponse(file_handle, content_type=content_type)
        filename = media_name.rsplit("/", 1)[-1]
        safe_filename = filename.replace("\\", "_").replace('"', "")
        response["Content-Disposition"] = (
            f'inline; filename="{safe_filename}"; filename*=UTF-8\'\'{quote(filename)}'
        )
        response["X-Content-Type-Options"] = "nosniff"
        response["Cache-Control"] = "private, no-store, max-age=0"
        return response

    def _brief_case_scope(self, user, qs):
        if has_global_read_access(user):
            return qs
        if getattr(user, "role", None) == User.Role.IC_CASES:
            return qs
        if getattr(user, "role", None) == User.Role.COMPANY_CMD:
            return qs
        if getattr(user, "role", None) == User.Role.INVESTIGATOR:
            return qs.filter(
                Q(assigned_to=user)
                | Q(assigned_team__team_ic=user)
                | Q(assigned_team__members=user)
            ).distinct()
        return qs

    def _brief_creator_scope(self, user, qs):
        if getattr(user, "role", None) != User.Role.INVESTIGATOR:
            return qs
        team_ids = InvestigationTeam.objects.filter(
            Q(team_ic=user) | Q(members=user)
        ).values("id")
        team_user_ids = User.objects.filter(
            Q(led_teams__id__in=team_ids) | Q(investigation_teams__id__in=team_ids)
        ).values("id")
        return qs.filter(
            Q(brief__attached_by=user) | Q(brief__attached_by_id__in=team_user_ids)
        ).distinct()

    def _brief_forward_target_for_role(self, user):
        role = getattr(user, "role", None)
        if role == User.Role.IC_CASES:
            return CaseBrief.ForwardRole.IC_CASES
        if role == User.Role.DETACHMENT:
            return CaseBrief.ForwardRole.DETACHMENT_IC
        if role == User.Role.DET_CMD:
            return CaseBrief.ForwardRole.DETACHMENT_COMMANDER
        if role == User.Role.TWO_IC:
            return (
                CaseBrief.ForwardRole.COMPANY_TWO_IC
                if user_company_id(user)
                else CaseBrief.ForwardRole.TWO_IC
            )
        if role == User.Role.OC:
            return (
                CaseBrief.ForwardRole.COMPANY_OC
                if user_company_id(user)
                else CaseBrief.ForwardRole.OC
            )
        return {
            User.Role.HOD: CaseBrief.ForwardRole.HOD,
            User.Role.ADJ: CaseBrief.ForwardRole.ADJ,
            User.Role.CO: CaseBrief.ForwardRole.CO,
            User.Role.CORPS_CMD: CaseBrief.ForwardRole.CORPS_CMD,
        }.get(role)

    def _brief_visible_scope(self, user, qs):
        if getattr(user, "role", None) == User.Role.INVESTIGATOR:
            return qs
        if getattr(user, "role", None) == User.Role.COMPANY_CMD:
            return qs.filter(company_case_scope_q(user)).distinct()
        if getattr(user, "role", None) == User.Role.IC_CASES:
            return qs.filter(ic_cases_scope_q(user)).distinct()

        if getattr(user, "role", None) == User.Role.ADMIN and not has_global_read_access(user):
            if not user.battalion_id:
                return qs.none()
            return qs.filter(
                Q(tasked_battalion_id=user.battalion_id)
                | Q(tasked_detachment__company__battalion_id=user.battalion_id)
                | Q(assigned_to__battalion_id=user.battalion_id)
                | Q(assigned_to__detachment__company__battalion_id=user.battalion_id)
                | Q(assigned_team__battalion_id=user.battalion_id)
                | Q(assigned_team__detachment__company__battalion_id=user.battalion_id)
            ).distinct()

        target = self._brief_forward_target_for_role(user)
        if target:
            qs = qs.filter(
                Q(brief__forwarded_to_role=target)
                | Q(brief__forward_history__to_role=target)
                | Q(brief__forward_history__from_role=user.role)
            )
            if user.role == User.Role.CORPS_CMD:
                return qs.distinct()
            if is_detachment_ic(user):
                if not user.detachment_id:
                    return qs.none()
                return qs.filter(
                    Q(tasked_detachment_id=user.detachment_id)
                    | Q(assigned_to__detachment_id=user.detachment_id)
                    | Q(assigned_team__detachment_id=user.detachment_id)
                ).distinct()
            if is_scoped_to_company(user):
                return qs.filter(company_case_scope_q(user)).distinct()
            if not user.battalion_id:
                return qs.none()
            return qs.filter(
                Q(tasked_battalion_id=user.battalion_id)
                | Q(tasked_detachment__company__battalion_id=user.battalion_id)
                | Q(assigned_to__battalion_id=user.battalion_id)
                | Q(assigned_to__detachment__company__battalion_id=user.battalion_id)
                | Q(assigned_team__battalion_id=user.battalion_id)
                | Q(assigned_team__detachment__company__battalion_id=user.battalion_id)
            ).distinct()

        if has_global_read_access(user):
            return qs
        return qs.none()

    def _case_battalion_id(self, case_obj):
        battalion_id = case_obj.tasked_battalion_id
        if not battalion_id and case_obj.tasked_detachment_id:
            battalion_id = getattr(case_obj.tasked_detachment, "battalion_id", None)
        if not battalion_id and case_obj.assigned_team_id:
            battalion_id = getattr(case_obj.assigned_team, "battalion_id", None)
        if not battalion_id and case_obj.assigned_team_id:
            team_detachment = getattr(case_obj.assigned_team, "detachment", None)
            battalion_id = getattr(team_detachment, "battalion_id", None)
        if not battalion_id and case_obj.assigned_to_id:
            battalion_id = getattr(case_obj.assigned_to, "battalion_id", None)
        if not battalion_id and case_obj.assigned_to_id:
            io_detachment = getattr(case_obj.assigned_to, "detachment", None)
            battalion_id = getattr(io_detachment, "battalion_id", None)
        return battalion_id

    def _case_detachment_id(self, user, case_obj):
        if case_obj.tasked_detachment_id:
            return case_obj.tasked_detachment_id
        if case_obj.assigned_team_id:
            detachment_id = getattr(case_obj.assigned_team, "detachment_id", None)
            if detachment_id:
                return detachment_id
        if case_obj.assigned_to_id:
            detachment_id = getattr(case_obj.assigned_to, "detachment_id", None)
            if detachment_id:
                return detachment_id
        return getattr(user, "detachment_id", None)

    def _case_company_id(self, case_obj):
        if case_obj.tasked_company_id:
            return case_obj.tasked_company_id
        if case_obj.tasked_detachment_id:
            return getattr(case_obj.tasked_detachment, "company_id", None)
        if case_obj.assigned_team_id:
            team = case_obj.assigned_team
            return getattr(getattr(team, "detachment", None), "company_id", None)
        if case_obj.assigned_to_id:
            return getattr(
                getattr(getattr(case_obj.assigned_to, "detachment", None), "company", None),
                "id",
                None,
            )
        return None

    def _brief_role_has_history_access(self, user, brief):
        target = self._brief_forward_target_for_role(user)
        if not target:
            return False
        if brief.forwarded_to_role == target:
            return True
        if (
            target == CaseBrief.ForwardRole.DETACHMENT_IC
            and brief.forwarded_to_role == CaseBrief.ForwardRole.DETACHMENT
        ):
            return True
        return brief.forward_history.filter(
            Q(to_role=target)
            | Q(from_role=getattr(user, "role", ""))
            | (
                Q(to_role=CaseBrief.ForwardRole.DETACHMENT)
                if target == CaseBrief.ForwardRole.DETACHMENT_IC
                else Q(pk__in=[])
            )
        ).exists()

    def _brief_forward_label(self, role):
        return dict(CaseBrief.ForwardRole.choices).get(role, role)

    def _brief_duplicate_forward(self, brief, to_role):
        return (
            brief.forward_history.select_related("forwarded_by")
            .filter(revision=brief.revision, to_role=to_role)
            .order_by("-forwarded_at", "-id")
            .first()
        )

    def _brief_forward_allowed_roles(self, user, case_obj, brief):
        role = getattr(user, "role", None)
        base_roles = set()
        if role == User.Role.INVESTIGATOR:
            if self._case_detachment_id(user, case_obj):
                base_roles = {
                    CaseBrief.ForwardRole.IC_CASES,
                    CaseBrief.ForwardRole.DETACHMENT_IC,
                    CaseBrief.ForwardRole.DETACHMENT_COMMANDER,
                }
            else:
                base_roles = {CaseBrief.ForwardRole.IC_CASES}
        elif (
            role in {User.Role.DETACHMENT, User.Role.DET_CMD, User.Role.IC_CASES}
            and (role != User.Role.IC_CASES or user.detachment_id or user_company_id(user))
            and self._brief_role_has_history_access(user, brief)
        ):
            base_roles = {
                CaseBrief.ForwardRole.COMPANY_TWO_IC,
                CaseBrief.ForwardRole.COMPANY_OC,
            }
        elif (
            role in {User.Role.TWO_IC, User.Role.OC}
            and user_company_id(user)
            and self._brief_role_has_history_access(user, brief)
        ):
            base_roles = {
                CaseBrief.ForwardRole.ADJ,
                CaseBrief.ForwardRole.HOD,
                CaseBrief.ForwardRole.TWO_IC,
                CaseBrief.ForwardRole.OC,
            }
        elif (
            role in {User.Role.HOD, User.Role.ADJ, User.Role.TWO_IC, User.Role.OC}
            and not user_company_id(user)
            and self._brief_role_has_history_access(user, brief)
        ):
            base_roles = {CaseBrief.ForwardRole.CO}
        elif role == User.Role.CO and self._brief_role_has_history_access(user, brief):
            base_roles = {CaseBrief.ForwardRole.CORPS_CMD}
        if not base_roles:
            return set()
        already_forwarded = set(
            brief.forward_history.filter(
                revision=brief.revision,
                to_role__in=base_roles,
            ).values_list("to_role", flat=True)
        )
        return base_roles - already_forwarded

    def _can_view_case_brief(self, user, case_obj, brief):
        if not user or not user.is_authenticated:
            return False
        if user.role == User.Role.INVESTIGATOR:
            return self._can_manage_case_brief(user, case_obj)
        if user.role == User.Role.IC_CASES:
            return Case.objects.filter(pk=case_obj.pk).filter(ic_cases_scope_q(user)).exists()
        if user.role == User.Role.COMPANY_CMD:
            return self._can_manage_case_brief(user, case_obj)
        if user.role == User.Role.ADMIN and not has_global_read_access(user):
            return bool(user.battalion_id and self._case_battalion_id(case_obj) == user.battalion_id)

        target = self._brief_forward_target_for_role(user)
        if target and self._brief_role_has_history_access(user, brief):
            if user.role == User.Role.CORPS_CMD:
                return True
            if is_detachment_ic(user):
                return bool(user.detachment_id and self._case_detachment_id(user, case_obj) == user.detachment_id)
            if is_scoped_to_company(user):
                return self._case_company_id(case_obj) == user_company_id(user)
            return bool(user.battalion_id and self._case_battalion_id(case_obj) == user.battalion_id)

        return has_global_read_access(user) and user.role != User.Role.CORPS_CMD

    def _can_edit_case_brief(self, user, case_obj, brief):
        if not user or not user.is_authenticated:
            return False
        if user.role == User.Role.INVESTIGATOR:
            return self._can_manage_case_brief(user, case_obj)
        if user.role == User.Role.HOD and self._brief_role_has_history_access(user, brief):
            return self._can_view_case_brief(user, case_obj, brief)
        if user.role == User.Role.OC and self._brief_role_has_history_access(user, brief):
            return self._can_view_case_brief(user, case_obj, brief)
        if user.role == User.Role.ADJ and self._brief_role_has_history_access(user, brief):
            return self._can_view_case_brief(user, case_obj, brief)
        return False

    def _latest_court_milestone(self, case_obj):
        return case_obj.court_martial_milestones.order_by("-scheduled_date", "-created_at", "-id").first()
