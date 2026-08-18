from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("cases", "0039_merge_20260816_1324"),
    ]

    operations = [
        migrations.AddField(
            model_name="case",
            name="tasking_no",
            field=models.CharField(blank=True, max_length=50),
        ),
    ]
