from django.contrib import admin

from .models import Block, Profile, Report, RiskScore, Task

admin.site.register(Profile)
admin.site.register(Block)
admin.site.register(Report)
admin.site.register(RiskScore)
admin.site.register(Task)
