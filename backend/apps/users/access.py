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
UNIT_COMMAND_ROLES = {
    User.Role.ADJ,
    User.Role.CO,
    User.Role.TWO_IC,
    User.Role.COMMANDANT,
    User.Role.CI,
    User.Role.SI,
}
UNIT_LEVEL_ROLES = UNIT_COMMAND_ROLES | {User.Role.DOCUS_CLERK}


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
        and not (user.role in UNIT_COMMAND_ROLES and user.unit_id)
        and not is_hqs_admin(user)
    )


def is_detachment_ic(user):
    return bool(user and user.is_authenticated and user.role == User.Role.DETACHMENT)


def is_docus_clerk(user):
    return bool(user and user.is_authenticated and user.role == User.Role.DOCUS_CLERK and user.unit_id)


def is_unit_level_case_viewer(user):
    return bool(user and user.is_authenticated and user.role in UNIT_LEVEL_ROLES and user.unit_id)


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
        terms.append(Q(**{f"{detachment_field}__company__battalion_id": battalion_id}))
    if not terms:
        return Q(pk__in=[])
    query = terms[0]
    for term in terms[1:]:
        query |= term
    return query


def unit_case_scope_q(user):
    unit_id = getattr(user, "unit_id", None)
    if not unit_id:
        return Q(pk__in=[])
    return Q(accused_unit_id=unit_id) | Q(accused_entries__unit_id=unit_id)
