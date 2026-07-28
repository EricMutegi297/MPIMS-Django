from django.db.models import Q

from .models import User


SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
READ_ONLY_COMMAND_ROLES = {User.Role.ADJ, User.Role.CORPS_CMD}
BATTALION_COMMAND_ROLES = {
    User.Role.ADMIN,
    User.Role.CO,
    User.Role.OC,
    User.Role.HOD,
    User.Role.ADJ,
    User.Role.TWO_IC,
}


def is_corps_commander(user):
    return bool(user and user.is_authenticated and user.role == User.Role.CORPS_CMD)


def is_hqs_admin(user):
    return bool(
        user
        and user.is_authenticated
        and user.role in {User.Role.ADMIN, User.Role.MPC_HQS}
        and user.battalion is not None
        and getattr(user.battalion, "battalion_type", None) == "hqs"
    )


def is_admin_hqs(user):
    return bool(
        user
        and user.is_authenticated
        and user.role == User.Role.ADMIN
        and user.battalion is not None
        and getattr(user.battalion, "battalion_type", None) == "hqs"
    )


def has_global_read_access(user):
    return bool(
        user
        and user.is_authenticated
        and (user.is_superuser or is_corps_commander(user) or is_hqs_admin(user))
    )


def is_battalion_admin(user):
    return bool(
        user
        and user.is_authenticated
        and user.role == User.Role.ADMIN
        and user.battalion_id
        and not is_hqs_admin(user)
    )


def is_battalion_command(user):
    return bool(
        user
        and user.is_authenticated
        and user.battalion_id
        and user.role in BATTALION_COMMAND_ROLES
        and not is_hqs_admin(user)
    )


def is_detachment_ic(user):
    return bool(user and user.is_authenticated and user.role == User.Role.DETACHMENT)


def is_command_read_only(user):
    return bool(user and user.is_authenticated and user.role in READ_ONLY_COMMAND_ROLES)


def command_read_only_message(user):
    if user and user.role == User.Role.CORPS_CMD:
        return "Corps Commander has read-only command oversight access."
    return "Adjutant has read-only access to battalion information."


def should_block_command_write(user, method):
    return is_command_read_only(user) and method not in SAFE_METHODS


def battalion_scope_q(user, battalion_field=None, unit_field=None, detachment_field=None):
    terms = []
    battalion_id = getattr(user, "battalion_id", None)
    if not battalion_id:
        return Q(pk__in=[])
    if battalion_field:
        terms.append(Q(**{battalion_field: battalion_id}))
    if unit_field:
        terms.append(Q(**{f"{unit_field}__battalion_id": battalion_id}))
    if detachment_field:
        terms.append(Q(**{f"{detachment_field}__battalion_id": battalion_id}))
    if not terms:
        return Q(pk__in=[])
    query = terms[0]
    for term in terms[1:]:
        query |= term
    return query
