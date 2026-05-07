from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import MorningBrief
from .serializers import MorningBriefSerializer


class MorningBriefViewSet(viewsets.ModelViewSet):
    queryset = MorningBrief.objects.select_related("unit", "submitted_by").all()
    serializer_class = MorningBriefSerializer
    filterset_fields = ["date", "unit", "status"]

    def get_queryset(self):
        user = self.request.user
        qs = MorningBrief.objects.select_related("unit", "submitted_by")
        if not user.is_authenticated:
            return qs.none()
        if user.is_superuser:
            return qs.all()
        if user.battalion_id:
            return qs.filter(unit__battalion_id=user.battalion_id)
        return qs.all()

    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        brief = self.get_object()
        brief.status = MorningBrief.Status.SUBMITTED
        brief.submitted_at = timezone.now()
        brief.submitted_by = request.user
        brief.save(update_fields=["status", "submitted_at", "submitted_by"])
        return Response(MorningBriefSerializer(brief).data)
