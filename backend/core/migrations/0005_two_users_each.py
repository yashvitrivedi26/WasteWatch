"""Keep 2 ward officers and 2 workers (Central Zone + East Zone) and 1 admin; switch off wards without staff."""
from django.db import migrations

REMOVED = ["anita.shah", "dhruv.bhatt", "komal.makwana", "hetal.pandya", "sunita.chauhan", "kiran.vaghela",
           "mahesh.dave", "nilesh.rathod", "jayesh.baraiya", "pooja.vala", "alpesh.mer"]


def trim(apps, schema_editor):
    User = apps.get_model("auth", "User")
    Ward = apps.get_model("core", "Ward")
    User.objects.filter(username__in=REMOVED).delete()
    Ward.objects.exclude(code__in=["CZ", "EZ"]).update(is_active=False)


class Migration(migrations.Migration):
    dependencies = [("core", "0004_remove_demo_data"), ("auth", "0012_alter_user_first_name_max_length")]
    operations = [migrations.RunPython(trim, migrations.RunPython.noop)]
