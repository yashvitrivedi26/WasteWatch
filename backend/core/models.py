from django.conf import settings
from django.db import models
from django.utils import timezone

from ml import ward


class Profile(models.Model):
    ROLES = [("citizen", "Citizen"), ("officer", "Ward officer"), ("worker", "Sanitation worker")]
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile")
    role = models.CharField(max_length=10, choices=ROLES, default="citizen")
    team = models.CharField(max_length=30, blank=True, help_text="Workers only")

    def __str__(self):
        return f"{self.user.username} ({self.role})"


class Block(models.Model):
    code = models.CharField(max_length=5, unique=True)
    row = models.PositiveSmallIntegerField()
    col = models.PositiveSmallIntegerField()
    last_pickup_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-row", "col"]
        unique_together = [("row", "col")]

    def __str__(self):
        return self.code

    @property
    def bounds(self):
        return ward.block_bounds(self.row, self.col)


class Report(models.Model):
    SIZES = [("small", "Small (bag)"), ("medium", "Medium (pile)"), ("large", "Large (dump)")]
    TYPES = [("household", "Household"), ("plastic", "Plastic"), ("organic", "Organic / food"),
             ("construction", "Construction debris"), ("mixed", "Mixed")]
    block = models.ForeignKey(Block, on_delete=models.CASCADE, related_name="reports")
    reporter = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    photo = models.ImageField(upload_to="reports/%Y/%m/")
    lat = models.FloatField()
    lng = models.FloatField()
    size = models.CharField(max_length=10, choices=SIZES, default="medium")
    type = models.CharField(max_length=15, choices=TYPES, default="mixed")
    ai_label = models.CharField(max_length=50, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-created_at"]


class RiskScore(models.Model):
    block = models.ForeignKey(Block, on_delete=models.CASCADE, related_name="risk_scores")
    date = models.DateField()
    prob = models.FloatField()
    reasons = models.JSONField(default=list)
    created_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date"]
        unique_together = [("block", "date")]


class Task(models.Model):
    STATUSES = [("assigned", "Assigned"), ("in_progress", "In progress"), ("cleared", "Cleared")]
    OPEN = ("assigned", "in_progress")
    block = models.ForeignKey(Block, on_delete=models.CASCADE, related_name="tasks")
    team = models.CharField(max_length=30)
    status = models.CharField(max_length=12, choices=STATUSES, default="assigned")
    before_photo = models.ImageField(upload_to="tasks/before/", blank=True)
    after_photo = models.ImageField(upload_to="tasks/after/", blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    cleared_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
