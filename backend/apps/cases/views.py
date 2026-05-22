from rest_framework import viewsets, permissions, status as http_status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from django.utils import timezone
from django.core.mail import send_mail
from django.conf import settings as django_settings
from django.db.models import Avg, Count, Q, F, ExpressionWrapper, IntegerField, FloatField
from datetime import date
from .models import (
    Case,
    CaseActivityLog,
    CaseAttachment,
    CaseCourtMartialHearing,
    CaseCourtMartialMilestone,
    InvestigationTeam,
)
from .serializers import (
    CaseActivityLogSerializer,
    CaseAttachmentSerializer,
    CaseCourtMartialHearingSerializer,
    CaseCourtMartialMilestoneSerializer,
    CaseSerializer,
    InvestigationTeamSerializer,
)
from apps.notifications.models import Notification
from apps.users.models import User


class InvestigationTeamViewSet(viewsets.ModelViewSet):
    serializer_class = InvestigationTeamSerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        user = self.request.user
        # IC Det creates teams scoped to their detachment
        if user.role == "detachment" and user.detachment_id:
            serializer.save(battalion=user.battalion, detachment=user.detachment)
        else:
            serializer.save(battalion=user.battalion)

    def get_queryset(self):
        user = self.request.user
        if user.is_superuser:
            return InvestigationTeam.objects.prefetch_related("members").select_related("team_ic", "battalion", "detachment").all()
        # IC Det sees only their detachment's teams
        if user.role == "detachment" and user.detachment_id:
            return InvestigationTeam.objects.prefetch_related("members").select_related("team_ic", "battalion", "detachment").filter(detachment_id=user.detachment_id)
        if user.battalion_id:
            return InvestigationTeam.objects.prefetch_related("members").select_related("team_ic", "battalion", "detachment").filter(battalion_id=user.battalion_id)
        return InvestigationTeam.objects.none()

    _ACTIVE = ["under_investigation"]

    @action(detail=False, methods=["get"], url_path="user-workload")
    def user_workload(self, request):
        """
        Returns all personnel (in the requester's scope) ranked by active-case
        engagement: each active case their team is assigned counts once,
        whether they are Team IC or a team member.
        """
        user = request.user

        # Scope the user pool to same detachment / battalion
        if user.is_superuser:
            base_users = User.objects.all()
        elif user.role == "detachment" and user.detachment_id:
            base_users = User.objects.filter(detachment_id=user.detachment_id)
        elif user.battalion_id:
            base_users = User.objects.filter(battalion_id=user.battalion_id)
        else:
            base_users = User.objects.none()

        qs = base_users.annotate(
            ic_cases=Count(
                "led_teams__assigned_cases__id",
                filter=Q(led_teams__assigned_cases__status__in=self._ACTIVE),
                distinct=True,
            ),
            member_cases=Count(
                "investigation_teams__assigned_cases__id",
                filter=Q(investigation_teams__assigned_cases__status__in=self._ACTIVE),
                distinct=True,
            ),
        ).annotate(
            total_engagement=ExpressionWrapper(
                F("ic_cases") + F("member_cases"),
                output_field=IntegerField(),
            )
        ).order_by("-total_engagement", "name")

        data = [
            {
                "id": u.id,
                "name": u.name,
                "rank": u.rank or "",
                "service_number": u.service_number or "",
                "role": u.role,
                "ic_cases": u.ic_cases,
                "member_cases": u.member_cases,
                "total_engagement": u.total_engagement,
            }
            for u in qs
        ]
        return Response(data)


