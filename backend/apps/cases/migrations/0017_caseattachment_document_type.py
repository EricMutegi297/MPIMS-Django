from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("cases", "0016_court_martial_milestones"),
    ]

    operations = [
        migrations.AddField(
            model_name="caseattachment",
            name="document_type",
            field=models.CharField(
                choices=[("general", "General"), ("judgment", "Judgment")],
                default="general",
                max_length=20,
            ),
        ),
    ]
