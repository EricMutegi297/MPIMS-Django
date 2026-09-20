from django.db import migrations


CONSTRAINT_NAME = "cases_tasked_detachment_id_a10d3f8b_fk_detachments_id"


class Migration(migrations.Migration):

    dependencies = [
        ("cases", "0053_repair_tasked_detachment_fk"),
    ]

    operations = [
        migrations.RunSQL(
            sql=f"""
                ALTER TABLE cases
                DROP CONSTRAINT IF EXISTS {CONSTRAINT_NAME};
                ALTER TABLE cases
                ADD CONSTRAINT {CONSTRAINT_NAME}
                FOREIGN KEY (tasked_detachment_id)
                REFERENCES detachments (id)
                DEFERRABLE INITIALLY DEFERRED;
            """,
            reverse_sql=f"""
                ALTER TABLE cases
                DROP CONSTRAINT IF EXISTS {CONSTRAINT_NAME};
                ALTER TABLE cases
                ADD CONSTRAINT {CONSTRAINT_NAME}
                FOREIGN KEY (tasked_detachment_id)
                REFERENCES companies (id)
                DEFERRABLE INITIALLY DEFERRED;
            """,
        ),
    ]
