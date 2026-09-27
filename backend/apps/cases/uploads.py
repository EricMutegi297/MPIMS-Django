import re
import socket
import struct
import unicodedata
import zipfile
from io import BytesIO
from pathlib import PurePosixPath
from urllib.parse import urlencode

from django.conf import settings
from rest_framework import serializers
from rest_framework.exceptions import APIException


DOCUMENT_MIME_TYPES = {
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".gif": "image/gif",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}
IMAGE_EXTENSIONS = {".gif", ".jpeg", ".jpg", ".png", ".webp"}
PDF_ONLY_FIELDS = {
    "abstract_acknowledgement_form",
    "chargesheet",
    "clearance_certificate",
    "reference_pdf",
    "traffic_accident_report",
    "rta_damage_authority",
    "transfer_letter",
}
GENERIC_MIME_TYPES = {"", "application/octet-stream", "binary/octet-stream"}
MAX_FILENAME_LENGTH = 150


class UploadScanUnavailable(APIException):
    status_code = 503
    default_detail = "The configured malware scanner is unavailable. The upload was rejected."
    default_code = "upload_scanner_unavailable"


def _normalize_filename(filename):
    basename = PurePosixPath(str(filename or "").replace("\\", "/")).name
    normalized = unicodedata.normalize("NFKC", basename)
    suffix = PurePosixPath(normalized).suffix.lower()
    stem = normalized[:-len(suffix)] if suffix else normalized
    stem = re.sub(r"[^A-Za-z0-9._-]+", "-", stem).strip(" .-_")
    if not stem:
        stem = "upload"
    available_stem_length = MAX_FILENAME_LENGTH - len(suffix)
    return f"{stem[:available_stem_length]}{suffix}"


def _signature_extension(content):
    if content.startswith(b"%PDF-"):
        return ".pdf"
    if content.startswith(b"\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1"):
        return ".doc"
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if content.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if content.startswith((b"GIF87a", b"GIF89a")):
        return ".gif"
    if len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return ".webp"
    if content.startswith(b"PK\x03\x04"):
        try:
            with zipfile.ZipFile(BytesIO(content)) as archive:
                names = set(archive.namelist())
                if "[Content_Types].xml" in names and "word/document.xml" in names:
                    return ".docx"
        except (OSError, zipfile.BadZipFile):
            return None
    return None


def _clamav_scan(content):
    host = settings.CASE_UPLOAD_CLAMAV_HOST
    port = settings.CASE_UPLOAD_CLAMAV_PORT
    timeout = settings.CASE_UPLOAD_CLAMAV_TIMEOUT
    chunk_size = 64 * 1024
    try:
        with socket.create_connection((host, port), timeout=timeout) as connection:
            connection.settimeout(timeout)
            connection.sendall(b"zINSTREAM\0")
            for offset in range(0, len(content), chunk_size):
                chunk = content[offset:offset + chunk_size]
                connection.sendall(struct.pack("!I", len(chunk)) + chunk)
            connection.sendall(struct.pack("!I", 0))

            response = bytearray()
            while not response.endswith(b"\0"):
                part = connection.recv(4096)
                if not part:
                    raise OSError("ClamAV closed the connection without a scan result.")
                response.extend(part)
    except OSError as exc:
        raise UploadScanUnavailable() from exc

    result = bytes(response).rstrip(b"\0").decode("utf-8", errors="replace")
    if result.endswith(" OK"):
        return
    if result.endswith(" FOUND"):
        raise serializers.ValidationError({"file": "The uploaded file failed malware scanning."})
    raise UploadScanUnavailable(f"ClamAV returned an unexpected scan result: {result}")


