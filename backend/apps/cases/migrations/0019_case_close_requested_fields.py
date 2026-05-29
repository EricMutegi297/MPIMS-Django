from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("cases", "0018_caseactivitylog_reference_pdf"),
    ]

    operations = [
        migrations.AddField(
            model_name="case",
            name="close_requested",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="case",
            name="close_requested_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]