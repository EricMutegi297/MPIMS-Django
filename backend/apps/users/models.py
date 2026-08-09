from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone

from apps.common.fields import EncryptedTextField


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
        DETACHMENT = "detachment", "IC COY"
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


class TOTPDevice(models.Model):
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="totp_device",
    )
    secret = EncryptedTextField()
    confirmed = models.BooleanField(default=False)
    failed_attempts = models.PositiveSmallIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)
    last_verified_counter = models.BigIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    last_used_ip = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        db_table = "user_totp_devices"
        ordering = ["-created_at"]

    def __str__(self):
        status = "confirmed" if self.confirmed else "pending"
        return f"{self.user.service_number} TOTP ({status})"

    @property
    def is_locked(self):
        return bool(self.locked_until and self.locked_until > timezone.now())


class TOTPLoginChallenge(models.Model):
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="totp_login_challenges",
    )
    challenge_id = models.CharField(max_length=64, unique=True, db_index=True)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    consumed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "user_totp_login_challenges"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "expires_at"]),
            models.Index(fields=["consumed_at"]),
        ]

    @property
    def is_usable(self):
        return self.consumed_at is None and self.expires_at > timezone.now()

    def consume(self):
        self.consumed_at = timezone.now()
        self.save(update_fields=["consumed_at"])

    def __str__(self):
        return f"{self.user.service_number} TOTP challenge {self.challenge_id}"


class LoginThrottle(models.Model):
    class Scope(models.TextChoices):
        ACCOUNT = "account", "Account"
        IP = "ip", "IP Address"
        ACCOUNT_IP = "account_ip", "Account + IP"
        PASSWORD_RESET_EMAIL = "password_reset_email", "Password Reset Email"
        PASSWORD_RESET_IP = "password_reset_ip", "Password Reset IP"
        PASSWORD_RESET_CONFIRM_IP = "reset_confirm_ip", "Password Reset Confirm IP"
        PASSWORD_RESET_CONFIRM_UID = "reset_confirm_uid", "Password Reset Confirm UID"

    scope = models.CharField(max_length=20, choices=Scope.choices)
    key_hash = models.CharField(max_length=64)
    label = EncryptedTextField(blank=True)
    failed_attempts = models.PositiveSmallIntegerField(default=0)
    first_failed_at = models.DateTimeField(null=True, blank=True)
    last_failed_at = models.DateTimeField(null=True, blank=True)
    locked_until = models.DateTimeField(null=True, blank=True)
    last_success_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "user_login_throttles"
        ordering = ["-updated_at"]
        constraints = [
            models.UniqueConstraint(fields=["scope", "key_hash"], name="uniq_login_throttle_scope_key"),
        ]
        indexes = [
            models.Index(fields=["scope", "locked_until"]),
            models.Index(fields=["last_failed_at"]),
        ]

    @property
    def is_locked(self):
        return bool(self.locked_until and self.locked_until > timezone.now())

    def __str__(self):
        return f"{self.scope} throttle ({self.failed_attempts})"
