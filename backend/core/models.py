from django.conf import settings
from django.db import models
from django.utils import timezone


class Ward(models.Model):
    name = models.CharField(max_length=80)
    code = models.CharField(max_length=10, unique=True)
    city = models.CharField(max_length=60, default="Bhavnagar")
    center_lat = models.FloatField()
    center_lng = models.FloatField()
    radius_km = models.FloatField(default=4, help_text="Reports within this distance are routed to this ward")
    office_name = models.CharField(max_length=120, blank=True)
    office_address = models.CharField(max_length=250, blank=True)
    office_phone = models.CharField(max_length=30, blank=True)
    office_email = models.CharField(max_length=120, blank=True)
    office_hours = models.CharField(max_length=80, blank=True, default="Mon-Sat, 10:00 AM - 6:00 PM")
    office_lat = models.FloatField(null=True, blank=True)
    office_lng = models.FloatField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Team(models.Model):
    ward = models.ForeignKey(Ward, on_delete=models.CASCADE, related_name="teams")
    name = models.CharField(max_length=30)

    class Meta:
        unique_together = [("ward", "name")]
        ordering = ["ward", "name"]

    def __str__(self):
        return f"{self.name} ({self.ward.code})"


class Profile(models.Model):
    ROLES = [("citizen", "Citizen"), ("officer", "Ward officer"), ("worker", "Sanitation worker"), ("admin", "Administrator")]
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile")
    role = models.CharField(max_length=10, choices=ROLES, default="citizen")
    ward = models.ForeignKey(Ward, null=True, blank=True, on_delete=models.SET_NULL, related_name="staff")
    team = models.ForeignKey(Team, null=True, blank=True, on_delete=models.SET_NULL, related_name="members")
    phone = models.CharField(max_length=20, blank=True)

    def __str__(self):
        return f"{self.user.username} ({self.role})"


class Report(models.Model):
    TYPES = [("household", "Household"), ("plastic", "Plastic"), ("organic", "Organic / food"),
             ("construction", "Construction debris"), ("mixed", "Mixed")]
    LEVELS = [("low", "Low"), ("medium", "Medium"), ("high", "High")]
    STATUSES = [("new", "New"), ("assigned", "Assigned"), ("in_progress", "In progress"),
                ("cleared", "Cleared"), ("rejected", "Rejected")]
    ACTIVE = ("new", "assigned", "in_progress")

    code = models.CharField(max_length=20, blank=True, db_index=True)
    ward = models.ForeignKey(Ward, on_delete=models.CASCADE, related_name="reports")
    reporter = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    photo = models.ImageField(upload_to="reports/%Y/%m/")
    overlay = models.ImageField(upload_to="reports/overlay/%Y/%m/", blank=True)
    lat = models.FloatField()
    lng = models.FloatField()
    address = models.CharField(max_length=250, blank=True)
    accuracy_m = models.PositiveIntegerField(null=True, blank=True, help_text="GPS accuracy radius when reported")
    location_source = models.CharField(max_length=10, blank=True)  # gps | exif | map | search
    type = models.CharField(max_length=15, choices=TYPES, default="mixed")
    note = models.CharField(max_length=300, blank=True)
    contact_phone = models.CharField(max_length=20, blank=True)
    is_emergency = models.BooleanField(default=False)  # set by the officer (or when the officer confirms a request)
    EM_CATEGORIES = [("hospital", "Hospital / clinic"), ("school", "School / college"), ("water", "Drinking water / drain"),
                     ("food", "Food market / eatery"), ("worship", "Temple / mosque / church"), ("hazard", "Hazardous / burning / medical waste"),
                     ("other", "Other")]
    emergency_status = models.CharField(max_length=10, blank=True)  # "" | pending | confirmed | rejected
    emergency_category = models.CharField(max_length=10, blank=True, choices=EM_CATEGORIES)
    emergency_reason = models.CharField(max_length=300, blank=True)
    emergency_place = models.CharField(max_length=150, blank=True, help_text="Sensitive place found nearby on OpenStreetMap")
    # OpenCV analysis
    coverage_pct = models.FloatField(default=0)
    level = models.CharField(max_length=6, choices=LEVELS, default="low")
    eta_min = models.PositiveIntegerField(default=15, help_text="Estimated minimum minutes to clear")
    eta_max = models.PositiveIntegerField(default=25)
    photo_hash = models.CharField(max_length=16, blank=True)
    ai_label = models.CharField(max_length=60, blank=True)
    analysis = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=12, choices=STATUSES, default="new", db_index=True)
    created_at = models.DateTimeField(default=timezone.now)
    cleared_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kw):
        super().save(*args, **kw)
        if not self.code:
            self.code = f"WW-{self.created_at:%y%m}-{self.pk:04d}"
            super().save(update_fields=["code"])

    def __str__(self):
        return self.code or str(self.pk)


