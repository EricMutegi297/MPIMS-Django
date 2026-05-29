from django.db import migrations


SQL_FORWARD = """
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'cases'
          AND column_name = 'brief_forwarded_co'
    ) THEN
        UPDATE cases SET brief_forwarded_co = FALSE WHERE brief_forwarded_co IS NULL;
        ALTER TABLE cases ALTER COLUMN brief_forwarded_co SET DEFAULT FALSE;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'cases'
          AND column_name = 'brief_forwarded_corps'
    ) THEN
        UPDATE cases SET brief_forwarded_corps = FALSE WHERE brief_forwarded_corps IS NULL;
        ALTER TABLE cases ALTER COLUMN brief_forwarded_corps SET DEFAULT FALSE;
    END IF;
END $$;
"""


SQL_REVERSE = """
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'cases'
          AND column_name = 'brief_forwarded_co'
    ) THEN
        ALTER TABLE cases ALTER COLUMN brief_forwarded_co DROP DEFAULT;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'cases'
          AND column_name = 'brief_forwarded_corps'
    ) THEN
 -        ALTER TABLE cases ALTER COLUMN brief_forwarded_corps DROP DEFAULT;
    END IF;
END $$;
"""


class Migration(migrations.Migration):

    dependencies = [
        ("cases", "0012_add_team_assigned_at"),
    ]

    operations = [
        migrations.RunSQL(sql=SQL_FORWARD, reverse_sql=SQL_REVERSE),
    ]
