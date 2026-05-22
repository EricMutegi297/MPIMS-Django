from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("cases", "0013_fix_legacy_brief_forward_defaults"),
    ]

    operations = [
        migrations.AddField(
            model_name="case",
            name="closed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
