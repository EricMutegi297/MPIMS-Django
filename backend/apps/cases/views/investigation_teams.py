from ._shared import *

class InvestigationTeamViewSet(viewsets.ModelViewSet):
    serializer_class = InvestigationTeamSerializer
    permission_classes = [permissions.IsAuthenticated]

    def _can_manage_teams(self, user):
        if user.is_superuser:
            return True
        if user.role == User.Role.IC_CASES and user.detachment_id:
            return True
        if is_detachment_ic(user) and user.detachment_id:
            return True
        if (
            user.role == User.Role.ADMIN
            and user.battalion_id
            and getattr(user.battalion, "battalion_type", "") == Battalion.BattalionType.SPECIAL
        ):
            return True
        return False

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if should_block_command_write(request.user, request.method):
            raise PermissionDenied(command_read_only_message(request.user))
        if request.method not in permissions.SAFE_METHODS and not self._can_manage_teams(request.user):
            raise PermissionDenied("Only IC Cases or Special Battalion Admin can create or manage investigation teams.")

    def perform_create(self, serializer):
        user = self.request.user
        # IC Cases creates teams scoped to their company record.
        if is_detachment_ic(user) and user.detachment_id:
            serializer.save(battalion=user.battalion, detachment=user.detachment)
        elif user.role == User.Role.IC_CASES and user.detachment_id:
            serializer.save(battalion=user.battalion, detachment=user.detachment)
        else:
            serializer.save(battalion=user.battalion)

    def get_queryset(self):
        user = self.request.user
        if has_global_read_access(user):
            return InvestigationTeam.objects.prefetch_related("members").select_related("team_ic", "battalion", "detachment").all()
        if user.role == User.Role.INVESTIGATOR:
            return InvestigationTeam.objects.prefetch_related("members").select_related("team_ic", "battalion", "detachment").filter(
                Q(team_ic=user) | Q(members=user)
            ).distinct()
        if user.role == User.Role.IC_CASES:
            teams = InvestigationTeam.objects.prefetch_related("members").select_related(
                "team_ic", "battalion", "detachment"
            )
            if user.detachment_id:
                return teams.filter(detachment_id=user.detachment_id)
            if user.company_id:
                return teams.filter(detachment__company_id=user.company_id)
            if user.battalion_id:
                return teams.filter(battalion_id=user.battalion_id)
            return teams.none()
        # IC Cases sees only their company teams.
        if is_detachment_ic(user) and user.detachment_id:
            return InvestigationTeam.objects.prefetch_related("members").select_related("team_ic", "battalion", "detachment").filter(detachment_id=user.detachment_id)
        if is_company_command(user):
            return InvestigationTeam.objects.prefetch_related("members").select_related("team_ic", "battalion", "detachment").filter(
                detachment__company_id=user.detachment.company_id
            )
        if user.battalion_id:
            return InvestigationTeam.objects.prefetch_related("members").select_related("team_ic", "battalion", "detachment").filter(battalion_id=user.battalion_id)
        return InvestigationTeam.objects.none()

    _ACTIVE = [Case.Status.UNDER_INVESTIGATION, Case.Status.PENDING]

    @action(detail=False, methods=["get"], url_path="user-workload")
    def user_workload(self, request):
        """
        Returns all personnel (in the requester's scope) ranked by active-case
        engagement: direct IO assignments plus active cases assigned to their
        team, whether they are Team IC or a team member.
        """
        user = request.user

        # Scope the user pool to same company / battalion
        if has_global_read_access(user):
            base_users = User.objects.all()
        elif is_detachment_ic(user) and user.detachment_id:
            base_users = User.objects.filter(detachment_id=user.detachment_id)
        elif user.role == User.Role.IC_CASES and user.detachment_id:
            base_users = User.objects.filter(detachment_id=user.detachment_id)
        elif user.role == User.Role.IC_CASES and user.company_id:
            base_users = User.objects.filter(
                Q(company_id=user.company_id) | Q(detachment__company_id=user.company_id)
            )
        elif user.role == User.Role.IC_CASES and user.battalion_id:
            base_users = User.objects.filter(battalion_id=user.battalion_id)
        elif is_company_command(user):
            base_users = User.objects.filter(detachment__company_id=user.detachment.company_id)
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
            direct_cases=Count(
                "assigned_cases__id",
                filter=Q(assigned_cases__status__in=self._ACTIVE),
                distinct=True,
            ),
        ).annotate(
            total_engagement=ExpressionWrapper(
                F("ic_cases") + F("member_cases") + F("direct_cases"),
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
                "direct_cases": u.direct_cases,
                "total_engagement": u.total_engagement,
            }
            for u in qs
        ]
        return Response(data)
