from django.core.management.base import BaseCommand, CommandError

from core import photo_ai


class Command(BaseCommand):
    help = "Run the OpenCV waste analysis on a photo file and print the result (use it to tune thresholds in Admin > Settings)."

    def add_arguments(self, parser):
        parser.add_argument("path")
        parser.add_argument("--save-overlay", help="write the annotated JPEG here")

    def handle(self, *args, **o):
        try:
            a = photo_ai.analyze(open(o["path"], "rb").read())
        except (OSError, photo_ai.PhotoError) as e:
            raise CommandError(str(e))
        if o["save_overlay"]:
            open(o["save_overlay"], "wb").write(a["overlay"])
        for k in ("coverage_pct", "level", "eta_min", "eta_max", "blobs", "blur_score", "brightness"):
            self.stdout.write(f"{k}: {a[k]}")
