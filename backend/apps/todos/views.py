from django.utils import timezone
from rest_framework import permissions, viewsets
from rest_framework.exceptions import PermissionDenied

from apps.users.access import (
    can_manage_battalion_todos,
    can_manage_corps_todos,
    is_hqs_admin,
)
from apps.users.models import User

from .models import TodoEvent
from .serializers import TodoEventSerializer
from .services import send_todo_reminders


class TodoEventViewSet(viewsets.ModelViewSet):
    serializer_class = TodoEventSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        today = timezone.localdate()
        queryset = TodoEvent.objects.select_related("battalion", "created_by", "updated_by")
        if user.is_superuser or is_hqs_admin(user):
            return queryset
        if user.role in {User.Role.CORPS_CMD, User.Role.SEC_CORPS_CMD}:
            return queryset.filter(scope=TodoEvent.Scope.CORPS)
        if user.battalion_id:
            return queryset.filter(scope=TodoEvent.Scope.BATTALION, battalion_id=user.battalion_id)
        return queryset.none()

    def list(self, request, *args, **kwargs):
        send_todo_reminders()
        return super().list(request, *args, **kwargs)

    def perform_create(self, serializer):
        user = self.request.user
        scope = serializer.validated_data.get("scope")
        if scope == TodoEvent.Scope.CORPS:
            if not can_manage_corps_todos(user):
                raise PermissionDenied("Only the Secretary Corps Commander can manage Corps events.")
        elif not can_manage_battalion_todos(user):
            raise PermissionDenied("Only a battalion Admin or Adjutant can manage battalion events.")
        if scope == TodoEvent.Scope.BATTALION and not user.is_superuser:
            battalion = serializer.validated_data.get("battalion")
            if not user.battalion_id or not battalion or battalion.id != user.battalion_id:
                raise PermissionDenied("Battalion users can only create events for their own battalion.")
        serializer.save(created_by=user, updated_by=user)

    def perform_update(self, serializer):
        user = self.request.user
        event = self.get_object()
        if event.scope == TodoEvent.Scope.CORPS:
            if not can_manage_corps_todos(user):
                raise PermissionDenied("Only the Secretary Corps Commander can manage Corps events.")
        elif not can_manage_battalion_todos(user):
            raise PermissionDenied("Only a battalion Admin or Adjutant can manage battalion events.")
        elif not user.is_superuser and event.battalion_id != user.battalion_id:
            raise PermissionDenied("Battalion users can only update their own battalion events.")
        if event.scope != serializer.validated_data.get("scope", event.scope):
            raise PermissionDenied("An event cannot be moved between Corps and battalion lists.")
        if event.scope == TodoEvent.Scope.BATTALION and not user.is_superuser:
            battalion = serializer.validated_data.get("battalion", event.battalion)
            if not battalion or battalion.id != user.battalion_id:
                raise PermissionDenied("Battalion users can only keep events in their own battalion.")
        serializer.save(updated_by=user)

    def perform_destroy(self, instance):
        user = self.request.user
        if instance.scope == TodoEvent.Scope.CORPS:
            allowed = can_manage_corps_todos(user)
        else:
            allowed = can_manage_battalion_todos(user) and (
                user.is_superuser
                or instance.battalion_id == user.battalion_id
            )
        if not allowed:
            raise PermissionDenied("You cannot delete this event.")
        instance.delete()
