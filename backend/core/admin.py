from django.contrib import admin

from . import models

for m in (models.Ward, models.Team, models.Profile, models.Report, models.Batch, models.Task, models.Notification,
          models.ContentOverride, models.SiteSetting, models.AuditLog):
    admin.site.register(m)
