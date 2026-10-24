"""Demo reports for presentations: python manage.py seed_demo  (use --reset to delete all reports first).

Creates about 14 citizen reports around the Central Zone office from the sample photos in docs/sample_photos,
analysed by the same photo AI as real reports: some new, one emergency request near a hospital, one batch on its way
with a deadline, and a few already cleared with before/after photos.
"""
import random
from datetime import timedelta
from pathlib import Path

from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand
from django.utils import timezone

from core import photo_ai
from core.models import Batch, Notification, Report, Task, Team, Ward
from django.contrib.auth import get_user_model

PHOTOS = Path(__file__).resolve().parents[4] / "docs" / "sample_photos"
SPOTS = [  # (address, dLat, dLng, photo, type, hours ago)
    ("Vegetable market lane, Ghogha Gate", 0.0021, -0.0012, "test_big_pile.jpg", "organic", 3),
    ("Behind Gangajalia Talav, Darbargadh", -0.0014, 0.0019, "test_medium_pile.jpg", "mixed", 5),
    ("Near ST bus stand gate", 0.0032, 0.0027, "test_medium_pile.jpg", "plastic", 2),
    ("Kalanala chowk, footpath", -0.0026, -0.0021, "test_small_pile.jpg", "household", 9),
    ("Opp. Sir Takhtsinhji Hospital gate", 0.0008, 0.0036, "test_big_pile.jpg", "mixed", 1),
    ("Waghawadi Road, open plot", -0.0039, 0.0008, "test_big_pile.jpg", "construction", 20),
    ("Nilambaug circle, bin overflow", 0.0044, -0.0031, "test_medium_pile.jpg", "household", 7),
    ("Crescent circle, roadside", -0.0007, -0.0042, "test_small_pile.jpg", "plastic", 4),
    ("Haluria chowk, behind shops", 0.0017, 0.0049, "test_medium_pile.jpg", "organic", 26),
    ("Parimal chowk drain side", -0.0047, -0.0036, "test_small_pile.jpg", "mixed", 30),
    ("Station road, near tea stalls", 0.0052, 0.0013, "test_medium_pile.jpg", "plastic", 12),
    ("Rupani circle, corner plot", -0.0031, 0.0042, "test_big_pile.jpg", "mixed", 15),
]


class Command(BaseCommand):
    help = "Add demo reports, tasks and a deadline batch to the Central Zone."

    def add_arguments(self, parser):
        parser.add_argument("--reset", action="store_true", help="Delete all reports, tasks and batches first")

    def handle(self, *args, **opts):
        ward = Ward.objects.filter(code="CZ").first() or Ward.objects.first()
        if not ward:
            self.stderr.write("Run python manage.py seed_ward first.")
            return
        if opts["reset"]:
            Notification.objects.all().delete()
            Task.objects.all().delete()
            Batch.objects.all().delete()
            Report.objects.all().delete()
        elif Report.objects.filter(ward=ward).exists():
            self.stdout.write("Demo reports already exist (use --reset to recreate).")
            return
        rng = random.Random(7)
        now = timezone.now()
        reports = []
        for i, (addr, dlat, dlng, ph, wtype, hours) in enumerate(SPOTS):
            data = (PHOTOS / ph).read_bytes()
            a = photo_ai.analyze(data, wtype)
            r = Report(ward=ward, lat=ward.center_lat + dlat, lng=ward.center_lng + dlng, address=addr, type=wtype,
                       accuracy_m=rng.choice([6, 8, 12, 15, 25]), location_source="gps",
                       coverage_pct=a["coverage_pct"], level=a["level"], eta_min=a["eta_min"], eta_max=a["eta_max"],
                       photo_hash=f"{i:016x}", ai_label=a["label"], created_at=now - timedelta(hours=hours, minutes=rng.randint(0, 50)))
            if "Hospital" in addr:
                r.emergency_status, r.emergency_category = "pending", "hospital"
                r.emergency_reason = "Garbage is piled right at the hospital gate where patients and ambulances pass."
                r.emergency_place = "Sir Takhtsinhji Hospital (40 m)"
            r.photo.save(ph, ContentFile(data), save=False)
            r.overlay.save("overlay.jpg", ContentFile(a["overlay"]), save=False)
            r.save()
            reports.append(r)

        officer = get_user_model().objects.filter(profile__role="officer", profile__ward=ward).first()
        teams = list(Team.objects.filter(ward=ward).order_by("name"))
        clean = (PHOTOS / "test_clean.jpg").read_bytes()
        # 2 cleared yesterday (Team B), 1 batch on the way with a deadline (Team A)
        done = Batch.objects.create(ward=ward, team=teams[1], created_by=officer, deadline=now - timedelta(hours=8),
                                    created_at=now - timedelta(hours=22))
        for n, r in enumerate(reports[8:10], 1):
            t = Task.objects.create(report=r, batch=done, team=teams[1], stop_no=n, status="cleared", created_at=now - timedelta(hours=22),
                                    before_at=now - timedelta(hours=21, minutes=30 - n * 10), after_at=now - timedelta(hours=21 - n * 0.5),
                                    before_coverage=r.coverage_pct, after_coverage=1.5, verification="verified", distance_m=12 + n)
            t.before_photo.save("before.jpg", ContentFile((PHOTOS / "test_medium_pile.jpg").read_bytes()), save=False)
            t.after_photo.save("after.jpg", ContentFile(clean), save=False)
            t.save()
            r.status, r.cleared_at = "cleared", t.after_at
            r.save(update_fields=["status", "cleared_at"])
        run = Batch.objects.create(ward=ward, team=teams[0], created_by=officer, deadline=now + timedelta(hours=4),
                                   created_at=now - timedelta(minutes=50))
        for n, r in enumerate(reports[10:12], 1):
            t = Task.objects.create(report=r, batch=run, team=teams[0], stop_no=n, created_at=now - timedelta(minutes=50))
            if n == 1:
                t.status, t.before_at, t.before_coverage, t.distance_m = "in_progress", now - timedelta(minutes=12), r.coverage_pct, 9
                t.before_photo.save("before.jpg", ContentFile((PHOTOS / "test_big_pile.jpg").read_bytes()), save=False)
                t.save()
            r.status = "in_progress" if n == 1 else "assigned"
            r.save(update_fields=["status"])
        self.stdout.write(self.style.SUCCESS(f"Demo data ready: {len(reports)} reports in {ward.name} "
                                             f"(1 emergency request, 1 batch on the way, 2 cleared)."))
