import base64
import csv
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import authenticate
from django.core.files.base import ContentFile
from django.db.models import Avg, Count, Q
from django.http import HttpResponse
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, parser_classes, permission_classes, throttle_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from ml import ward as geo

from . import config, photo_ai
from .exif import photo_gps
from .forecast import forecast_for_ward
from .models import AuditLog, Batch, ContentOverride, Notification, Report, Task, Team, Ward
from .services import audit, dur, notify, officers_of, role, workers_of

PARSERS = [MultiPartParser, FormParser, JSONParser]
ERR = {
    "bad_image": "This file is not a readable photo.", "too_small": "The photo is too small. Take a closer, larger photo.",
    "blurry": "The photo is too blurry. Hold the phone steady and try again.",
    "too_dark": "The photo is too dark. Take it in better light.",
    "duplicate": "This photo was already reported for this area.",
    "not_scene": "This does not look like a photo of a street or place. Take a photo of the garbage itself.",
}


class Scoped(ScopedRateThrottle):
    pass


def throttled(scope):
    def deco(fn):
        fn.throttle_scope = scope
        return throttle_classes([Scoped])(fn)
    return deco


class IsOfficer(BasePermission):
    def has_permission(self, request, view):
        return role(request.user) in ("officer", "admin")


class IsWorker(BasePermission):
    def has_permission(self, request, view):
        return role(request.user) == "worker"


class IsAdminRole(BasePermission):
    def has_permission(self, request, view):
        return role(request.user) == "admin"


def iso(d):
    return d.isoformat() if d else None


def url(f):
    return f.url if f else ""


def err(code, status=400):
    return Response({"detail": ERR.get(code, code), "code": code}, status=status)


# ---------------------------------------------------------------- serializers (plain dicts)
def is_late(t):
    d = t.batch.deadline
    if not d:
        return False
    return (t.after_at or timezone.now()) > d


def task_dict(t):
    return {
        "deadline": iso(t.batch.deadline), "late": is_late(t),
        "id": t.id, "report_id": t.report_id, "code": t.report.code, "batch": t.batch.name, "batch_id": t.batch_id,
        "team": t.team.name, "stop_no": t.stop_no, "status": t.status, "notified_at": iso(t.created_at),
        "before_at": iso(t.before_at), "after_at": iso(t.after_at), "before_photo": url(t.before_photo),
        "after_photo": url(t.after_photo), "before_coverage": t.before_coverage, "after_coverage": t.after_coverage,
        "distance_m": t.distance_m, "verification": t.verification, "response_min": t.response_min,
        "work_min": t.work_min, "total_min": t.total_min,
        "response_sec": t.response_sec, "work_sec": t.work_sec, "total_sec": t.total_sec,
    }


def report_dict(r, with_task=True):
    age = round((timezone.now() - r.created_at).total_seconds() / 60)
    sla = config.get("sla_hours").get(r.level, 24) * 60
    d = {
        "id": r.id, "code": r.code, "ward": r.ward.name, "lat": r.lat, "lng": r.lng, "address": r.address,
        "accuracy_m": r.accuracy_m, "location_source": r.location_source,
        "type": r.type, "note": r.note, "phone": r.contact_phone, "is_emergency": r.is_emergency, "level": r.level,
        "coverage_pct": r.coverage_pct, "eta_min": r.eta_min, "eta_max": r.eta_max, "status": r.status,
        "created_at": iso(r.created_at), "cleared_at": iso(r.cleared_at), "photo": url(r.photo), "overlay": url(r.overlay),
        "age_min": age, "overdue": r.status in Report.ACTIVE and age > sla, "ai_label": r.ai_label,
    }
    if with_task:
        t = next(iter(sorted(r.tasks.all(), key=lambda x: -x.id)), None)
        d["task"] = task_dict(t) if t else None
    return d


