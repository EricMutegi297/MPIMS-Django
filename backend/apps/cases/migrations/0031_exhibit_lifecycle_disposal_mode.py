from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("cases", "0030_exhibit_lifecycle_action"),
    ]

    operations = [
        migrations.AddField(
            model_name="exhibitstoragerequest",
            name="lifecycle_disposal_mode",
            field=models.CharField(blank=True, max_length=150),
        ),
    ]
