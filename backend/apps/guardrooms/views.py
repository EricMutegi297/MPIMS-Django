from rest_framework import viewsets
from .models import Guardroom, GuardPost
from .serializers import GuardroomSerializer, GuardPostSerializer


class GuardroomViewSet(viewsets.ModelViewSet):
    queryset = Guardroom.objects.select_related("unit", "ic").prefetch_related("posts").all()
    serializer_class = GuardroomSerializer
    filterset_fields = ["unit", "is_active"]


class GuardPostViewSet(viewsets.ModelViewSet):
    queryset = GuardPost.objects.select_related("guardroom").prefetch_related("assigned_personnel").all()
    serializer_class = GuardPostSerializer
    filterset_fields = ["guardroom"]
