from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("cases", "0036_alter_case_action_taken_alter_case_description_and_more"),
    ]

    operations = [
        migrations.RenameField(
            model_name="case",
            old_name="part_one_orders",
            new_name="part_two_orders",
        ),
    ]
