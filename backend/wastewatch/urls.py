from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path


def home(request):
    return JsonResponse({"app": "WasteWatch API is running", "open_the_app": "http://localhost:5173",
                         "try": "/api/risk-map"})


urlpatterns = [
    path("", home),
    path("admin/", admin.site.urls),
    path("api/", include("core.urls")),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