# ---------------------------------------------------------------- auth + public
@api_view(["POST"])
@throttled("login")
def login(request):
    user = authenticate(username=(request.data.get("username") or "").strip(), password=request.data.get("password"))
    if not user:
        return Response({"detail": "Wrong username or password."}, status=400)
    r = role(user)
    want = request.data.get("role")
    if want and r != want:
        return Response({"detail": f"This account is not a {want} account. Choose the right tab.", "code": "wrong_role"}, status=400)
    token, _ = Token.objects.get_or_create(user=user)
    p = user.profile
    audit(user, "login")
    return Response({"token": token.key, "username": user.username, "name": user.get_full_name() or user.username, "role": r,
                     "team": p.team.name if p.team else "", "ward": p.ward.name if p.ward else "",
                     "ward_id": p.ward_id})


@api_view(["GET"])
def content(request):
    out = {}
    for c in ContentOverride.objects.all():
        out.setdefault(c.lang, {})[c.key] = c.value
    return Response(out)


@api_view(["GET"])
def public_config(request):
    s = config.all_settings()
    return Response({
        "emergency_contacts": s["emergency_contacts"], "helpline_note": s["helpline_note"],
        "wards": [{"id": w.id, "name": w.name, "city": w.city, "center": [w.center_lat, w.center_lng], "radius_km": w.radius_km,
                   "office_name": w.office_name, "office_address": w.office_address, "office_phone": w.office_phone,
                   "office_email": w.office_email, "office_hours": w.office_hours,
                   "office": [w.office_lat, w.office_lng] if w.office_lat is not None else [w.center_lat, w.center_lng]}
                  for w in Ward.objects.filter(is_active=True)],
    })


def avg_min(qs, field):
    """Average of a *_min property, returned in minutes with one decimal (so short demo times do not show as 0)."""
    vals = [getattr(t, field.replace("_min", "_sec")) for t in qs]
    vals = [v for v in vals if v is not None]
    return round(sum(vals) / len(vals) / 60, 1) if vals else None


@api_view(["GET"])
def public_stats(request):
    done = list(Task.objects.filter(status="cleared").select_related("report")[:300])
    return Response({
        "reports": Report.objects.exclude(status="rejected").count(),
        "cleared": Report.objects.filter(status="cleared").count(),
        "active": Report.objects.filter(status__in=Report.ACTIVE).count(),
        "avg_response_min": avg_min(done, "response_min"), "avg_work_min": avg_min(done, "work_min"),
        "wards": Ward.objects.filter(is_active=True).count(),
    })


@api_view(["POST"])
@parser_classes(PARSERS)
@throttled("analyze")
def analyze(request):
    f = request.FILES.get("photo")
    if not f:
        return Response({"detail": "Send a photo."}, status=400)
    try:
        a = photo_ai.analyze(f.read(), request.data.get("type", "mixed"))
    except photo_ai.PhotoError as e:
        return err(e.code)
    return Response({"coverage_pct": a["coverage_pct"], "level": a["level"], "waste_found": a["waste_found"], "model": a["model"],
                     "eta_min": a["eta_min"], "eta_max": a["eta_max"], "label": a["label"],
                     "overlay": "data:image/jpeg;base64," + base64.b64encode(a["overlay"]).decode()})


def find_ward(lat, lng):
    wards = list(Ward.objects.filter(is_active=True))
    if not wards:
        return None
    w = min(wards, key=lambda x: geo.distance_m(lat, lng, x.center_lat, x.center_lng))
    d = geo.distance_m(lat, lng, w.center_lat, w.center_lng)
    return w if d <= max(w.radius_km, settings.WARD_SNAP_KM) * 1000 else None


