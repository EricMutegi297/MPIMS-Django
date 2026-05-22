from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("cases", "0010_add_chargesheet_part_one_orders_served_at"),
        ("formations", "0001_initial"),
    ]

    operations = [
        # Add investigation_deadline to cases table
        migrations.AddField(
            model_name="case",
            name="investigation_deadline",
            field=models.DateField(null=True, blank=True),
        ),
        # Add detachment FK to InvestigationTeam
        migrations.AddField(
            model_name="investigationteam",
            name="detachment",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="investigation_teams",
                to="formations.detachment",
            ),
        ),
    ]
