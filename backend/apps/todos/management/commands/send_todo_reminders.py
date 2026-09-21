from django.core.management.base import BaseCommand

from apps.todos.services import send_todo_reminders


class Command(BaseCommand):
    help = "Send dashboard and email reminders for events due within five days."

    def handle(self, *args, **options):
        count = send_todo_reminders()
        self.stdout.write(self.style.SUCCESS(f"Processed {count} todo-event reminders."))
