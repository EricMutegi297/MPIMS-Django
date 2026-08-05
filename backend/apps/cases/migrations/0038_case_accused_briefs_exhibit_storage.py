from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import apps.cases.models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("formations", "0008_unit_battalion_relatedname"),
        ("cases", "0037_rename_part_one_orders_to_part_two_orders"),
    ]

    operations = [
        migrations.AddField(
            model_name="case",
            name="place_of_offence",
            field=models.CharField(blank=True, max_length=200),
        ),
        migrations.AlterField(
            model_name="case",
            name="police_station",
            field=models.CharField(blank=True, max_length=200),
        ),
        migrations.CreateModel(
            name="CaseAccused",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(blank=True, max_length=120)),
                ("rank", models.CharField(blank=True, max_length=60)),
                ("service_number", models.CharField(blank=True, max_length=20)),
                ("service", models.CharField(blank=True, choices=[("KA", "KA"), ("KAF", "KAF"), ("KN", "KN")], max_length=5)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("case", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="accused_entries", to="cases.case")),
                ("unit", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="accused_cases", to="formations.unit")),
            ],
            options={
                "db_table": "case_accused",
                "ordering": ["created_at"],
            },
        ),
        migrations.CreateModel(
            name="CaseBrief",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("file", models.FileField(upload_to=apps.cases.models.case_brief_path)),
                ("summary", models.TextField(blank=True)),
                ("status", models.CharField(choices=[("draft", "Draft"), ("forwarded", "Forwarded")], default="draft", max_length=20)),
                ("forwarded_to_role", models.CharField(blank=True, choices=[("hod", "HOD"), ("co", "Commanding Officer"), ("oc", "OC"), ("corps_cmd", "Corps Cmd"), ("detachment", "IC COY"), ("adj", "Adjutant"), ("2ic", "2IC")], max_length=20)),
                ("forwarded_note", models.TextField(blank=True)),
                ("forwarded_at", models.DateTimeField(blank=True, null=True)),
                ("forwarded_from_role", models.CharField(blank=True, max_length=20)),
                ("approved_at", models.DateTimeField(blank=True, null=True)),
                ("approved_note", models.TextField(blank=True)),
                ("revision", models.PositiveIntegerField(default=1)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("approved_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="approved_case_briefs", to=settings.AUTH_USER_MODEL)),
                ("attached_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="attached_briefs", to=settings.AUTH_USER_MODEL)),
                ("case", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="brief", to="cases.case")),
                ("forwarded_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="forwarded_briefs", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "db_table": "case_briefs",
                "ordering": ["-updated_at"],
            },
        ),
        migrations.CreateModel(
            name="CaseBackBrief",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("file", models.FileField(upload_to=apps.cases.models.case_back_brief_path)),
                ("note", models.TextField(blank=True)),
                ("uploaded_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("brief", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="back_brief", to="cases.casebrief")),
                ("uploaded_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="uploaded_back_briefs", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "db_table": "case_back_briefs",
                "ordering": ["-uploaded_at"],
            },
        ),
        migrations.CreateModel(
            name="CaseBriefForward",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("from_role", models.CharField(blank=True, max_length=20)),
                ("to_role", models.CharField(choices=[("hod", "HOD"), ("co", "Commanding Officer"), ("oc", "OC"), ("corps_cmd", "Corps Cmd"), ("detachment", "IC COY"), ("adj", "Adjutant"), ("2ic", "2IC")], max_length=20)),
                ("note", models.TextField(blank=True)),
                ("revision", models.PositiveIntegerField(default=1)),
                ("forwarded_at", models.DateTimeField(auto_now_add=True)),
                ("brief", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="forward_history", to="cases.casebrief")),
                ("forwarded_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="case_brief_forwards", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "db_table": "case_brief_forwards",
                "ordering": ["-forwarded_at", "-id"],
            },
        ),
        migrations.CreateModel(
            name="ExhibitStorageRequest",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("exhibit_name", models.CharField(max_length=150)),
                ("description", models.TextField(blank=True)),
                ("quantity", models.PositiveIntegerField(default=1)),
                ("photo", models.FileField(blank=True, null=True, upload_to=apps.cases.models.exhibit_photo_path)),
                ("storage_scope", models.CharField(choices=[("detachment", "Company"), ("battalion", "Battalion"), ("special_battalion", "Special Battalion")], max_length=25)),
                ("status", models.CharField(choices=[("pending", "Pending"), ("approved", "Approved"), ("declined", "Declined"), ("stored", "Stored"), ("return_requested", "Return Requested"), ("disposal_requested", "Disposal Requested"), ("transfer_requested", "Transfer Requested"), ("retention_requested", "Retention Requested"), ("returned", "Returned"), ("disposed", "Disposed"), ("transferred", "Transferred"), ("retained", "Retained")], default="pending", max_length=20)),
                ("reviewer_comments", models.TextField(blank=True)),
                ("decline_reason", models.TextField(blank=True)),
                ("storage_reference", models.CharField(blank=True, max_length=100)),
                ("physical_location", models.CharField(blank=True, max_length=200)),
                ("lifecycle_action", models.CharField(blank=True, choices=[("return_accused", "Return to Accused"), ("return_owner", "Return to Owner/Witness"), ("dispose", "Dispose/Destroy"), ("transfer", "Transfer to Another Authority"), ("retain", "Retain for Court Martial")], max_length=25)),
                ("lifecycle_reason", models.TextField(blank=True)),
                ("lifecycle_recipient_name", models.CharField(blank=True, max_length=150)),
                ("lifecycle_recipient_identifier", models.CharField(blank=True, max_length=100)),
                ("lifecycle_authority", models.CharField(blank=True, max_length=150)),
                ("lifecycle_disposal_mode", models.CharField(blank=True, max_length=150)),
                ("lifecycle_attachment", models.FileField(blank=True, null=True, upload_to=apps.cases.models.exhibit_lifecycle_document_path)),
                ("lifecycle_review_comments", models.TextField(blank=True)),
                ("lifecycle_decline_reason", models.TextField(blank=True)),
                ("reviewed_at", models.DateTimeField(blank=True, null=True)),
                ("stored_at", models.DateTimeField(blank=True, null=True)),
                ("lifecycle_requested_at", models.DateTimeField(blank=True, null=True)),
                ("lifecycle_reviewed_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("case", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="exhibit_storage_requests", to="cases.case")),
                ("lifecycle_requested_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="requested_exhibit_lifecycle_actions", to=settings.AUTH_USER_MODEL)),
                ("lifecycle_reviewed_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="reviewed_exhibit_lifecycle_actions", to=settings.AUTH_USER_MODEL)),
                ("parent_request", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="additional_requests", to="cases.exhibitstoragerequest")),
                ("requested_by", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="exhibit_storage_requests", to=settings.AUTH_USER_MODEL)),
                ("reviewed_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="reviewed_exhibit_storage_requests", to=settings.AUTH_USER_MODEL)),
                ("stored_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="stored_exhibit_storage_requests", to=settings.AUTH_USER_MODEL)),
                ("target_battalion", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="exhibit_storage_requests", to="formations.battalion")),
                ("target_detachment", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="exhibit_storage_requests", to="formations.detachment")),
            ],
            options={
                "db_table": "exhibit_storage_requests",
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddConstraint(
            model_name="casebriefforward",
            constraint=models.UniqueConstraint(fields=("brief", "revision", "to_role"), name="uniq_case_brief_forward_revision_target"),
        ),
        migrations.AlterField(
            model_name="caseactivitylog",
            name="action",
            field=models.CharField(choices=[("case_created", "Case Created"), ("status_changed", "Status Changed"), ("attachment_uploaded", "Attachment Uploaded"), ("attachment_deleted", "Attachment Deleted"), ("team_assigned", "Team Assigned"), ("battalion_tasked", "Battalion Tasked"), ("detachment_tasked", "Company Tasked"), ("case_updated", "Case Updated"), ("brief_attached", "Brief Attached"), ("brief_updated", "Brief Updated"), ("brief_forwarded", "Brief Forwarded")], max_length=30),
        ),
        migrations.AlterField(
            model_name="caseactivitylog",
            name="detail",
            field=models.TextField(blank=True),
        ),
    ]