@api_view(["POST"])
@parser_classes(PARSERS)
@throttled("report")
def create_report(request):
    f = request.FILES.get("photo")
    if not f:
        return Response({"detail": "Add a photo."}, status=400)
    data = f.read()
    f.seek(0)
    try:
        lat, lng = float(request.data["lat"]), float(request.data["lng"])
    except (KeyError, ValueError, TypeError):
        gps = photo_gps(f)
        if not gps:
            return Response({"detail": "We could not find a location. Use live location, search the address, or tap the map."}, status=400)
        lat, lng = gps
        f.seek(0)
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        return Response({"detail": "Invalid location."}, status=400)
    ward = find_ward(lat, lng)
    if not ward:
        return Response({"detail": "This location is outside the areas WasteWatch serves yet.", "code": "outside"}, status=400)
    wtype = request.data.get("type") if request.data.get("type") in dict(Report.TYPES) else "mixed"
    try:
        a = photo_ai.analyze(data, wtype)
    except photo_ai.PhotoError as e:
        return err(e.code)
    week = timezone.now() - timedelta(days=7)
    for other in Report.objects.filter(ward=ward, created_at__gte=week, status__in=Report.ACTIVE):
        if photo_ai.hamming(other.photo_hash, a["hash"]) <= 4:
            return err("duplicate")
    emergency = str(request.data.get("is_emergency", "")).lower() in ("1", "true", "yes", "on")
    try:
        acc = max(0, min(int(float(request.data.get("accuracy_m"))), 100000))
    except (TypeError, ValueError):
        acc = None
    src = request.data.get("location_source") if request.data.get("location_source") in ("gps", "exif", "map", "search") else ""
    r = Report(ward=ward, reporter=request.user if request.user.is_authenticated else None, lat=lat, lng=lng,
               accuracy_m=acc, location_source=src,
               address=(request.data.get("address") or "")[:250], type=wtype, note=(request.data.get("note") or "")[:300],
               contact_phone=(request.data.get("phone") or "")[:20], is_emergency=emergency, coverage_pct=a["coverage_pct"],
               level=a["level"], eta_min=a["eta_min"], eta_max=a["eta_max"],
               photo_hash=a["hash"], ai_label=a["label"],
               analysis={**{k: a[k] for k in ("blur_score", "brightness", "blobs", "waste_found")}, "model": a["model"]})
    r.photo.save(f.name or "photo.jpg", f, save=False)
    r.overlay.save("overlay.jpg", ContentFile(a["overlay"]), save=False)
    r.save()
    where = r.address or f"{lat:.4f}, {lng:.4f}"
    notify(officers_of(ward), "emergency" if emergency else "report",
           f"{'EMERGENCY - ' if emergency else ''}New {a['level']} waste report {r.code}",
           f"{where} - {a['coverage_pct']}% covered, about {a['eta_min']}-{a['eta_max']} min to clear", report=r)
    return Response({**report_dict(r, with_task=False), "ward_phone": ward.office_phone}, status=201)


@api_view(["GET"])
@throttled("track")
def track(request, code):
    r = Report.objects.filter(code__iexact=code.strip()).select_related("ward").first()
    if not r:
        return Response({"detail": "No report with this ID."}, status=404)
    t = r.tasks.order_by("-id").first()
    ev = [{"k": "received", "at": iso(r.created_at)}]
    if t:
        ev.append({"k": "assigned", "at": iso(t.created_at)})
        if t.before_at:
            ev.append({"k": "started", "at": iso(t.before_at)})
        if t.after_at:
            ev.append({"k": "cleared", "at": iso(t.after_at)})
    if r.status == "rejected":
        ev.append({"k": "rejected", "at": None})
    return Response({
        "code": r.code, "status": r.status, "level": r.level, "address": r.address, "created_at": iso(r.created_at),
        "lat": r.lat, "lng": r.lng, "accuracy_m": r.accuracy_m, "deadline": iso(t.batch.deadline) if t else None,
        "team": t.team.name if t else "",
        "eta_min": r.eta_min, "eta_max": r.eta_max, "ward": r.ward.name, "ward_phone": r.ward.office_phone,
        "photo": url(r.photo), "after_photo": url(t.after_photo) if t and t.status == "cleared" else "",
        "work_min": t.work_min if t else None, "work_sec": t.work_sec if t else None, "events": ev,
    })


