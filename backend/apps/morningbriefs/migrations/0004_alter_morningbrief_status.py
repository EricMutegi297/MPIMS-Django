from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("morningbriefs", "0003_morningbrief_battalion_morningbrief_detachment_and_more"),
    ]

    operations = [
        migrations.AlterField(
            model_name="morningbrief",
            name="status",
            field=models.CharField(
                choices=[
                    ("draft", "Draft"),
                    ("published", "Published"),
                    ("pending", "Pending"),
                    ("submitted", "Submitted"),
                    ("late", "Late"),
                    ("belated", "Belated"),
                ],
                default="draft",
                max_length=10,
            ),
        ),
    ]
