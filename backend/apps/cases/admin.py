from django.contrib import admin
from .models import Case, CaseCourtMartialHearing, ExhibitStorageRequest
admin.site.register(Case)
admin.site.register(CaseCourtMartialHearing)
admin.site.register(ExhibitStorageRequest)
