from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="user",
            name="role",
            field=models.CharField(
                choices=[
                    ("admin", "Admin"),
                    ("co", "Commanding Officer"),
                    ("corps_cmd", "Corps Commander"),
                    ("investigator", "Investigator"),
                    ("duty_officer", "Duty Officer"),
                    ("guardroom_ic", "Guardroom IC"),
                    ("detachment", "Detachment IC"),
                    ("personnel", "Personnel"),
                    ("legal", "Legal Officer"),
                    ("order_nco", "Order NCO"),
                    ("mpc_hqs", "MPC HQS Admin"),
                    ("bsm", "BSM"),
                    ("cop", "COP"),
                    ("adj", "Adjutant"),
                    ("2ic", "2nd in Command"),
                ],
                default="personnel",
                max_length=20,
            ),
        ),
    ]