def validate_case_upload(upload, *, field_name="file", allowed_extensions=None):
    if not upload:
        return upload

    maximum_size = settings.CASE_DOCUMENT_MAX_UPLOAD_BYTES
    if upload.size <= 0:
        raise serializers.ValidationError({"file": "The uploaded file is empty."})
    if upload.size > maximum_size:
        raise serializers.ValidationError({
            "file": f"File size must not exceed {maximum_size // (1024 * 1024)} MB."
        })

    normalized_name = _normalize_filename(upload.name)
    extension = PurePosixPath(normalized_name).suffix.lower()
    permitted_extensions = allowed_extensions or set(DOCUMENT_MIME_TYPES)
    if extension not in permitted_extensions:
        allowed = ", ".join(sorted(permitted_extensions))
        raise serializers.ValidationError({"file": f"Allowed file extensions are: {allowed}."})

    original_position = upload.tell() if hasattr(upload, "tell") else 0
    try:
        upload.seek(0)
        content = upload.read(maximum_size + 1)
    finally:
        upload.seek(original_position)

    if len(content) > maximum_size:
        raise serializers.ValidationError({
            "file": f"File size must not exceed {maximum_size // (1024 * 1024)} MB."
        })
    actual_extension = _signature_extension(content)
    expected_signatures = {extension}
    if extension in {".jpg", ".jpeg"}:
        expected_signatures = {".jpg"}
    if actual_extension not in expected_signatures:
        raise serializers.ValidationError({
            "file": "The file contents do not match an allowed document signature."
        })

    mime_type = str(getattr(upload, "content_type", "") or "").split(";", 1)[0].strip().lower()
    expected_mime = DOCUMENT_MIME_TYPES[extension]
    if mime_type not in GENERIC_MIME_TYPES and mime_type != expected_mime:
        raise serializers.ValidationError({"file": "The declared MIME type does not match the file contents."})

    upload.name = normalized_name
    if settings.CASE_UPLOAD_CLAMAV_ENABLED:
        _clamav_scan(content)
    return upload


class CaseDocumentFileField(serializers.FileField):
    def __init__(self, *args, **kwargs):
        self.allowed_extensions = kwargs.pop("allowed_extensions", None)
        super().__init__(*args, **kwargs)

    def to_internal_value(self, data):
        uploaded_file = super().to_internal_value(data)
        field_name = getattr(getattr(uploaded_file, "field", None), "name", self.field_name)
        allowed_extensions = self.allowed_extensions
        if allowed_extensions is None and field_name in PDF_ONLY_FIELDS:
            allowed_extensions = {".pdf"}
        return validate_case_upload(
            uploaded_file,
            field_name=field_name,
            allowed_extensions=allowed_extensions,
        )

    def to_representation(self, value):
        if not value:
            return None
        owner = value.instance
        model_name = owner._meta.model_name
        if model_name == "case":
            case_id = owner.pk
            document_key = f"field-{value.field.name}"
        else:
            case_id = getattr(owner, "case_id", None)
            if model_name == "casebackbrief":
                case_id = owner.brief.case_id
                document_key = f"back-brief-{owner.pk}"
            elif model_name == "caseattachment":
                document_key = str(owner.pk)
            elif model_name == "casebrief":
                document_key = f"brief-{owner.pk}"
            elif model_name == "caseactivitylog":
                document_key = f"activity-{owner.pk}"
            elif model_name == "exhibitstoragerequest":
                prefix = "exhibit-lifecycle" if value.field.name == "lifecycle_attachment" else "exhibit-photo"
                document_key = f"{prefix}-{owner.pk}"
            else:
                return super().to_representation(value)
        if not case_id:
            return None
        filename = value.name.rsplit("/", 1)[-1]
        query = urlencode({"filename": filename})
        return f"/api/cases/{case_id}/documents/{document_key}/download/?{query}"


CASE_DOCUMENT_FIELDS = {
    "abstract_acknowledgement_form",
    "chargesheet",
    "clearance_certificate",
    "part_one_orders",
    "rfi_document",
    "served_abstract",
    "tasking_letter",
    "traffic_accident_report",
    "rta_damage_authority",
}
