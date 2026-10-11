from django.apps import AppConfig


class ClearancesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.clearances"

    def ready(self):
        from . import signals  # noqa: F401
