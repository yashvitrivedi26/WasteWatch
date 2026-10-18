import io
import random
from datetime import timedelta

from django.contrib.auth.models import User
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand
from django.utils import timezone
from PIL import Image

from core.models import Block, Profile, Report
from ml import ward
from ml.features import static_features

DEMO_USERS = [("citizen1", "citizen", ""), ("officer1", "officer", ""),
              ("worker1", "worker", "Team A"), ("worker2", "worker", "Team B")]
PASSWORD = "demo1234"


def placeholder_photo():
    buf = io.BytesIO()
    Image.new("RGB", (64, 64), (196, 170, 140)).save(buf, "JPEG")
    return ContentFile(buf.getvalue(), "sample.jpg")


class Command(BaseCommand):
    help = "Create the synthetic Bhavnagar ward (70 blocks), demo users and sample reports."

    def handle(self, *args, **opts):
        rng = random.Random(42)
        now = timezone.now()
        for r in range(ward.ROWS):
            for c in range(ward.COLS):
                Block.objects.update_or_create(row=r, col=c, defaults={
                    "code": ward.block_code(r, c),
                    "last_pickup_at": now - timedelta(days=rng.randint(0, 3), hours=rng.randint(0, 10)),
                })

        for username, role, team in DEMO_USERS:
            user, created = User.objects.get_or_create(username=username)
            if created:
                user.set_password(PASSWORD)
                user.save()
            Profile.objects.update_or_create(user=user, defaults={"role": role, "team": team})

        if not Report.objects.exists():
            citizen = User.objects.get(username="citizen1")
            for b in Block.objects.all():
                s = static_features(b.row, b.col)
                n = sum(rng.random() < 0.15 + 0.3 * s["footfall"] + 0.3 * (s["near_market"] or s["near_plot"])
                        for _ in range(3))
                (s_lat, s_lng), (n_lat, n_lng) = b.bounds
                for _ in range(n):
                    Report.objects.create(
                        block=b, reporter=citizen, photo=placeholder_photo(),
                        lat=rng.uniform(s_lat, n_lat), lng=rng.uniform(s_lng, n_lng),
                        size=rng.choice(["small", "medium", "large"]), type=rng.choice(["household", "plastic", "organic", "mixed"]),
                        ai_label="sample", created_at=now - timedelta(hours=rng.randint(1, 30)),
                    )

        self.stdout.write(self.style.SUCCESS(
            f"Ward ready: {Block.objects.count()} blocks, {Report.objects.count()} reports. "
            f"Demo logins: officer1 / worker1 / worker2, password '{PASSWORD}'."))
