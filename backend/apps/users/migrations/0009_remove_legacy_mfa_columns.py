from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0008_loginthrottle"),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
            ALTER TABLE users DROP COLUMN IF EXISTS mfa_secret;
            ALTER TABLE users DROP COLUMN IF EXISTS mfa_enabled;
            """,
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
