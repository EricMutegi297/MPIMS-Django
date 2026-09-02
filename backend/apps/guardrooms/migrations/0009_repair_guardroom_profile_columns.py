from django.db import migrations


def add_missing_guardroom_columns(apps, schema_editor):
    table_name = "guardrooms"
    with schema_editor.connection.cursor() as cursor:
        existing = {
            column.name
            for column in schema_editor.connection.introspection.get_table_description(
                cursor,
                table_name,
            )
        }

    additions = {
        "capacity": 'ALTER TABLE "guardrooms" ADD COLUMN "capacity" integer NOT NULL DEFAULT 0',
        "location": 'ALTER TABLE "guardrooms" ADD COLUMN "location" varchar(150) NOT NULL DEFAULT \'\'',
        "phone_no": 'ALTER TABLE "guardrooms" ADD COLUMN "phone_no" varchar(30) NOT NULL DEFAULT \'\'',
    }
    for column_name, sql in additions.items():
        if column_name not in existing:
            schema_editor.execute(sql)


class Migration(migrations.Migration):

    dependencies = [
        ("guardrooms", "0008_alter_guardroomplacementrequest_book_out_comments_and_more"),
    ]

    operations = [
        migrations.RunPython(add_missing_guardroom_columns, migrations.RunPython.noop),
    ]
