import json
import logging
import mimetypes
import re
from pathlib import PurePosixPath
from urllib.parse import quote, unquote, urlparse
from rest_framework import viewsets, permissions, status as http_status, filters
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
from django.http import FileResponse, Http404, HttpResponse
from django_filters.rest_framework import DjangoFilterBackend
from django.utils import timezone
from apps.common.mail import enqueue_email
from django.conf import settings as django_settings
from django.db import transaction
from django.db.models import Avg, Count, Q, F, ExpressionWrapper, IntegerField, FloatField, Prefetch
from django.db.models.functions import TruncMonth
from datetime import date
from ..models import (
    Case,
    CaseActivityLog,
    CaseComment,
    CaseAccused,
    CaseAttachment,
    CaseBackBrief,
    CaseBrief,
    CaseBriefForward,
    CaseCourtMartialHearing,
    CaseCourtMartialMilestone,
    ExhibitStorageRequest,
    InvestigationTeam,
)
from ..serializers import (
    CaseActivityLogSerializer,
    CaseCommentSerializer,
    CaseAttachmentSerializer,
    CaseBackBriefSerializer,
    CaseBriefSerializer,
    CaseCourtMartialHearingSerializer,
    CaseCourtMartialMilestoneSerializer,
    ExhibitStorageRequestSerializer,
    CaseSerializer,
    CLOSED_CASE_FILE_ERROR,
    InvestigationTeamSerializer,
)
from apps.formations.models import Battalion
from apps.notifications.models import Notification
from apps.users.access import (
    BATTALION_COMMAND_ROLES,
    DETACHMENT_ATTACHMENT_ROLES,
    battalion_scope_q,
    command_read_only_message,
    company_case_scope_q,
    has_global_read_access,
    ic_cases_scope_q,
    is_hqs_admin,
    is_battalion_command,
    is_company_command,
    is_scoped_to_company,
    is_unit_level_case_viewer,
    is_detachment_ic,
    should_block_command_write,
    unit_case_scope_q,
    user_company_id,
)
from apps.users.models import User

logger = logging.getLogger(__name__)

def ensure_case_accepts_file_changes(case):
    if case and case.status == Case.Status.CLOSED:
        raise ValidationError({"case": CLOSED_CASE_FILE_ERROR})
RTA_STAT_TYPES = [
    ("injury", "Injury Road Traffic Accident"),
    ("non_injury", "Non-Injury Road Traffic Accident"),
    ("self_involved", "Self Involved Road Traffic Accident"),
    ("fatal", "Fatal Road Traffic Accident"),
    ("hit_and_run", "Hit and Run Road Traffic Accident"),
]
