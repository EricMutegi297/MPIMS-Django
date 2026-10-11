from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape

from django.db import IntegrityError, transaction
from django.db.models import Q
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.utils import timezone
from django.utils.text import slugify
from django.views.decorators.cache import never_cache
from reportlab.lib.utils import ImageReader
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.cases.models import Case
from apps.users.access import is_admin_hqs
from apps.users.models import User

from .models import ClearanceRequest
from .services import (
    add_six_calendar_months,
    clearance_validity_status,
    invalidate_current_certificates,
)


UNIT_CLEARANCE_ROLES = {
    User.Role.CO,
    User.Role.ADJ,
    User.Role.TWO_IC,
    User.Role.COMMANDANT,
    User.Role.CI,
    User.Role.SI,
    User.Role.DOCUS_CLERK,
}


def can_request_unit_clearance(user):
    return bool(
        user
        and user.is_authenticated
        and user.role in UNIT_CLEARANCE_ROLES
        and user.unit_id
    )


def can_review_clearance(user):
    return bool(user and user.is_authenticated and (user.is_superuser or is_admin_hqs(user)))


def ongoing_cases_for_service_number(service_number):
    return (
        Case.objects.filter(
            Q(accused_service_number=service_number)
            | Q(accused_entries__service_number=service_number)
        )
        .exclude(status=Case.Status.CLOSED)
        .distinct()
    )


def ongoing_case_details_for_service_number(service_number):
    status_labels = dict(Case.Status.choices)
    cases = ongoing_cases_for_service_number(service_number).values_list(
        "id",
        "case_number",
        "status",
        "tasked_detachment__name",
        "tasked_company__name",
        "tasked_battalion__name",
        "assigned_team__name",
        "assigned_team__detachment__name",
        "assigned_team__battalion__name",
    )

    def investigating_unit_label(
        detachment,
        company,
        battalion,
        team_name,
        team_detachment,
        team_battalion,
    ):
        if detachment:
            return f"Det: {detachment}"
        if company:
            return f"Coy: {company}"
        if battalion:
            return f"Bn: {battalion}"
        if team_detachment:
            return f"Det: {team_detachment}"
        if team_battalion:
            return f"Bn: {team_battalion}"
        if team_name:
            return f"Investigation team: {team_name}"
        return "Not recorded in MPIMS"

    return [
        {
            "case_number": case_number or f"Case #{case_id}",
            "status": case_status,
            "status_label": status_labels.get(case_status, case_status),
            "investigating_unit": investigating_unit_label(
                tasked_detachment,
                tasked_company,
                tasked_battalion,
                team_name,
                team_detachment,
                team_battalion,
            ),
        }
        for (
            case_id,
            case_number,
            case_status,
            tasked_detachment,
            tasked_company,
            tasked_battalion,
            team_name,
            team_detachment,
            team_battalion,
        ) in cases
    ]


def clearance_request_data(clearance_request, *, include_case_check=False):
    subject = clearance_request.subject
    requester = clearance_request.requester
    reviewed_by = clearance_request.reviewed_by
    data = {
        "id": clearance_request.pk,
        "status": clearance_request.status,
        "status_label": clearance_request.get_status_display(),
        "subject_service_number": subject.service_number,
        "subject_name": subject.name,
        "subject_rank": subject.rank,
        "subject_unit": subject.unit.name if subject.unit_id else "",
        "requester_name": requester.name,
        "requester_service_number": requester.service_number,
        "requested_at": clearance_request.requested_at,
        "reviewed_at": clearance_request.reviewed_at,
        "expires_at": clearance_request.expires_at,
        "invalidated_at": clearance_request.invalidated_at,
        "validity_status": clearance_validity_status(clearance_request),
        "reviewed_by_name": reviewed_by.name if reviewed_by else "",
        "decision_note": clearance_request.decision_note,
        "certificate_number": clearance_request.certificate_number,
    }
    if include_case_check:
        data["ongoing_cases"] = ongoing_case_details_for_service_number(
            subject.service_number
        )
        data["ongoing_case_count"] = len(data["ongoing_cases"])
    return data


