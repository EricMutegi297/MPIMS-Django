from django.db import migrations, models
import django.core.validators


class Migration(migrations.Migration):
    dependencies = [
        ("cases", "0055_caseaccusedoffence"),
    ]

    operations = [
        migrations.AlterField(
            model_name="caseaccused",
            name="service_number",
            field=models.CharField(
                blank=True,
                max_length=20,
                validators=[
                    django.core.validators.RegexValidator(
                        message="Service number must contain numbers only.",
                        regex="^\\d+$",
                    )
                ],
            ),
        ),
    ]
