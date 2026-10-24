"""48-hour hotspot forecast built ONLY from real uploaded reports (no synthetic data).

Reports closer than `forecast_radius_m` are grouped into one hotspot. Each hotspot gets a 0..1 risk score from:
how much waste the latest photos show (OpenCV coverage), how many reports in 7 days, how long it has been waiting,
whether this spot was cleared recently and came back (repeat dumping), wet-waste + forecast rain, emergencies.
Every reason is returned as a code + numbers so the website can show it in the visitor's language.
"""
from datetime import timedelta

from django.db.models import Q
from django.utils import timezone

from ml import ward as geo

from . import config
from .models import Report
from .weather import rain_next_48h

HIGH, MEDIUM = 0.55, 0.35


def level(p):
    return "high" if p >= HIGH else "medium" if p >= MEDIUM else "low"


def _clusters(reports, radius):
    parent = list(range(len(reports)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i in range(len(reports)):
        for j in range(i + 1, len(reports)):
            if geo.distance_m(reports[i].lat, reports[i].lng, reports[j].lat, reports[j].lng) <= radius:
                parent[find(i)] = find(j)
    groups = {}
    for i, r in enumerate(reports):
        groups.setdefault(find(i), []).append(r)
    return list(groups.values())


def forecast_for_ward(ward):
    now = timezone.now()
    radius = config.get("forecast_radius_m")
    rain, rain_src = rain_next_48h(ward.center_lat, ward.center_lng)
    reports = list(Report.objects.filter(ward=ward).exclude(status="rejected").filter(
        Q(status__in=Report.ACTIVE) | Q(created_at__gte=now - timedelta(days=30))))
    out = []
    for g in _clusters(reports, radius):
        active = [r for r in g if r.status in Report.ACTIVE]
        if not active:
            continue
        cleared = [r for r in g if r.status == "cleared"]
        week = [r for r in g if r.created_at >= now - timedelta(days=7)]
        worst = max(active, key=lambda r: r.coverage_pct)
        oldest_h = max((now - r.created_at).total_seconds() / 3600 for r in active)
        wet = sum(1 for r in active if r.type in ("organic", "mixed")) / len(active)
        emergency = any(r.is_emergency for r in active)

        sev = min(worst.coverage_pct / 40.0, 1.0)
        score = (0.40 * sev + 0.20 * min(len(week), 5) / 5 + 0.15 * min(oldest_h, 72) / 72
                 + 0.10 * min(len(cleared), 3) / 3 + 0.10 * min(rain, 30) / 30 * (0.5 + 0.5 * wet)
                 + 0.05 * wet + (0.15 if emergency else 0))
        prob = round(min(score, 0.99), 2)

        reasons = [{"k": "level", "level": worst.level, "pct": round(worst.coverage_pct)}]
        if len(week) > 1:
            reasons.append({"k": "count", "n": len(week)})
        if oldest_h >= 6:
            reasons.append({"k": "age", "h": int(oldest_h)})
        if cleared:
            reasons.append({"k": "repeat", "n": len(cleared)})
        if rain >= 5 and wet > 0:
            reasons.append({"k": "rain", "mm": round(rain)})
        if emergency:
            reasons.append({"k": "emergency"})

        latest = max(active, key=lambda r: r.created_at)
        out.append({
            "lat": round(sum(r.lat for r in g) / len(g), 6), "lng": round(sum(r.lng for r in g) / len(g), 6),
            "prob": prob, "level": level(prob), "reasons": reasons[:4],
            "report_ids": [r.id for r in active], "codes": [r.code for r in active],
            "address": latest.address, "radius_m": radius,
        })
    out.sort(key=lambda h: -h["prob"])
    for i, h in enumerate(out, 1):
        h["id"] = i
    return out, {"rain_mm_48h": rain, "source": rain_src}
