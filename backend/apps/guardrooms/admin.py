from django.contrib import admin
from .models import Guardroom, GuardPost, GuardroomPlacementRequest
admin.site.register(Guardroom)
admin.site.register(GuardPost)
admin.site.register(GuardroomPlacementRequest)
