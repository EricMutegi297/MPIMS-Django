from django.contrib import admin
from .models import Case, CaseBrief, CaseCourtMartialHearing
admin.site.register(Case)
admin.site.register(CaseBrief)
admin.site.register(CaseCourtMartialHearing)
