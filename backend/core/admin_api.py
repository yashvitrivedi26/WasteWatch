"""CRUD endpoints for the administrator dashboard."""
from django.contrib.auth import get_user_model
from rest_framework import serializers, viewsets
from rest_framework.response import Response

from .models import Profile, Report, Task, Team, Ward
from .services import audit
from .views import IsAdminRole, report_dict, task_dict

User = get_user_model()


class Audited:
    permission_classes = [IsAdminRole]

    def perform_create(self, s):
        o = s.save()
        audit(self.request.user, f"create_{self.basename}", str(o))

    def perform_update(self, s):
        o = s.save()
        audit(self.request.user, f"update_{self.basename}", str(o))

    def perform_destroy(self, o):
        audit(self.request.user, f"delete_{self.basename}", str(o))
        o.delete()


class WardSer(serializers.ModelSerializer):
    class Meta:
        model = Ward
        fields = "__all__"


class WardViewSet(Audited, viewsets.ModelViewSet):
    queryset, serializer_class = Ward.objects.all(), WardSer


class TeamSer(serializers.ModelSerializer):
    ward_name = serializers.CharField(source="ward.name", read_only=True)

    class Meta:
        model = Team
        fields = ["id", "ward", "ward_name", "name"]


class TeamViewSet(Audited, viewsets.ModelViewSet):
    queryset, serializer_class = Team.objects.select_related("ward"), TeamSer


class UserSer(serializers.ModelSerializer):
    role = serializers.ChoiceField(choices=Profile.ROLES, source="profile.role")
    ward = serializers.PrimaryKeyRelatedField(queryset=Ward.objects.all(), source="profile.ward", allow_null=True, required=False)
    team = serializers.PrimaryKeyRelatedField(queryset=Team.objects.all(), source="profile.team", allow_null=True, required=False)
    phone = serializers.CharField(source="profile.phone", allow_blank=True, required=False)
    password = serializers.CharField(write_only=True, required=False, allow_blank=True, min_length=6)

    class Meta:
        model = User
        fields = ["id", "username", "first_name", "last_name", "is_active", "role", "ward", "team", "phone", "password"]

    def _apply(self, user, prof, pw):
        if pw:
            user.set_password(pw)
        user.is_staff = user.is_superuser = prof.get("role") == "admin" if "role" in prof else user.is_staff
        user.save()
        p, _ = Profile.objects.get_or_create(user=user)
        for k, v in prof.items():
            setattr(p, k, v)
        if p.team and p.ward is None:
            p.ward = p.team.ward
        p.save()
        return user

    def create(self, data):
        prof, pw = data.pop("profile", {}), data.pop("password", "")
        if not pw:
            raise serializers.ValidationError({"password": "Set a password for the new user."})
        return self._apply(User(**data), prof, pw)

    def update(self, user, data):
        prof, pw = data.pop("profile", {}), data.pop("password", "")
        for k, v in data.items():
            setattr(user, k, v)
        return self._apply(user, prof, pw)


class UserViewSet(Audited, viewsets.ModelViewSet):
    queryset = User.objects.exclude(profile__role="citizen").select_related("profile").order_by("profile__role", "username")
    serializer_class = UserSer

    def perform_destroy(self, o):
        if o == self.request.user:
            raise serializers.ValidationError("You cannot delete your own account.")
        super().perform_destroy(o)


class ReportViewSet(Audited, viewsets.ViewSet):
    def list(self, request):
        qs = Report.objects.select_related("ward").prefetch_related("tasks__team", "tasks__batch", "tasks__report")
        for f in ("status", "level", "ward"):
            if request.query_params.get(f):
                qs = qs.filter(**{f: request.query_params[f]})
        return Response([report_dict(r) for r in qs[:300]])

    def partial_update(self, request, pk=None):
        r = Report.objects.get(pk=pk)
        for f in ("level", "status", "type", "address", "note"):
            if f in request.data:
                setattr(r, f, request.data[f])
        if request.data.get("ward"):
            r.ward = Ward.objects.get(pk=request.data["ward"])
        r.save()
        audit(request.user, "update_report", r.code)
        return Response(report_dict(r))

    def destroy(self, request, pk=None):
        r = Report.objects.get(pk=pk)
        audit(request.user, "delete_report", r.code)
        r.delete()
        return Response(status=204)


class TaskViewSet(Audited, viewsets.ViewSet):
    def list(self, request):
        return Response([task_dict(t) for t in Task.objects.select_related("report", "team", "batch").order_by("-id")[:300]])

    def destroy(self, request, pk=None):
        t = Task.objects.get(pk=pk)
        if t.status != "cleared":
            t.report.status = "new"
            t.report.save(update_fields=["status"])
        audit(request.user, "delete_task", t.report.code)
        t.delete()
        return Response(status=204)
