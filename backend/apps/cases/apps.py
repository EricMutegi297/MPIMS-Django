import os
from django.apps import AppConfig


class CasesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.cases"

    def ready(self):
        # Avoid double-start when Django dev server auto-reloads
        if os.environ.get("RUN_MAIN") != "true":
            return
        try:
            from apscheduler.schedulers.background import BackgroundScheduler
            from apscheduler.triggers.cron import CronTrigger
            from django_apscheduler.jobstores import DjangoJobStore

            from .tasks import send_close_request_reminders

            scheduler = BackgroundScheduler(timezone="Africa/Nairobi")
            scheduler.add_jobstore(DjangoJobStore(), "default")

            # Run daily at 08:00 Kenya time
            scheduler.add_job(
                send_close_request_reminders,
                trigger=CronTrigger(hour=8, minute=0),
                id="send_close_request_reminders",
                name="Daily close-request reminders to HQS Admins",
                jobstore="default",
                replace_existing=True,
                misfire_grace_time=3600,  # allow up to 1h late
            )
            scheduler.start()
        except Exception as exc:
            import logging
            logging.getLogger(__name__).error(
                "Failed to start APScheduler for case reminders: %s", exc
            )
