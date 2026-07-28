from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("morningbriefs", "0004_alter_morningbrief_status"),
    ]

    operations = [
        migrations.AddField(
            model_name="morningbrief",
            name="morning_brief_year",
            field=models.PositiveSmallIntegerField(blank=True, editable=False, null=True),
        ),
        migrations.AddField(
            model_name="morningbrief",
            name="morning_brief_sequence",
            field=models.PositiveIntegerField(blank=True, editable=False, null=True),
        ),
    ]
