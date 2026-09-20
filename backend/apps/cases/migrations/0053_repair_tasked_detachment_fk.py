import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("cases", "0052_case_tasked_company"),
        ("formations", "0010_remove_detachment_battalion_company_and_more"),
    ]

    operations = [
        migrations.AlterField(
            model_name="case",
            name="tasked_detachment",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="tasked_cases",
                to="formations.detachment",
            ),
        ),
    ]
