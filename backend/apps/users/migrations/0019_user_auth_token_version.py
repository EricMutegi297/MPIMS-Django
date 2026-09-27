from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0018_alter_user_role"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="auth_token_version",
            field=models.PositiveIntegerField(default=0),
        ),
    ]
