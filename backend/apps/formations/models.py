from django.db import models


class Formation(models.Model):
    name = models.CharField(max_length=100, unique=True)
    location = models.CharField(max_length=150, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "formations"
        ordering = ["name"]

    def __str__(self):
        return self.name


class Battalion(models.Model):
    class BattalionType(models.TextChoices):
        SPECIAL = "special", "Special"
        NORMAL = "normal", "Normal"
        HQS = "hqs", "HQs"
        PROTECTION = "protection", "Protection"

    name = models.CharField(max_length=100)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=30, blank=True)
    aor = models.CharField(max_length=200, blank=True)
    code = models.CharField(max_length=20, blank=True)
    battalion_type = models.CharField(
        max_length=20,
        choices=BattalionType.choices,
        default=BattalionType.NORMAL,
    )
    formation = models.ForeignKey(Formation, null=True, blank=True, on_delete=models.SET_NULL, related_name="battalions")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "battalions"
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.formation})"


class Unit(models.Model):
    class Service(models.TextChoices):
        KA = "KA", "Kenya Army"
        KAF = "KAF", "Kenya Air Force"
        KN = "KN", "Kenya Navy"

    name = models.CharField(max_length=100)
    code = models.CharField(max_length=20, blank=True)
    formation = models.ForeignKey(
        Formation,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="units",
    )
    battalion = models.ForeignKey(
        Battalion,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="units",
    )
    service = models.CharField(max_length=3, choices=Service.choices, default=Service.KA)
    mobile_no = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    location_county = models.CharField(max_length=150, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "units"
        ordering = ["name"]

    def __str__(self):
        return self.name


class Detachment(models.Model):
    class Company(models.TextChoices):
        A = "A", "A"
        B = "B", "B"
        C = "C", "C"
        D = "D", "D"

    battalion = models.ForeignKey(Battalion, on_delete=models.CASCADE, related_name="detachments")
    company = models.CharField(max_length=1, choices=Company.choices)
    name = models.CharField(max_length=100)
    aor = models.CharField(max_length=200)
    mobile_no = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "detachments"
        ordering = ["name"]

    def __str__(self):
        return self.name
