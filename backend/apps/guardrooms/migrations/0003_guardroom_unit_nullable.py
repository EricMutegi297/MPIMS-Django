from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("formations", "0005_battalion_formation_nullable"),
        ("guardrooms", "0002_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="guardroom",
            name="unit",
            field=models.OneToOneField(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="guardroom",
                to="formations.unit",
            ),
        ),
    ]
