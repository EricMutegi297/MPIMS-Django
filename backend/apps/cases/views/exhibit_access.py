from django.db.models import Q

from apps.users.access import has_global_read_access, is_detachment_ic
from apps.users.models import User


def scope_exhibits_for_user(user, queryset):
    if has_global_read_access(user):
        return queryset
    if user.role == User.Role.INVESTIGATOR:
        return queryset.filter(
            Q(requested_by=user)
            | Q(case__assigned_to=user)
            | Q(case__assigned_team__team_ic=user)
            | Q(case__assigned_team__members=user)
        ).distinct()
    if is_detachment_ic(user) and user.detachment_id:
        return queryset.filter(
            Q(target_detachment_id=user.detachment_id)
            | Q(case__tasked_detachment_id=user.detachment_id)
            | Q(case__assigned_team__detachment_id=user.detachment_id)
        ).distinct()
    if user.role == User.Role.ADMIN and user.battalion_id:
        return queryset.filter(
            Q(target_battalion_id=user.battalion_id)
            | Q(case__tasked_battalion_id=user.battalion_id)
            | Q(case__tasked_detachment__company__battalion_id=user.battalion_id)
            | Q(case__assigned_team__battalion_id=user.battalion_id)
        ).distinct()
    if user.battalion_id:
        return queryset.filter(
            Q(case__tasked_battalion_id=user.battalion_id)
            | Q(case__tasked_detachment__company__battalion_id=user.battalion_id)
            | Q(case__assigned_team__battalion_id=user.battalion_id)
        ).distinct()
    return queryset.filter(requested_by=user)
