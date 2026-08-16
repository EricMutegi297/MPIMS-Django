from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("cases", "0028_case_place_of_offence_case_police_station_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="exhibitstoragerequest",
            name="parent_request",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="additional_requests",
                to="cases.exhibitstoragerequest",
            ),
        ),
    ]
