from django.urls import path

from . import views

urlpatterns = [
    path("auth/login", views.login),
    path("reports", views.create_report),
    path("risk-map", views.risk_map),
    path("tasks", views.tasks),
    path("tasks/<int:pk>", views.update_task),
]
