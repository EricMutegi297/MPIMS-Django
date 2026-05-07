from rest_framework import viewsets, permissions
from .models import Offence
from .serializers import OffenceSerializer

class OffenceViewSet(viewsets.ModelViewSet):
    queryset = Offence.objects.all()
    serializer_class = OffenceSerializer
    permission_classes = [permissions.IsAuthenticated]

    def create(self, request, *args, **kwargs):
        print("[DEBUG] Incoming Offence POST data:", request.data)
        return super().create(request, *args, **kwargs)
