from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models


class UserManager(BaseUserManager):
    def create_user(self, service_number, password=None, **extra):
        if not service_number:
            raise ValueError("Service number is required")
        user = self.model(service_number=service_number, **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, service_number, password=None, **extra):
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        extra.setdefault("role", User.Role.ADMIN)
        return self.create_user(service_number, password, **extra)


class User(AbstractBaseUser, PermissionsMixin):
    class Role(models.TextChoices):
        ADMIN = "admin", "Admin"
        CO = "co", "Commanding Officer"
        OC = "oc", "Officer Commanding"
        CORPS_CMD = "corps_cmd", "Corps Commander"
        INVESTIGATOR = "investigator", "Investigator"
        DUTY_OFFICER = "duty_officer", "Duty Officer"
        HOD = "hod", "Head of Department"
        GUARDROOM_IC = "guardroom_ic", "Guardroom IC"
        DETACHMENT = "detachment", "Detachment IC"
        PERSONNEL = "personnel", "Personnel"
        LEGAL = "legal", "Legal Officer"
        ORDER_NCO = "order_nco", "Order NCO"
        MPC_HQS = "mpc_hqs", "MPC HQS Admin"
        BSM = "bsm", "BSM"
        COP = "cop", "COP"
        ADJ = "adj", "Adjutant"
        TWO_IC = "2ic", "2nd in Command"

    service_number = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=120)
    rank = models.CharField(max_length=60, blank=True)
    email = models.EmailField(blank=True)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.PERSONNEL)
    unit = models.ForeignKey(
        "formations.Unit", null=True, blank=True, on_delete=models.SET_NULL, related_name="users"
    )
    battalion = models.ForeignKey(
        "formations.Battalion", null=True, blank=True, on_delete=models.SET_NULL, related_name="users"
    )
    formation = models.ForeignKey(
        "formations.Formation", null=True, blank=True, on_delete=models.SET_NULL, related_name="users"
    )
    detachment = models.ForeignKey(
        "formations.Detachment", null=True, blank=True, on_delete=models.SET_NULL, related_name="users"
    )
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    must_change_password = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = "service_number"
    REQUIRED_FIELDS = ["name"]

    class Meta:
        db_table = "users"
        ordering = ["name"]

    def __str__(self):
        return f"{self.rank} {self.name} ({self.service_number})"
