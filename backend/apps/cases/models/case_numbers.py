from django.db import models


class CaseNumberSequence(models.Model):
    year = models.PositiveSmallIntegerField(primary_key=True)
    last_number = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "case_number_sequences"
