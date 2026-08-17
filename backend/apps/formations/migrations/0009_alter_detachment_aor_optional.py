from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("formations", "0008_unit_battalion_relatedname"),
    ]

    operations = [
        migrations.AlterField(
            model_name="detachment",
            name="aor",
            field=models.CharField(blank=True, max_length=200),
        ),
    ]
