from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("cases", "0014_add_closed_at"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="case",
            name="mentioning_date",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="case",
            name="mentioning_remarks",
            field=models.TextField(blank=True),
        ),
        migrations.CreateModel(
            name="CaseCourtMartialHearing",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("hearing_date", models.DateField()),
                ("remarks", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("case", models.ForeignKey(on_delete=models.deletion.CASCADE, related_name="court_martial_hearings", to="cases.case")),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "db_table": "case_court_martial_hearings",
                "ordering": ["hearing_date", "created_at"],
            },
        ),
    ]
