from django.contrib.auth import authenticate
from django.utils import timezone
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response

from ml import ward

from . import scoring
from .models import Block, RiskScore, Task
from .serializers import ReportSerializer, TaskSerializer
from .weather import rain_next_48h

PARSERS = [MultiPartParser, FormParser, JSONParser]


def role(user):
    return getattr(getattr(user, "profile", None), "role", None)


class IsOfficer(BasePermission):
    def has_permission(self, request, view):
        return role(request.user) == "officer"


@api_view(["POST"])
def login(request):
    user = authenticate(username=request.data.get("username"), password=request.data.get("password"))
    if not user:
        return Response({"detail": "Wrong username or password."}, status=400)
    token, _ = Token.objects.get_or_create(user=user)
    return Response({"token": token.key, "username": user.username, "role": role(user),
                     "team": getattr(getattr(user, "profile", None), "team", "")})


@api_view(["POST"])
@parser_classes(PARSERS)
def create_report(request):
    s = ReportSerializer(data=request.data, context={"request": request})
    s.is_valid(raise_exception=True)
    report = s.save(reporter=request.user if request.user.is_authenticated else None)
    return Response(ReportSerializer(report, context={"request": request}).data, status=201)


@api_view(["GET"])
def risk_map(request):
    """Latest stored scores, or a live what-if forecast when ?rain=1&market_day=1&missed_pickup=1 is given."""
    flags = {k: request.query_params.get(k) == "1" for k in ("rain", "market_day", "missed_pickup")}
    blocks = list(Block.objects.prefetch_related("reports"))
    try:
        if any(flags.values()):
            results = scoring.predict(blocks, flags)
        else:
            today = timezone.localdate()
            stored = {s.block_id: s for s in RiskScore.objects.filter(date=today)}
            if len(stored) < len(blocks):
                scoring.score_and_save(blocks)
                stored = {s.block_id: s for s in RiskScore.objects.filter(date=today)}
            results = [(b, stored[b.id].prob, stored[b.id].reasons) for b in blocks]
    except scoring.ModelMissing as e:
        return Response({"detail": str(e)}, status=503)

    open_tasks = {t.block_id: t for t in Task.objects.filter(status__in=Task.OPEN)}
    rain_mm, rain_source = rain_next_48h()
    return Response({
        "date": timezone.localdate(),
        "scenario": flags,
        "weather": {"rain_mm_48h": rain_mm, "source": rain_source},
        "teams": ward.TEAMS,
        "landmarks": [{**l, "center": ward.block_center(l["row"], l["col"])} for l in ward.LANDMARKS],
        "blocks": [{
            "code": b.code, "row": b.row, "col": b.col, "bounds": b.bounds,
            "prob": round(p, 3), "level": scoring.level(p), "reasons": reasons,
            "task": ({"id": open_tasks[b.id].id, "team": open_tasks[b.id].team, "status": open_tasks[b.id].status}
                     if b.id in open_tasks else None),
        } for b, p, reasons in results],
    })


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def tasks(request):
    r = role(request.user)
    if request.method == "GET":
        qs = Task.objects.select_related("block")
        if r == "worker":
            qs = qs.filter(team=request.user.profile.team)
        elif r != "officer":
            return Response(status=403)
        return Response(TaskSerializer(qs[:100], many=True, context={"request": request}).data)

    if r != "officer":
        return Response({"detail": "Only ward officers can assign tasks."}, status=403)
    s = TaskSerializer(data=request.data, context={"request": request})
    s.is_valid(raise_exception=True)
    block = s.validated_data["block"]
    if block.tasks.filter(status__in=Task.OPEN).exists():
        return Response({"detail": f"Block {block.code} already has an open task."}, status=400)
    latest = block.reports.first()
    task = s.save(created_by=request.user, before_photo=latest.photo.name if latest else "")
    return Response(TaskSerializer(task, context={"request": request}).data, status=201)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
@parser_classes(PARSERS)
def update_task(request, pk):
    task = Task.objects.select_related("block").filter(pk=pk).first()
    if not task:
        return Response(status=404)
    r = role(request.user)
    if not (r == "officer" or (r == "worker" and request.user.profile.team == task.team)):
        return Response({"detail": "Not your task."}, status=403)

    new_status = request.data.get("status", task.status)
    if new_status not in dict(Task.STATUSES):
        return Response({"detail": "Invalid status."}, status=400)
    if "after_photo" in request.FILES:
        task.after_photo = request.FILES["after_photo"]
    if new_status == "cleared" and not task.after_photo:
        return Response({"detail": "Upload an after photo to mark the block cleared."}, status=400)
    if new_status == "cleared" and task.status != "cleared":
        task.cleared_at = timezone.now()
        task.block.last_pickup_at = task.cleared_at
        task.block.save(update_fields=["last_pickup_at"])
    task.status = new_status
    task.save()
    if new_status == "cleared":
        try:
            scoring.score_and_save([task.block])
        except scoring.ModelMissing:
            pass
    return Response(TaskSerializer(task, context={"request": request}).data)
