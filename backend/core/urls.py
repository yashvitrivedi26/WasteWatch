from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import admin_api, views

router = DefaultRouter(trailing_slash=False)
router.register("admin/wards", admin_api.WardViewSet, basename="ward")
router.register("admin/teams", admin_api.TeamViewSet, basename="team")
router.register("admin/users", admin_api.UserViewSet, basename="user")
router.register("admin/reports", admin_api.ReportViewSet, basename="report")
router.register("admin/tasks", admin_api.TaskViewSet, basename="task")

urlpatterns = [
    path("auth/login", views.login),
    path("content", views.content),
    path("public-config", views.public_config),
    path("public-stats", views.public_stats),
    path("analyze", views.analyze),
    path("reports", views.create_report),
    path("track/<str:code>", views.track),
    path("officer/overview", views.overview),
    path("officer/batches", views.assign_batch),
    path("officer/reports/<int:pk>", views.report_update),
    path("notifications", views.notifications),
    path("worker/batches", views.worker_batches),
    path("worker/tasks/<int:pk>/start", views.task_start),
    path("worker/tasks/<int:pk>/finish", views.task_finish),
    path("admin/summary", views.admin_summary),
    path("admin/content", views.admin_content),
    path("admin/settings", views.admin_settings),
    path("admin/audit", views.admin_audit),
    path("admin/export", views.admin_export),
    path("", include(router.urls)),
]
