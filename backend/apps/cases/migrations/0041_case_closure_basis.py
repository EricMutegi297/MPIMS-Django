from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("cases", "0040_case_tasking_no"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.RenameField(
                    model_name="case",
                    old_name="part_two_orders",
                    new_name="part_one_orders",
                ),
            ],
        ),
        migrations.AddField(
            model_name="case",
            name="closure_basis",
            field=models.CharField(
                blank=True,
                choices=[
                    ("part_ii_orders", "Part II Orders"),
                    ("cancellation_letter", "Cancellation Letter"),
                    ("service_hqs_authority", "Authority From Service HQs"),
                ],
                max_length=35,
            ),
        ),
        migrations.AddField(
            model_name="case",
            name="part_ii_order_serial_no",
            field=models.CharField(blank=True, max_length=50),
        ),
        migrations.AddField(
            model_name="case",
            name="part_ii_order_date",
            field=models.DateField(blank=True, null=True),
        ),
    ]
