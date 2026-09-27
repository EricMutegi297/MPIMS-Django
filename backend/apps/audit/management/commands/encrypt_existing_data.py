from django.apps import apps
from django.core.management.base import BaseCommand
from django.db import connection

from apps.common.fields import ENCRYPTED_PREFIX


class Command(BaseCommand):
    help = "Encrypt existing plaintext values for fields that use encrypted model fields."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report rows that would be re-saved without writing encrypted values.",
        )
        parser.add_argument(
            "--batch-size",
            type=int,
            default=200,
            help="Number of rows to process per database cursor batch.",
        )
        parser.add_argument(
            "--rotate",
            action="store_true",
            help="Re-encrypt all non-empty encrypted fields using the current active key.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        batch_size = max(1, options["batch_size"])
        rotate = options["rotate"]
        total_rows = 0

        for model in apps.get_models():
            encrypted_fields = [
                field.name
                for field in model._meta.fields
                if getattr(field, "encrypted", False)
            ]
            if not encrypted_fields:
                continue

            model_label = model._meta.label
            target_pks = self._target_pks(model, encrypted_fields, batch_size, rotate)
            model_count = len(target_pks)
            for pk in target_pks:
                if not dry_run:
                    obj = model._default_manager.only(model._meta.pk.name, *encrypted_fields).get(pk=pk)
                    if model._meta.label_lower == "audit.auditlog":
                        self._update_append_only_audit_row(model, obj, encrypted_fields)
                    else:
                        obj.save(update_fields=encrypted_fields)

            if model_count:
                total_rows += model_count
                if dry_run and rotate:
                    action = "Would rotate"
                elif dry_run:
                    action = "Would encrypt"
                elif rotate:
                    action = "Rotated"
                else:
                    action = "Encrypted"
                self.stdout.write(f"{action} {model_count} rows in {model_label}")

        self.stdout.write(self.style.SUCCESS(f"Done. Rows processed: {total_rows}"))

    @staticmethod
    def _update_append_only_audit_row(model, obj, encrypted_fields):
        quote_name = connection.ops.quote_name
        table = quote_name(model._meta.db_table)
        assignments = []
        values = []
        for name in encrypted_fields:
            field = model._meta.get_field(name)
            assignments.append(f"{quote_name(field.column)} = %s")
            values.append(field.get_db_prep_save(getattr(obj, name), connection))
        pk_field = model._meta.pk
        values.append(getattr(obj, pk_field.attname))
        with connection.cursor() as cursor:
            cursor.execute(
                f"UPDATE {table} SET {', '.join(assignments)} "
                f"WHERE {quote_name(pk_field.column)} = %s",
                values,
            )

    @staticmethod
    def _target_pks(model, encrypted_fields, batch_size, rotate=False):
        quote_name = connection.ops.quote_name
        table = quote_name(model._meta.db_table)
        pk_column = quote_name(model._meta.pk.column)
        columns = [quote_name(model._meta.get_field(field).column) for field in encrypted_fields]
        selected_columns = ", ".join([pk_column, *columns])
        target_pks = []

        with connection.cursor() as cursor:
            cursor.execute(f"SELECT {selected_columns} FROM {table}")
            while True:
                rows = cursor.fetchmany(batch_size)
                if not rows:
                    break
                for row in rows:
                    pk = row[0]
                    raw_values = row[1:]
                    if rotate:
                        should_process = any(value not in (None, "") for value in raw_values)
                    else:
                        should_process = any(
                            isinstance(value, str)
                            and value
                            and not value.startswith(ENCRYPTED_PREFIX)
                            for value in raw_values
                        )
                    if should_process:
                        target_pks.append(pk)

        return target_pks
