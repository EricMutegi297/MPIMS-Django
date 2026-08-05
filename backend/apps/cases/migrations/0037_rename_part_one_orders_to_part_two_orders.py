from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("cases", "0021_casecourtmartialattachment"),
    ]

    operations = [
        migrations.RenameField(
            model_name="case",
            old_name="part_one_orders",
            new_name="part_two_orders",
        ),
    ]