# ---------------------------------------------------------------- officer
def ward_of(request):
    if role(request.user) == "admin":
        wid = request.query_params.get("ward")
        return Ward.objects.filter(pk=wid).first() if wid else Ward.objects.filter(is_active=True).first()
    return request.user.profile.ward


@api_view(["GET"])
@permission_classes([IsOfficer])
def overview(request):
    w = ward_of(request)
    if not w:
        return Response({"detail": "No ward is assigned to your account. Ask the administrator."}, status=403)
    now = timezone.now()
    qs = Report.objects.filter(ward=w).select_related("ward").prefetch_related("tasks__team", "tasks__batch", "tasks__report")
    active = list(qs.filter(status__in=Report.ACTIVE))  # a cleared report leaves the list and the map; it stays in "completed" below
    hotspots, weather = forecast_for_ward(w)
    done = list(Task.objects.filter(report__ward=w, status="cleared").select_related("report", "team", "batch").order_by("-after_at")[:100])
    teams = [{"id": t.id, "name": t.name, "open": t.tasks.filter(status__in=Task.OPEN).count(),
              "members": [m.user.get_full_name() or m.user.username for m in t.members.select_related("user")]} for t in w.teams.all()]
    today = timezone.localdate()
    return Response({
        "ward": {"id": w.id, "name": w.name, "city": w.city, "center": [w.center_lat, w.center_lng], "radius_km": w.radius_km},
        "weather": weather, "teams": teams,
        "reports": [report_dict(r) for r in active], "forecast": hotspots,
        "completed": [task_dict(t) for t in done[:15]],
        "stats": {
            "open": len(active), "high": sum(r.level == "high" for r in active), "medium": sum(r.level == "medium" for r in active),
            "low": sum(r.level == "low" for r in active), "emergency": sum(r.is_emergency for r in active),
            "overdue": sum(report_dict(r, False)["overdue"] for r in active),
            "late_tasks": sum(1 for t in Task.objects.filter(report__ward=w, status__in=Task.OPEN, batch__deadline__lt=now)),
            "cleared_today": sum(1 for t in done if t.after_at and timezone.localtime(t.after_at).date() == today),
            "avg_response_min": avg_min(done, "response_min"), "avg_work_min": avg_min(done, "work_min"),
        },
    })


@api_view(["POST"])
@permission_classes([IsOfficer])
def assign_batch(request):
    w = ward_of(request)
    team = Team.objects.filter(pk=request.data.get("team"), ward=w).first()
    ids = request.data.get("reports") or []
    reports = list(Report.objects.filter(pk__in=ids, ward=w, status="new"))
    if not team:
        return Response({"detail": "Choose a team of your ward."}, status=400)
    if not reports:
        return Response({"detail": "Select at least one new report that is not assigned yet."}, status=400)
    deadline = parse_deadline(request.data.get("deadline"), reports)
    if deadline is None:
        return Response({"detail": "Choose a deadline in the future."}, status=400)
    start = (w.office_lat, w.office_lng) if w.office_lat is not None else (w.center_lat, w.center_lng)
    order = geo.route_order([(r.id, r.lat, r.lng) for r in reports], start)
    batch = Batch.objects.create(ward=w, team=team, created_by=request.user, note=(request.data.get("note") or "")[:250],
                                 deadline=deadline)
    by_id = {r.id: r for r in reports}
    for n, rid in enumerate(order, 1):
        Task.objects.create(report=by_id[rid], batch=batch, team=team, stop_no=n)
        by_id[rid].status = "assigned"
        by_id[rid].save(update_fields=["status"])
    officer = request.user.get_full_name() or request.user.username
    notify(workers_of(team), "assigned", f"{team.name} was assigned {len(reports)} stop{'s' if len(reports) > 1 else ''} ({batch.name})",
           f"Assigned by {officer}. Deadline: {timezone.localtime(deadline):%d %b, %I:%M %p}. Open My tasks for the route.")
    audit(request.user, "assign_batch", f"{batch.name} -> {team.name}")
    return Response({"batch": batch.name, "stops": len(reports), "deadline": iso(deadline)}, status=201)


