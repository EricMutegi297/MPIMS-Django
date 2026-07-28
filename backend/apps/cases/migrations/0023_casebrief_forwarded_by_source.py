from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def seed_forward_sources(apps, schema_editor):
    CaseBrief = apps.get_model("cases", "CaseBrief")
    User = apps.get_model("users", "User")
    for brief in CaseBrief.objects.filter(forwarded_to_role__gt="", forwarded_by__isnull=True):
        if not brief.attached_by_id:
            continue
        try:
            actor = User.objects.get(pk=brief.attached_by_id)
        except User.DoesNotExist:
            continue
        brief.forwarded_by_id = actor.id
        brief.forwarded_from_role = actor.role or ""
        brief.save(update_fields=["forwarded_by", "forwarded_from_role"])


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("cases", "0022_casebrief_forwardrole_two_ic"),
    ]

    operations = [
        migrations.AddField(
            model_name="casebrief",
            name="forwarded_from_role",
            field=models.CharField(blank=True, max_length=20),
        ),
        migrations.AddField(
            model_name="casebrief",
            name="forwarded_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="forwarded_briefs",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.RunPython(seed_forward_sources, migrations.RunPython.noop),
    ]