def _clearance_pdf(clearance_request):
    subject = clearance_request.subject
    approved_at = timezone.localtime(clearance_request.reviewed_at)
    buffer = BytesIO()
    document = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=24 * mm,
        leftMargin=24 * mm,
        topMargin=24 * mm,
        bottomMargin=24 * mm,
        title="MPIMS Clearance Certificate",
        author="Military Police Investigation Management System",
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "ClearanceTitle",
        parent=styles["Title"],
        alignment=TA_CENTER,
        textColor=colors.HexColor("#7f1d1d"),
        fontName="Helvetica-Bold",
        fontSize=18,
        spaceAfter=8 * mm,
    )
    body_style = ParagraphStyle(
        "ClearanceBody",
        parent=styles["BodyText"],
        fontSize=11,
        leading=17,
        spaceAfter=5 * mm,
    )

    def draw_watermark(canvas, _document):
        logo_path = Path(__file__).parent / "static" / "clearances" / "mpc-logo.png"
        if not logo_path.is_file():
            raise FileNotFoundError(f"Clearance certificate watermark not found: {logo_path}")
        canvas.saveState()
        canvas.setFillAlpha(0.09)
        canvas.drawImage(
            ImageReader(str(logo_path)),
            45 * mm,
            85 * mm,
            width=120 * mm,
            height=100 * mm,
            preserveAspectRatio=True,
            anchor="c",
            mask="auto",
        )
        canvas.restoreState()

    story = [
        Paragraph("MILITARY POLICE INVESTIGATION MANAGEMENT SYSTEM", title_style),
        Paragraph("CLEARANCE CERTIFICATE", title_style),
        Paragraph(
            "This is to certify that the following personnel record was checked "
            "against cases recorded in MPIMS.",
            body_style,
        ),
    ]
    details = [
        ["Certificate number", escape(clearance_request.certificate_number)],
        ["Name", escape(subject.name)],
        ["Rank", escape(subject.rank or "Not recorded")],
        ["Service number", escape(subject.service_number)],
        ["Unit", escape(subject.unit.name if subject.unit_id else "Not recorded")],
        ["Date approved", approved_at.strftime("%d %B %Y")],
        ["Valid until", timezone.localtime(clearance_request.expires_at).strftime("%d %B %Y")],
        ["MPIMS case status", "No ongoing MPIMS cases were recorded as of the approval date."],
    ]
    table = Table(details, colWidths=[48 * mm, 105 * mm], hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f1f5f9")),
                ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#334155")),
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("FONTNAME", (1, 0), (1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("LEADING", (0, 0), (-1, -1), 13),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    story.extend(
        [
            table,
            Spacer(1, 12 * mm),
            Paragraph(
                "This certificate reflects MPIMS records as of the approval date "
                "and is valid for six months unless invalidated earlier by a new MPIMS case. "
                "It does not certify records held outside MPIMS.",
                body_style,
            ),
            Spacer(1, 10 * mm),
            Paragraph(f"Approved by: {escape(clearance_request.reviewed_by.name)}", body_style),
            Paragraph(
                f"Authority: {escape(clearance_request.reviewed_by.get_role_display())}",
                body_style,
            ),
        ]
    )
    document.build(story, onFirstPage=draw_watermark, onLaterPages=draw_watermark)
    buffer.seek(0)
    return buffer


class ClearanceRequestListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if can_review_clearance(request.user):
            requests = ClearanceRequest.objects.select_related(
                "requester", "subject__unit", "reviewed_by"
            )
            return Response(
                [
                    clearance_request_data(item, include_case_check=True)
                    for item in requests
                ]
            )
        if not can_request_unit_clearance(request.user):
            return Response(
                {"detail": "You are not authorized to access clearance requests."},
                status=status.HTTP_403_FORBIDDEN,
            )
        requests = ClearanceRequest.objects.filter(
            subject__unit_id=request.user.unit_id
        ).select_related("requester", "subject__unit", "reviewed_by")
        return Response([clearance_request_data(item) for item in requests])

    def post(self, request):
        if not can_request_unit_clearance(request.user):
            return Response(
                {"detail": "Only authorized unit personnel can submit clearance requests."},
                status=status.HTTP_403_FORBIDDEN,
            )

        service_number = str(request.data.get("service_number", "")).strip()
        if not service_number:
            return Response(
                {"detail": "Enter the personnel service number."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        subject = User.objects.select_related("unit").filter(
            service_number=service_number,
            is_active=True,
            unit_id=request.user.unit_id,
        ).first()
        if subject is None:
            return Response(
                {
                    "detail": (
                        "No active personnel with that service number is assigned to your unit."
                    )
                },
                status=status.HTTP_404_NOT_FOUND,
            )
        ongoing_cases = ongoing_case_details_for_service_number(subject.service_number)
        if ongoing_cases:
            return Response(
                {
                    "detail": (
                        "We regret that a clearance certificate cannot be issued while "
                        "ongoing MPIMS cases remain. The personnel must be cleared by MPC first."
                    ),
                    "ongoing_cases": ongoing_cases,
                },
                status=status.HTTP_409_CONFLICT,
            )

        try:
            with transaction.atomic():
                User.objects.select_for_update().get(pk=subject.pk)
                if ClearanceRequest.objects.filter(
                    subject=subject,
                    status=ClearanceRequest.Status.PENDING,
                ).exists():
                    return Response(
                        {"detail": "A clearance request for this personnel is already pending."},
                        status=status.HTTP_409_CONFLICT,
                    )
                clearance_request = ClearanceRequest.objects.create(
                    requester=request.user,
                    subject=subject,
                )
        except IntegrityError:
            if ClearanceRequest.objects.filter(
                subject=subject,
                status=ClearanceRequest.Status.PENDING,
            ).exists():
                return Response(
                    {"detail": "A clearance request for this personnel is already pending."},
                    status=status.HTTP_409_CONFLICT,
                )
            raise

        return Response(
            clearance_request_data(clearance_request),
            status=status.HTTP_201_CREATED,
        )


class ClearanceRequestDecisionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk, decision):
        if not can_review_clearance(request.user):
            return Response(
                {"detail": "Only Admin HQ can review clearance requests."},
                status=status.HTTP_403_FORBIDDEN,
            )
        clearance_request = get_object_or_404(
            ClearanceRequest.objects.select_related("requester", "subject__unit", "reviewed_by"),
            pk=pk,
        )
        if decision == "reject" and not str(request.data.get("decision_note", "")).strip():
            return Response(
                {"decision_note": "Provide a reason for rejecting this request."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            clearance_request = ClearanceRequest.objects.select_for_update().get(pk=pk)
            if clearance_request.status != ClearanceRequest.Status.PENDING:
                return Response(
                    {"detail": "This request has already been reviewed."},
                    status=status.HTTP_409_CONFLICT,
                )
            if decision == "approve":
                ongoing_cases = ongoing_case_details_for_service_number(
                    clearance_request.subject.service_number
                )
                if ongoing_cases:
                    return Response(
                        {
                            "detail": (
                                "Approval blocked: ongoing MPIMS cases must be cleared by MPC first."
                            ),
                            "ongoing_cases": ongoing_cases,
                            "ongoing_case_count": len(ongoing_cases),
                        },
                        status=status.HTTP_409_CONFLICT,
                    )
                clearance_request.status = ClearanceRequest.Status.APPROVED
                clearance_request.reviewed_at = timezone.now()
                clearance_request.expires_at = add_six_calendar_months(
                    clearance_request.reviewed_at
                )
                clearance_request.reviewed_by = request.user
                clearance_request.certificate_number = (
                    f"MPIMS-CLR-{clearance_request.reviewed_at:%Y}-{clearance_request.pk:06d}"
                )
                clearance_request.decision_note = str(
                    request.data.get("decision_note", "")
                ).strip()
            elif decision == "reject":
                clearance_request.status = ClearanceRequest.Status.REJECTED
                clearance_request.reviewed_at = timezone.now()
                clearance_request.reviewed_by = request.user
                clearance_request.decision_note = str(request.data["decision_note"]).strip()
            else:
                return Response(
                    {"detail": "Unsupported review decision."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            clearance_request.save(
                update_fields=[
                    "status",
                    "reviewed_at",
                    "expires_at",
                    "reviewed_by",
                    "certificate_number",
                    "decision_note",
                ]
            )

        return Response(clearance_request_data(clearance_request))


class ClearanceCertificateView(APIView):
    permission_classes = [IsAuthenticated]

    @method_decorator(never_cache)
    def get(self, request, pk):
        return self._respond_with_certificate(request, pk, as_attachment=False)

    def _respond_with_certificate(self, request, pk, *, as_attachment):
        clearance_request = get_object_or_404(
            ClearanceRequest.objects.select_related(
                "requester", "subject__unit", "reviewed_by", "invalidating_case"
            ),
            pk=pk,
        )
        if not (
            can_review_clearance(request.user)
            or request.user.pk in {clearance_request.requester_id, clearance_request.subject_id}
        ):
            return Response(
                {"detail": "Clearance certificate not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        ongoing_cases = ongoing_case_details_for_service_number(
            clearance_request.subject.service_number
        )
        if ongoing_cases:
            invalidate_current_certificates(
                {clearance_request.subject.service_number},
                ongoing_cases_for_service_number(
                    clearance_request.subject.service_number
                ).first(),
            )
            return Response(
                {
                    "detail": (
                        "This certificate cannot be issued because ongoing MPIMS cases "
                        "must be cleared by MPC first."
                    ),
                    "validity_status": "invalidated",
                    "ongoing_cases": ongoing_cases,
                },
                status=status.HTTP_410_GONE,
            )

        validity_status = clearance_validity_status(clearance_request)
        if validity_status != "valid":
            return Response(
                {
                    "detail": (
                        f"This clearance certificate is {validity_status} and is no longer available."
                    ),
                    "validity_status": validity_status,
                },
                status=status.HTTP_410_GONE,
            )

        pdf = _clearance_pdf(clearance_request)
        filename = slugify(clearance_request.certificate_number) or "clearance-certificate"
        return FileResponse(
            pdf,
            as_attachment=as_attachment,
            filename=f"{filename}.pdf",
            content_type="application/pdf",
        )


class ClearanceCertificateDownloadView(ClearanceCertificateView):
    @method_decorator(never_cache)
    def get(self, request, pk):
        return self._respond_with_certificate(request, pk, as_attachment=True)