def default_deadline(reports):
    """Strictest SLA among the reports (emergency = 2 h)."""
    sla = config.get("sla_hours")
    hours = min(2 if r.is_emergency else sla.get(r.level, 24) for r in reports)
    return timezone.now() + timedelta(hours=hours)


def parse_deadline(value, reports):
    if not value:
        return default_deadline(reports)
    from django.utils.dateparse import parse_datetime
    d = parse_datetime(str(value))
    if d is None:
        return None
    if timezone.is_naive(d):
        d = timezone.make_aware(d)
    return d if d > timezone.now() + timedelta(minutes=5) else None


@api_view(["PATCH"])
@permission_classes([IsOfficer])
def report_update(request, pk):
    r = Report.objects.filter(pk=pk, ward=ward_of(request)).first()
    if not r:
        return Response(status=404)
    if request.data.get("level") in dict(Report.LEVELS):
        r.level = request.data["level"]
    if "is_emergency" in request.data:
        r.is_emergency = bool(request.data["is_emergency"])
    if request.data.get("status") == "rejected" and r.status == "new":
        r.status = "rejected"
    r.save()
    audit(request.user, "report_update", r.code)
    return Response(report_dict(r))


# ---------------------------------------------------------------- notifications
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def notifications(request):
    if request.method == "POST":
        qs = request.user.notifications.filter(read=False)
        if request.data.get("ids"):
            qs = qs.filter(pk__in=request.data["ids"])
        qs.update(read=True)
    items = request.user.notifications.select_related("report")[:40]
    return Response({"unread": request.user.notifications.filter(read=False).count(),
                     "items": [{"id": n.id, "kind": n.kind, "title": n.title, "body": n.body, "read": n.read,
                                "at": iso(n.created_at), "report": n.report.code if n.report else ""} for n in items]})


# ---------------------------------------------------------------- worker
@api_view(["GET"])
@permission_classes([IsWorker])
def worker_batches(request):
    team = request.user.profile.team
    if not team:
        return Response({"detail": "No team is assigned to your account. Ask your ward officer."}, status=403)
    tasks = Task.objects.filter(team=team).select_related("report", "batch", "batch__created_by", "team").filter(
        Q(status__in=Task.OPEN) | Q(after_at__gte=timezone.now() - timedelta(days=2)))
    groups = {}
    for t in tasks.order_by("batch_id", "stop_no"):
        g = groups.setdefault(t.batch_id, {"id": t.batch_id, "name": t.batch.name, "note": t.batch.note, "deadline": iso(t.batch.deadline),
                                           "created_at": iso(t.batch.created_at), "tasks": [],
                                           "assigned_by": (t.batch.created_by.get_full_name() or t.batch.created_by.username) if t.batch.created_by else ""})
        g["tasks"].append({**task_dict(t), "report": report_dict(t.report, with_task=False)})
    out = sorted(groups.values(), key=lambda g: (all(x["status"] == "cleared" for x in g["tasks"]), g["created_at"]))
    w = team.ward
    return Response({
        "team": team.name, "ward": w.name, "geofence_m": config.get("geofence_m"), "batches": out,
        "members": [m.user.get_full_name() or m.user.username for m in team.members.select_related("user")],
        "office": {"name": w.office_name or w.name, "address": w.office_address, "phone": w.office_phone,
                   "lat": w.office_lat if w.office_lat is not None else w.center_lat,
                   "lng": w.office_lng if w.office_lng is not None else w.center_lng},
    })


def _own_task(request, pk):
    t = Task.objects.select_related("report", "batch", "team").filter(pk=pk, team=request.user.profile.team).first()
    return t


def _gps(request):
    try:
        return float(request.data["lat"]), float(request.data["lng"])
    except (KeyError, ValueError, TypeError):
        return None, None


