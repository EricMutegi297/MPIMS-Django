from rest_framework import viewsets, permissions
from rest_framework.exceptions import PermissionDenied
from .models import Offence
from .serializers import OffenceSerializer

class OffenceViewSet(viewsets.ModelViewSet):
    queryset = Offence.objects.all()
    serializer_class = OffenceSerializer
    permission_classes = [permissions.IsAuthenticated]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if request.method not in permissions.SAFE_METHODS and not request.user.is_superuser:
            raise PermissionDenied("Only superusers can manage offences.")
