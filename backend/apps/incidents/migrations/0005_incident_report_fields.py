from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("incidents", "0004_incident_converted_case"),
    ]

    operations = [
        migrations.AddField(
            model_name="incident",
            name="service_vehicle",
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name="incident",
            name="unit_involved",
            field=models.CharField(blank=True, max_length=160),
        ),
        migrations.AddField(
            model_name="incident",
            name="originating_unit",
            field=models.CharField(blank=True, max_length=160),
        ),
        migrations.AddField(
            model_name="incident",
            name="civilian",
            field=models.CharField(blank=True, max_length=200),
        ),
        migrations.AddField(
            model_name="incident",
            name="service_member",
            field=models.CharField(blank=True, max_length=200),
        ),
        migrations.AddField(
            model_name="incident",
            name="history",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="incident",
            name="injuries",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="incident",
            name="damages",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="incident",
            name="how_occurred",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="incident",
            name="action_taken",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="incident",
            name="police_ob_reference",
            field=models.CharField(blank=True, max_length=160),
        ),
    ]
