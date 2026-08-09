from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("cases", "0036_alter_case_action_taken_alter_case_description_and_more"),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_schema = current_schema()
                      AND table_name = 'cases'
                      AND column_name = 'part_two_orders'
                ) AND NOT EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_schema = current_schema()
                      AND table_name = 'cases'
                      AND column_name = 'part_one_orders'
                ) THEN
                    ALTER TABLE cases RENAME COLUMN part_two_orders TO part_one_orders;
                ELSIF NOT EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_schema = current_schema()
                      AND table_name = 'cases'
                      AND column_name = 'part_one_orders'
                ) THEN
                    ALTER TABLE cases ADD COLUMN part_one_orders varchar(100) NULL;
                END IF;
            END $$;
            """,
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
