from django.core.management.base import BaseCommand, CommandError

from core import scoring


class Command(BaseCommand):
    help = "Predict 48 h hotspot risk for every block and save today's RiskScore rows."

    def handle(self, *args, **opts):
        try:
            results = scoring.score_and_save()
        except scoring.ModelMissing as e:
            raise CommandError(str(e))
        counts = {"high": 0, "medium": 0, "low": 0}
        for _, p, _ in results:
            counts[scoring.level(p)] += 1
        self.stdout.write(self.style.SUCCESS(f"Scored {len(results)} blocks: {counts}"))