class Batch(models.Model):
    ward = models.ForeignKey(Ward, on_delete=models.CASCADE, related_name="batches")
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name="batches")
    name = models.CharField(max_length=40, blank=True)
    note = models.CharField(max_length=250, blank=True)
    deadline = models.DateTimeField(null=True, blank=True, help_text="All stops must be cleared by this time")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kw):
        super().save(*args, **kw)
        if not self.name:
            self.name = f"Batch {self.created_at:%d%m}-{self.pk}"
            super().save(update_fields=["name"])


class Task(models.Model):
    STATUSES = [("assigned", "Assigned"), ("in_progress", "In progress"), ("cleared", "Cleared")]
    OPEN = ("assigned", "in_progress")
    report = models.ForeignKey(Report, on_delete=models.CASCADE, related_name="tasks")
    batch = models.ForeignKey(Batch, on_delete=models.CASCADE, related_name="tasks")
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name="tasks")
    stop_no = models.PositiveSmallIntegerField(default=1)
    status = models.CharField(max_length=12, choices=STATUSES, default="assigned", db_index=True)
    created_at = models.DateTimeField(default=timezone.now)  # = the time the team was notified
    before_photo = models.ImageField(upload_to="tasks/before/", blank=True)
    before_at = models.DateTimeField(null=True, blank=True)
    before_lat = models.FloatField(null=True, blank=True)
    before_lng = models.FloatField(null=True, blank=True)
    before_coverage = models.FloatField(null=True, blank=True)
    distance_m = models.PositiveIntegerField(null=True, blank=True)
    after_photo = models.ImageField(upload_to="tasks/after/", blank=True)
    after_at = models.DateTimeField(null=True, blank=True)
    after_coverage = models.FloatField(null=True, blank=True)
    verification = models.CharField(max_length=10, blank=True)  # verified | review

    class Meta:
        ordering = ["batch_id", "stop_no"]

    @property
    def response_sec(self):
        return round((self.before_at - self.created_at).total_seconds()) if self.before_at else None

    @property
    def work_sec(self):
        return round((self.after_at - self.before_at).total_seconds()) if self.after_at and self.before_at else None

    @property
    def total_sec(self):
        return round((self.after_at - self.created_at).total_seconds()) if self.after_at else None

    @property
    def response_min(self):
        return round((self.before_at - self.created_at).total_seconds() / 60) if self.before_at else None

    @property
    def work_min(self):
        return round((self.after_at - self.before_at).total_seconds() / 60) if self.after_at and self.before_at else None

    @property
    def total_min(self):
        return round((self.after_at - self.created_at).total_seconds() / 60) if self.after_at else None


class Notification(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    kind = models.CharField(max_length=20)  # report | emergency | assigned | started | collected
    title = models.CharField(max_length=140)
    body = models.CharField(max_length=300, blank=True)
    report = models.ForeignKey(Report, null=True, blank=True, on_delete=models.CASCADE)
    task = models.ForeignKey(Task, null=True, blank=True, on_delete=models.CASCADE)
    read = models.BooleanField(default=False)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-created_at"]


class ContentOverride(models.Model):
    """Admin-edited website text. Overrides the built-in translation for one language + key."""
    lang = models.CharField(max_length=5)
    key = models.CharField(max_length=60)
    value = models.JSONField()

    class Meta:
        unique_together = [("lang", "key")]


class SiteSetting(models.Model):
    key = models.CharField(max_length=40, unique=True)
    value = models.JSONField()


class AuditLog(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    action = models.CharField(max_length=60)
    target = models.CharField(max_length=120, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-created_at"]