@api_view(["POST"])
@permission_classes([IsWorker])
@parser_classes(PARSERS)
def task_start(request, pk):
    t = _own_task(request, pk)
    f = request.FILES.get("before_photo")
    if not t:
        return Response({"detail": "Not your task."}, status=403)
    if t.status != "assigned":
        return Response({"detail": "This stop was already started."}, status=400)
    if not f:
        return Response({"detail": "Upload the BEFORE photo first."}, status=400)
    try:
        cov, _lvl = photo_ai.coverage_only(f.read())
    except photo_ai.PhotoError as e:
        return err(e.code)
    f.seek(0)
    lat, lng = _gps(request)
    t.before_photo.save(f.name or "before.jpg", f, save=False)
    t.before_at, t.before_coverage, t.status = timezone.now(), cov, "in_progress"
    if lat is not None:
        t.before_lat, t.before_lng = lat, lng
        t.distance_m = round(geo.distance_m(lat, lng, t.report.lat, t.report.lng))
    t.save()
    t.report.status = "in_progress"
    t.report.save(update_fields=["status"])
    notify([t.batch.created_by] if t.batch.created_by else [], "started",
           f"{t.team.name} reached {t.report.code}", f"Before photo uploaded {dur(t.response_sec)} after the assignment. {t.report.address}", t.report, t)
    return Response(task_dict(t))


@api_view(["POST"])
@permission_classes([IsWorker])
@parser_classes(PARSERS)
def task_finish(request, pk):
    t = _own_task(request, pk)
    f = request.FILES.get("after_photo")
    if not t:
        return Response({"detail": "Not your task."}, status=403)
    if t.status != "in_progress":
        return Response({"detail": "Upload the BEFORE photo first." if t.status == "assigned" else "Already cleared."}, status=400)
    if not f:
        return Response({"detail": "Upload the AFTER photo."}, status=400)
    try:
        cov, after_level = photo_ai.coverage_only(f.read())
    except photo_ai.PhotoError as e:
        return err(e.code)
    f.seek(0)
    t.after_photo.save(f.name or "after.jpg", f, save=False)
    t.after_at, t.after_coverage, t.status = timezone.now(), cov, "cleared"
    limit = max((t.before_coverage or 0) * config.get("after_max_ratio"), 6)
    # With the trash model: the after photo must look clean (or nearly). Without it: less clutter than before.
    t.verification = "verified" if (after_level in ("clean", "low") if after_level else cov <= limit) else "review"
    t.save()
    r = t.report
    r.status, r.cleared_at = "cleared", t.after_at
    r.save(update_fields=["status", "cleared_at"])
    flag = " Needs review: waste still visible in the after photo." if t.verification == "review" else ""
    if is_late(t):
        flag += " Finished after the deadline."
    notify(set(officers_of(r.ward)) | ({t.batch.created_by} if t.batch.created_by else set()), "collected",
           f"Waste collected: {r.code}",
           f"{t.team.name} reached in {dur(t.response_sec)}, cleared in {dur(t.work_sec)}. {r.address}{flag}", r, t)
    if not t.batch.tasks.exclude(status="cleared").exists():
        notify(officers_of(r.ward), "collected", f"{t.batch.name} completed", f"All {t.batch.tasks.count()} stops cleared by {t.team.name}.")
    return Response(task_dict(t))


