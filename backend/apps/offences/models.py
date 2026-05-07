from django.db import models

class Offence(models.Model):
    category = models.CharField(max_length=100)
    name = models.CharField(max_length=200)

    class Meta:
        unique_together = ("category", "name")
        ordering = ["category", "name"]
        db_table = "offences"

    def __str__(self):
        return f"{self.category} - {self.name}"