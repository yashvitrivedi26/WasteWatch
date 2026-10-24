"""Removes the demo reports that an earlier version's setup added (seed_demo). Real reports are not touched."""
import re

from django.db import migrations

DEMO_ADDRESSES = {
    "Vegetable market lane, Ghogha Gate", "Behind Gangajalia Talav, Darbargadh", "Near ST bus stand gate",
    "Kalanala chowk, footpath", "Opp. Sir Takhtsinhji Hospital gate", "Waghawadi Road, open plot",
    "Nilambaug circle, bin overflow", "Crescent circle, roadside", "Haluria chowk, behind shops",
    "Parimal chowk drain side", "Station road, near tea stalls", "Rupani circle, corner plot",
}


def remove_demo(apps, schema_editor):
    Report = apps.get_model("core", "Report")
    Batch = apps.get_model("core", "Batch")
    demo = [r.pk for r in Report.objects.filter(address__in=DEMO_ADDRESSES) if re.fullmatch(r"0{14}[0-9a-f]{2}", r.photo_hash or "")]
    Report.objects.filter(pk__in=demo).delete()  # tasks and notifications go with them
    Batch.objects.filter(tasks__isnull=True).delete()


class Migration(migrations.Migration):
    dependencies = [("core", "0003_emergency_request")]
    operations = [migrations.RunPython(remove_demo, migrations.RunPython.noop)]
