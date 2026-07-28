from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("dutyrooms", "0002_part_one_order_serial"),
    ]

    operations = [
        migrations.AddField(
            model_name="occurrenceentry",
            name="place",
            field=models.CharField(blank=True, max_length=200),
        ),
        migrations.AddField(
            model_name="occurrenceentry",
            name="service_vehicle",
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name="occurrenceentry",
            name="unit_involved",
            field=models.CharField(blank=True, max_length=160),
        ),
        migrations.AddField(
            model_name="occurrenceentry",
            name="originating_unit",
            field=models.CharField(blank=True, max_length=160),
        ),
        migrations.AddField(
            model_name="occurrenceentry",
            name="civilian",
            field=models.CharField(blank=True, max_length=200),
        ),
        migrations.AddField(
            model_name="occurrenceentry",
            name="service_member",
            field=models.CharField(blank=True, max_length=200),
        ),
        migrations.AddField(
            model_name="occurrenceentry",
            name="history",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="occurrenceentry",
            name="injuries",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="occurrenceentry",
            name="damages",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="occurrenceentry",
            name="how_occurred",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="occurrenceentry",
            name="police_ob_reference",
            field=models.CharField(blank=True, max_length=160),
        ),
    ]
