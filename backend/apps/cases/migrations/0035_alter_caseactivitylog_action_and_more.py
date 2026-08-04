from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("cases", "0034_renormalize_assigned_case_status"),
    ]

    operations = [
        migrations.AlterField(
            model_name="caseactivitylog",
            name="action",
            field=models.CharField(
                choices=[
                    ("case_created", "Case Created"),
                    ("status_changed", "Status Changed"),
                    ("attachment_uploaded", "Attachment Uploaded"),
                    ("attachment_deleted", "Attachment Deleted"),
                    ("team_assigned", "Team Assigned"),
                    ("battalion_tasked", "Battalion Tasked"),
                    ("detachment_tasked", "Company Tasked"),
                    ("case_updated", "Case Updated"),
                    ("brief_attached", "Brief Attached"),
                    ("brief_updated", "Brief Updated"),
                    ("brief_forwarded", "Brief Forwarded"),
                ],
                max_length=30,
            ),
        ),
        migrations.AlterField(
            model_name="casebrief",
            name="forwarded_to_role",
            field=models.CharField(
                blank=True,
                choices=[
                    ("hod", "HOD"),
                    ("co", "Commanding Officer"),
                    ("oc", "OC"),
                    ("corps_cmd", "Corps Cmd"),
                    ("detachment", "IC COY"),
                    ("adj", "Adjutant"),
                    ("2ic", "2IC"),
                ],
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="casebriefforward",
            name="to_role",
            field=models.CharField(
                choices=[
                    ("hod", "HOD"),
                    ("co", "Commanding Officer"),
                    ("oc", "OC"),
                    ("corps_cmd", "Corps Cmd"),
                    ("detachment", "IC COY"),
                    ("adj", "Adjutant"),
                    ("2ic", "2IC"),
                ],
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="exhibitstoragerequest",
            name="storage_scope",
            field=models.CharField(
                choices=[
                    ("detachment", "Company"),
                    ("battalion", "Battalion"),
                    ("special_battalion", "Special Battalion"),
                ],
                max_length=25,
            ),
        ),
    ]