# ---------------------------------------------------------------- admin summary / content / settings / audit / export
@api_view(["GET"])
@permission_classes([IsAdminRole])
def admin_summary(request):
    now = timezone.now()
    done = list(Task.objects.filter(status="cleared").select_related("team", "team__ward", "report"))
    teams = []
    for tm in Team.objects.select_related("ward"):
        mine = [t for t in done if t.team_id == tm.id]
        teams.append({"team": f"{tm.ward.code} / {tm.name}", "cleared": len(mine), "open": tm.tasks.filter(status__in=Task.OPEN).count(),
                      "avg_response_min": avg_min(mine, "response_min"), "avg_work_min": avg_min(mine, "work_min"),
                      "review": sum(t.verification == "review" for t in mine)})
    days = []
    for i in range(13, -1, -1):
        d = timezone.localdate() - timedelta(days=i)
        days.append({"date": d.isoformat(), "reports": Report.objects.filter(created_at__date=d).count(),
                     "cleared": Report.objects.filter(cleared_at__date=d).count()})
    by_level = {x["level"]: x["n"] for x in Report.objects.filter(status__in=Report.ACTIVE).values("level").annotate(n=Count("id"))}
    from django.contrib.auth import get_user_model
    return Response({
        "totals": {"reports": Report.objects.count(), "open": Report.objects.filter(status__in=Report.ACTIVE).count(),
                   "cleared": Report.objects.filter(status="cleared").count(), "emergency": Report.objects.filter(is_emergency=True, status__in=Report.ACTIVE).count(),
                   "officers": get_user_model().objects.filter(profile__role="officer").count(),
                   "workers": get_user_model().objects.filter(profile__role="worker").count(),
                   "wards": Ward.objects.count(), "avg_response_min": avg_min(done, "response_min"), "avg_work_min": avg_min(done, "work_min"),
                   "review": sum(t.verification == "review" for t in done)},
        "by_level": {k: by_level.get(k, 0) for k in ("high", "medium", "low")}, "teams": teams, "days": days,
        "wards": [{"id": w.id, "name": w.name, "open": w.reports.filter(status__in=Report.ACTIVE).count(),
                   "total": w.reports.count(), "center": [w.center_lat, w.center_lng]} for w in Ward.objects.all()],
    })


@api_view(["GET", "PUT", "DELETE"])
@permission_classes([IsAdminRole])
def admin_content(request):
    if request.method == "GET":
        return content(request)
    lang, key = request.data.get("lang") or request.query_params.get("lang"), request.data.get("key") or request.query_params.get("key")
    if lang not in ("en", "hi", "gu") or not key:
        return Response({"detail": "lang and key required"}, status=400)
    if request.method == "DELETE":
        ContentOverride.objects.filter(lang=lang, key=key).delete()
    else:
        ContentOverride.objects.update_or_create(lang=lang, key=key, defaults={"value": request.data.get("value")})
    audit(request.user, "content_" + request.method.lower(), f"{lang}:{key}")
    return Response({"ok": True})


@api_view(["GET", "PUT"])
@permission_classes([IsAdminRole])
def admin_settings(request):
    if request.method == "PUT":
        for k, v in request.data.items():
            try:
                config.put(k, v)
            except KeyError:
                return Response({"detail": f"Unknown setting {k}"}, status=400)
        audit(request.user, "settings_update", ",".join(request.data.keys()))
    return Response(config.all_settings())


@api_view(["GET"])
@permission_classes([IsAdminRole])
def admin_audit(request):
    return Response([{"id": a.id, "user": a.user.username if a.user else "-", "action": a.action, "target": a.target, "at": iso(a.created_at)}
                     for a in AuditLog.objects.select_related("user")[:150]])


@api_view(["GET"])
@permission_classes([IsAdminRole])
def admin_export(request):
    resp = HttpResponse(content_type="text/csv")
    resp["Content-Disposition"] = 'attachment; filename="wastewatch_reports.csv"'
    w = csv.writer(resp)
    w.writerow(["code", "ward", "created", "status", "level", "coverage_pct", "type", "emergency", "lat", "lng", "address",
                "team", "response_min", "work_min", "verification"])
    for r in Report.objects.select_related("ward").prefetch_related("tasks__team"):
        t = r.tasks.order_by("-id").first()
        w.writerow([r.code, r.ward.name, r.created_at.strftime("%Y-%m-%d %H:%M"), r.status, r.level, r.coverage_pct, r.type,
                    int(r.is_emergency), r.lat, r.lng, r.address, t.team.name if t else "", t.response_min if t else "",
                    t.work_min if t else "", t.verification if t else ""])
    return resp
