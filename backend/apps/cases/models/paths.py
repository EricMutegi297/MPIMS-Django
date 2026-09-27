from django.db import models
from django.core.validators import RegexValidator
from django.conf import settings
from django.utils import timezone
from apps.common.fields import EncryptedTextField

def case_attachment_path(instance, filename):
    case_ref = instance.case_number or "draft"
    return f"cases/{case_ref}/{filename}"

def case_extra_attachment_path(instance, filename):
    case_ref = instance.case.case_number or "draft"
    return f"cases/{case_ref}/extra/{filename}"

def court_martial_attachment_path(instance, filename):
    case_ref = instance.milestone.case.case_number or "draft"
    return f"cases/{case_ref}/court-martial/{filename}"

def case_activity_reference_path(instance, filename):
    case_ref = instance.case.case_number or "draft"
    return f"cases/{case_ref}/activity/{filename}"

def case_brief_path(instance, filename):
    case_ref = instance.case.case_number or "draft"
    return f"cases/{case_ref}/brief/{filename}"

def case_back_brief_path(instance, filename):
    case_ref = instance.brief.case.case_number or "draft"
    return f"cases/{case_ref}/back-brief/{filename}"

def exhibit_photo_path(instance, filename):
    case_ref = instance.case.case_number or "draft"
    return f"cases/{case_ref}/exhibits/{filename}"

def exhibit_lifecycle_document_path(instance, filename):
    case_ref = instance.case.case_number or "draft"
    return f"cases/{case_ref}/exhibits/lifecycle/{filename}"
