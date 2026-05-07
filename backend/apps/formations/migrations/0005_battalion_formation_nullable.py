from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("formations", "0004_detachment_battalion_company_fields"),
    ]

    operations = [
        migrations.AlterField(
            model_name="battalion",
            name="formation",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="battalions",
                to="formations.formation",
            ),
        ),
    ]