class CaseViewSet(viewsets.ModelViewSet):
    queryset = Case.objects.select_related("assigned_to", "created_by", "accused_unit").prefetch_related(
        "extra_attachments", "court_martial_hearings", "court_martial_milestones"
    ).all()
    serializer_class = CaseSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filterset_fields = ["status", "assigned_to", "accused_unit", "tasked_detachment", "tasked_battalion"]
    search_fields = ["case_number", "title", "accused_name", "accused_service_number"]

    def _can_view_case_progress(self, user, case_obj):
        if not user or not user.is_authenticated:
            return False
        if user.is_superuser:
            return True
        if (
            user.role in {"admin", "mpc_hqs"}
            and user.battalion
            and str(user.battalion.battalion_type).lower() == "hqs"
        ):
            return True
        if case_obj.tasked_battalion_id and user.battalion_id == case_obj.tasked_battalion_id:
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
            "tasked_battalion",
            "tasked_detachment",
        ).prefetch_related(
            "extra_attachments",
            "court_martial_hearings",
            "court_martial_milestones",
        )

        if not user.is_authenticated:
            return base_qs.none()

        if user.is_superuser:
            return base_qs.all()

        if (
            user.role in {"admin", "mpc_hqs"}
            and user.battalion
            and str(user.battalion.battalion_type).lower() == "hqs"
        ):
            return base_qs.all()

        # Normal / Special battalion admin sees their battalion's cases
        if user.role == "admin" and user.battalion_id:
            return base_qs.filter(tasked_battalion_id=user.battalion_id)

        # Detachment IC (role=detachment) sees cases tasked to their detachment
        if user.role == "detachment" and user.detachment_id:
            return base_qs.filter(tasked_detachment_id=user.detachment_id)

        if user.battalion_id:
            return base_qs.filter(
                Q(tasked_battalion_id=user.battalion_id)
                | Q(assigned_to=user)
                | Q(assigned_team__team_ic=user)
                | Q(assigned_team__members=user)
            ).distinct()

        return base_qs.filter(assigned_to=user)

    def _log_action(self, case, actor, action, detail=""):
        CaseActivityLog.objects.create(case=case, actor=actor, action=action, detail=detail)

    def _actor_label(self, actor):
        if not actor:
            return "System"
        parts = [p for p in [actor.rank, actor.name] if p]
        return " ".join(parts) or actor.service_number

    def _notify_team(self, case, actor, message):
        """Create dashboard notifications + send email to every active team member / IC,
        excluding the actor who triggered the action."""
        if not case.assigned_team_id:
            return
        try:
            team = case.assigned_team
        except Exception:
            return
        recipients = set()
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
                send_mail(
                    subject=f"[MPIMS] Case {case.case_number} — Activity",
                    message=message,
                    from_email=django_settings.DEFAULT_FROM_EMAIL,
                    recipient_list=email_list,
                    fail_silently=True,
                )
            except Exception:
                pass

    def _is_hq_admin_or_superuser(self, user):
        if not user or not user.is_authenticated:
            return False
        if user.is_superuser:
            return True
        return (
            user.role in {"admin", "mpc_hqs"}
            and user.battalion
            and str(user.battalion.battalion_type).lower() == "hqs"
        )

    def _can_manage_court_martial_progress(self, user, case_obj):
        if not user or not user.is_authenticated:
            return False
        if self._is_hq_admin_or_superuser(user):
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
        team = getattr(case_obj, "assigned_team", None)
        if team and (team.team_ic_id == user.id or team.members.filter(id=user.id).exists()):
            return True
        if case_obj.assigned_to_id and case_obj.assigned_to_id == user.id:
            return True
        return False

    def _latest_court_milestone(self, case_obj):
        return case_obj.court_martial_milestones.order_by("-scheduled_date", "-created_at", "-id").first()

    def perform_create(self, serializer):
        instance = serializer.save(created_by=self.request.user, status=Case.Status.NEW)
        self._send_tasking_notification(instance, created=True)
        self._log_action(instance, self.request.user, CaseActivityLog.Action.CASE_CREATED,
                         f"Case {instance.case_number} created")

    def perform_update(self, serializer):
        prev_instance = self.get_object()
        prev_tasked_battalion_id = prev_instance.tasked_battalion_id
        prev_team_id = prev_instance.assigned_team_id

        # Auto-set status to "tasked" when a battalion is newly assigned
        new_tasked = serializer.validated_data.get("tasked_battalion")
        save_kwargs = {}
        if new_tasked and (new_tasked.id if hasattr(new_tasked, "id") else new_tasked) != prev_tasked_battalion_id:
            save_kwargs["status"] = Case.Status.TASKED

        # Auto-set status to "tasked" when detachment is newly assigned
        prev_tasked_detachment_id = prev_instance.tasked_detachment_id
        new_tasked_det = serializer.validated_data.get("tasked_detachment")
        if new_tasked_det and (new_tasked_det.id if hasattr(new_tasked_det, "id") else new_tasked_det) != prev_tasked_detachment_id:
            save_kwargs["status"] = Case.Status.TASKED

        # Auto-set status to "under_investigation" when a team is newly assigned
        new_team = serializer.validated_data.get("assigned_team")
        if new_team and (new_team.id if hasattr(new_team, "id") else new_team) != prev_team_id:
            # Require investigation_deadline
            deadline = serializer.validated_data.get(
                "investigation_deadline",
                getattr(prev_instance, "investigation_deadline", None),
            )
            if not deadline:
                raise ValidationError({"investigation_deadline": "Investigation deadline is required before assigning a team."})
            save_kwargs["status"] = Case.Status.UNDER_INVESTIGATION

        proposed_status = save_kwargs.get("status") or serializer.validated_data.get("status")
        if proposed_status == Case.Status.CLOSED and prev_instance.status != Case.Status.SERVED:
            raise ValidationError({"status": "A case can only be closed after it is served."})

        if (
            proposed_status == Case.Status.CLOSED
            and prev_instance.criminal_offence_type == Case.CriminalOffenceType.COURT_MARTIAL
            and not self._is_hq_admin_or_superuser(self.request.user)
        ):
            raise ValidationError({"status": "Only HQ battalion admin (or superuser) can close a Court Martial case."})

        instance = serializer.save(**save_kwargs)
        # Only notify if tasking is new or changed
        if instance.tasked_battalion_id and instance.tasked_battalion_id != prev_tasked_battalion_id:
            self._send_tasking_notification(instance, created=False)
        # Notify IC Det when detachment is newly tasked
        if instance.tasked_detachment_id and instance.tasked_detachment_id != prev_tasked_detachment_id:
            self._send_detachment_tasking_notification(instance)

        # Determine effective new status (from save_kwargs override or from validated data)
        new_status = proposed_status
        if new_status and new_status != prev_instance.status:
            self._log_action(instance, self.request.user, CaseActivityLog.Action.STATUS_CHANGED,
                             f"Status changed from {prev_instance.status} to {new_status}")
            actor_label = self._actor_label(self.request.user)
            readable_old = prev_instance.status.replace("_", " ").title()
            readable_new = new_status.replace("_", " ").title()
            self._notify_team(
                instance, actor=self.request.user,
                message=(
                    f"{actor_label} updated Case #{instance.case_number} — '{instance.title}': "
                    f"status changed from '{readable_old}' to '{readable_new}'."
                ),
            )
            # Auto-set served_at when status first changes to served
            if new_status == Case.Status.SERVED and not prev_instance.served_at:
                Case.objects.filter(pk=instance.pk).update(served_at=timezone.now())
                instance.refresh_from_db(fields=["served_at"])
            if new_status == Case.Status.CLOSED and not prev_instance.closed_at:
                Case.objects.filter(pk=instance.pk).update(closed_at=timezone.now())
                instance.refresh_from_db(fields=["closed_at"])
            # Notifications
            if new_status == Case.Status.SERVED:
                self._send_served_notification(instance, actor=self.request.user)
            elif new_status == Case.Status.CLOSED:
                self._send_closed_notification(instance)
        # Log battalion tasking
        if instance.tasked_battalion_id and instance.tasked_battalion_id != prev_tasked_battalion_id:
            bn_name = instance.tasked_battalion.name if instance.tasked_battalion else str(instance.tasked_battalion_id)
            self._log_action(instance, self.request.user, CaseActivityLog.Action.BATTALION_TASKED,
                             f"Tasked to {bn_name}")
        # Log detachment tasking
        if instance.tasked_detachment_id and instance.tasked_detachment_id != prev_tasked_detachment_id:
            det_name = instance.tasked_detachment.name if instance.tasked_detachment else str(instance.tasked_detachment_id)
            self._log_action(instance, self.request.user, CaseActivityLog.Action.DETACHMENT_TASKED,
                             f"Tasked to detachment {det_name}")
        # Log team assignment + notify team they have a new case
        if instance.assigned_team_id and instance.assigned_team_id != prev_team_id:
            instance.team_assigned_at = timezone.now()
            instance.save(update_fields=["team_assigned_at"])
            team_name = instance.assigned_team.name if instance.assigned_team else str(instance.assigned_team_id)
            self._log_action(instance, self.request.user, CaseActivityLog.Action.TEAM_ASSIGNED,
                             f"Team '{team_name}' assigned")
            deadline_str = str(instance.investigation_deadline) if instance.investigation_deadline else "Not set"
            self._notify_team(
                instance, actor=None,
                message=(
                    f"Case #{instance.case_number} — '{instance.title}' has been assigned to your team "
                    f"'{team_name}'. Investigation deadline: {deadline_str}."
                ),
            )

    def _send_tasking_notification(self, case, created):
        if not case.tasked_battalion_id:
            return
        users = User.objects.filter(
            battalion_id=case.tasked_battalion_id,
            is_active=True,
        ).exclude(role="detachment")
        if not users.exists():
            return
        msg = f"A new case (#{case.case_number or case.id}) has been tasked to your battalion: {case.title}"
        if not created:
            msg = f"Case (#{case.case_number or case.id}) has been newly tasked to your battalion: {case.title}"
        Notification.objects.bulk_create([
            Notification(
                recipient=u,
                message=msg,
                notification_type=Notification.Type.CASE,
                related_model="case",
                related_id=case.id,
            ) for u in users
        ])

    def _send_detachment_tasking_notification(self, case):
        """Notify all users in the tasked detachment (role=detachment as IC Det)."""
        if not case.tasked_detachment_id:
            return
        # Notify users whose detachment matches and whose role is 'detachment' (IC Det)
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
        """Notify all admin users in HQS battalions that a case has been served."""
        from apps.formations.models import Battalion
        hqs_admins = User.objects.filter(
            role="admin",
            battalion__battalion_type=Battalion.BattalionType.HQS,
            is_active=True,
        )
        if not hqs_admins.exists():
            return
        # Build actor attribution: "by Rank Name of Detachment/Battalion"
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
            ) for u in hqs_admins
        ])

    def _send_closed_notification(self, case):
        """Notify assigned team (IC + members), tasked battalion admin, and Det IC if detachment-level."""
        recipients = set()
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

        # Detachment IC if this is a detachment-level case
        if case.tasked_detachment_id:
            recipients.update(User.objects.filter(
                role="detachment",
                detachment_id=case.tasked_detachment_id,
                is_active=True,
            ))

        if not recipients:
            return
        msg = (
            f"Case #{case.case_number} — '{case.title}' has been officially closed."
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

    @action(detail=False, methods=["get"], url_path="detachment-summary")
    def detachment_summary(self, request):
        """
        Returns per-detachment case count breakdown for the requesting user's battalion.
        Accessible to battalion admins and superusers.
        Superusers must supply ?battalion=<id> query param.
        Returns: { battalion_id, detachments: [{id, name, company, under_investigation, pending, closed, total}] }
        """
        from apps.formations.models import Detachment

        user = request.user

        if user.is_superuser:
            battalion_id = request.query_params.get("battalion")
            if not battalion_id:
                return Response(
                    {"detail": "Supply ?battalion=<id> to specify a battalion."},
                    status=http_status.HTTP_400_BAD_REQUEST,
                )
            base_qs = Case.objects.all()
        elif user.role == "admin" and user.battalion_id:
            battalion_id = user.battalion_id
            base_qs = self.get_queryset()
        else:
            return Response(
                {"detail": "Only battalion admins can access this endpoint."},
                status=http_status.HTTP_403_FORBIDDEN,
            )

        detachments = Detachment.objects.filter(battalion_id=battalion_id).order_by("name")
        summary = []
        for det in detachments:
            det_qs = base_qs.filter(tasked_detachment_id=det.id)
            summary.append({
                "id": det.id,
                "name": det.name,
                "company": det.company,
                "tasked": det_qs.filter(status=Case.Status.TASKED).count(),
                "under_investigation": det_qs.filter(status=Case.Status.UNDER_INVESTIGATION).count(),
                "pending": det_qs.filter(status=Case.Status.PENDING).count(),
                "closed": det_qs.filter(status=Case.Status.CLOSED).count(),
                "total": det_qs.count(),
            })

        return Response({"battalion_id": battalion_id, "detachments": summary})

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
        from django.db.models.functions import TruncDate
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

        # Average variance in days (served_at.date − investigation_deadline)
        # We compute in Python to avoid DB-level date subtraction dialect issues
        variance_days = [
            (c.served_at.date() - c.investigation_deadline).days
            for c in resolved
            if c.served_at and c.investigation_deadline
        ]
        avg_variance = round(sum(variance_days) / len(variance_days), 1) if variance_days else None

        # Team window: investigation_deadline − team_assigned_at (how long the team was given)
        team_cases = with_deadline.filter(team_assigned_at__isnull=False)
        team_window_days = [
            (c.investigation_deadline - c.team_assigned_at.date()).days
            for c in team_cases
            if c.investigation_deadline and c.team_assigned_at
        ]
        avg_team_window = round(sum(team_window_days) / len(team_window_days), 1) if team_window_days else None

        # Team resolution time: served_at.date − team_assigned_at.date (how long they actually took)
        resolved_with_assignment = resolved.filter(team_assigned_at__isnull=False)
        team_resolution_days = [
            (c.served_at.date() - c.team_assigned_at.date()).days
            for c in resolved_with_assignment
            if c.served_at and c.team_assigned_at
        ]
        avg_team_resolution = round(sum(team_resolution_days) / len(team_resolution_days), 1) if team_resolution_days else None

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
            user.is_superuser or
            (
                user.role in {"admin", "mpc_hqs"}
                and user.battalion
                and str(user.battalion.battalion_type).lower() == "hqs"
            )
        )
        if is_hq_admin:
            from apps.formations.models import Battalion
            breakdown = []
            for bn in Battalion.objects.order_by("name"):
                bn_qs = with_deadline.filter(tasked_battalion=bn)
                bn_resolved = bn_qs.filter(status__in=resolved_statuses, served_at__isnull=False)
                bn_on_time = bn_resolved.filter(
                    served_at__date__lte=F("investigation_deadline")
                ).count()
                bn_total_resolved = bn_resolved.count()
                bn_overdue = bn_qs.filter(
                    investigation_deadline__lt=today
                ).exclude(status__in=resolved_statuses).count()
                breakdown.append({
                    "battalion": bn.name,
                    "total_with_deadline": bn_qs.count(),
                    "resolved_total":      bn_total_resolved,
                    "resolved_on_time":    bn_on_time,
                    "on_time_rate_pct":    round(bn_on_time / bn_total_resolved * 100, 1)
                                           if bn_total_resolved else None,
                    "currently_overdue":   bn_overdue,
                })
            result["by_battalion"] = breakdown

        return Response(result)

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

    @action(
        detail=True,
        methods=["delete"],
        url_path=r"attachments/(?P<att_pk>[^/.]+)",
        parser_classes=[JSONParser],
    )
    def delete_attachment(self, request, pk=None, att_pk=None):
        case = self.get_object()
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
        serializer = CaseActivityLogSerializer(qs, many=True)
        return Response(serializer.data)
