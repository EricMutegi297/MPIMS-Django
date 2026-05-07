from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("formations", "0002_battalion_battalion_type"),
    ]

    operations = [
        migrations.AddField(
            model_name="battalion",
            name="email",
            field=models.EmailField(blank=True, max_length=254),
        ),
        migrations.AddField(
            model_name="battalion",
            name="phone",
            field=models.CharField(blank=True, max_length=30),
        ),
        migrations.AddField(
            model_name="battalion",
            name="aor",
            field=models.CharField(blank=True, max_length=200),
        ),
    ]
