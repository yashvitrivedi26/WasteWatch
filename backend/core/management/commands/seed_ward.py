"""Create the Bhavnagar Municipal Corporation (BMC) offices as wards, their teams, and staff accounts.

Offices, addresses and phone numbers are the ones BMC publishes (bmcgujarat.com, "Office Addresses" and ward office lists).
The Head Office pin is exact (Google plus code Q4CW+M8X, "Mahanagar Seva Sadan, Kalanala").
For the other offices the command looks the address up on OpenStreetMap (Nominatim, free, needs internet). If a lookup fails the
pin falls back to the Head Office and a warning is printed: open Admin > Wards & offices and correct that office's latitude/longitude.

Safe to run again: existing wards are never overwritten, so edits made in the Admin panel stay.
Creates NO reports: every report on the map comes from a real upload.
"""
import json
import time
import urllib.parse
import urllib.request

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand

from core.models import Profile, Team, Ward
from ml import ward as geo

HQ = (21.77174, 72.14586)  # decoded from plus code Q4CW+M8X (BMC Head Office, Near Kalanala)
HOURS = "Mon-Sat, 10:30 AM - 6:10 PM"
WASTE_HELPLINE = "9727623623"  # BMC "Waste and Dead Animals" helpline

# code, ward name, office name, address, phone, exact (lat, lng) or None, Nominatim queries, teams, old code of the earlier demo ward
OFFICES = [
    ("CZ", "Central Zone", "BMC Head Office (Mahanagar Seva Sadan)",
     "Bhavnagar Mahanagar Seva Sadan, Sir Mangalsinhji Road, Near Kalanala, Bhavnagar, Gujarat 364001",
     "0278-2439900", HQ, [], ["Team A", "Team B", "Team C", "Team D"], "W7"),
    ("EZ", "East Zone", "BMC East Zone Office",
     "Opp. Mantresh Complex, Varahi Society, Bhavnagar, Gujarat 364002",
     "0278-2430245", None, ["Varahi Society, Bhavnagar", "Mantresh Complex, Ghogha Road, Bhavnagar", "Tarsamiya, Bhavnagar"], ["Team A", "Team B"], "W3"),
    ("WZ", "West Zone", "BMC West Zone Office",
     "Akhlol Jakatnaka, Bhavnagar, Gujarat 364004",
     "9978420640", None, ["Akhlol Jakatnaka, Bhavnagar", "Akhlol, Bhavnagar"], ["Team A", "Team B"], "W11"),
    ("GC", "Ghogha Circle - Akwada", "Ghogha Circle Ward Office",
     "Municipal Shopping Center, Shivaji Circle, Ghogha Road, Bhavnagar, Gujarat",
     WASTE_HELPLINE, None, ["Shivaji Circle, Bhavnagar"], ["Team A", "Team B"], None),
    ("SN", "Sardarnagar", "Sardarnagar Ward Office",
     "Municipal Shopping Center, Sardarnagar Circle, Bhavnagar, Gujarat",
     WASTE_HELPLINE, None, ["Sardarnagar Circle, Bhavnagar", "Sardarnagar, Bhavnagar"], ["Team A", "Team B"], None),
    ("TK", "Takhteshwar - Navapara", "Takhteshwar Ward Office",
     "Opp. Parsi Agiyari, Navapara, Bhavnagar, Gujarat",
     WASTE_HELPLINE, None, ["Navapara, Bhavnagar", "Takhteshwar Temple, Bhavnagar"], ["Team A", "Team B"], None),
]

# username, full name, role, ward code, team, password  (demo credentials for first run; change them in Admin > Users)
USERS = [  # 2 ward officers + 2 sanitation workers (one per active ward) + 1 administrator
    ("wwadmin", "Admin", "admin", "", "", "Admin@2026#WW"),
    ("meera.joshi", "Meera Joshi", "officer", "CZ", "", "Meera@Ward7#26"),
    ("rajesh.parmar", "Rajesh Parmar", "officer", "EZ", "", "Rajesh@Ward3#26"),
    ("ramesh.solanki", "Ramesh Solanki", "worker", "CZ", "Team A", "Ramesh@TeamA#26"),
    ("bhavesh.gohil", "Bhavesh Gohil", "worker", "EZ", "Team A", "Bhavesh@W3A#26"),
]
ACTIVE_WARDS = {"CZ", "EZ"}  # wards with staff; reports anywhere in Bhavnagar go to the nearest of these


def lookup(queries):
    """Nominatim search limited to a box around Bhavnagar. Returns (lat, lng) or None."""
    box = f"{HQ[1] - 0.15},{HQ[0] + 0.12},{HQ[1] + 0.15},{HQ[0] - 0.12}"
    for q in queries:
        url = ("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=in&bounded=1"
               f"&viewbox={box}&q={urllib.parse.quote(q)}")
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "WasteWatch-seed/1.0 (Bhavnagar ward offices)"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                rows = json.load(resp)
        except Exception:
            rows = []
        time.sleep(1.1)  # Nominatim allows 1 request per second
        if rows:
            lat, lng = float(rows[0]["lat"]), float(rows[0]["lon"])
            if geo.distance_m(lat, lng, *HQ) < 12000:
                return lat, lng
    return None


class Command(BaseCommand):
    help = "Create the real Bhavnagar BMC offices (as wards), their teams and staff accounts. Creates NO reports."

    def add_arguments(self, parser):
        parser.add_argument("--no-geocode", action="store_true", help="Do not look addresses up online; use the Head Office pin.")

    def handle(self, *args, **opts):
        wards, warn = {}, []
        for code, name, office, addr, phone, exact, queries, teams, old in OFFICES:
            w = Ward.objects.filter(code=code).first()
            fresh = w is None
            if fresh and old:  # the earlier demo ward becomes the real office, so its reports, teams and staff are kept
                w = Ward.objects.filter(code=old).first()
            if w and not fresh:
                wards[code] = w
                for t in teams:
                    Team.objects.get_or_create(ward=w, name=t)
                continue
            pos = exact or (None if opts["no_geocode"] else lookup(queries))
            if not pos:
                pos = HQ
                warn.append(f"{office}: exact pin not found, placed at the Head Office. Correct it in Admin > Wards & offices.")
            w = w or Ward()
            w.code, w.name, w.city, w.radius_km = code, name, "Bhavnagar", 2.5
            w.center_lat, w.center_lng, w.office_lat, w.office_lng = pos[0], pos[1], pos[0], pos[1]
            w.office_name, w.office_address, w.office_phone, w.office_hours = office, addr, phone, HOURS
            w.office_email = "comm-bmc@gujarat.gov.in" if code == "CZ" else ""
            w.is_active = code in ACTIVE_WARDS
            w.save()
            wards[code] = w
            for t in teams:
                Team.objects.get_or_create(ward=w, name=t)

        for username, full, role, wcode, team, pw in USERS:
            user, created = User.objects.get_or_create(username=username)
            if created:
                user.set_password(pw)
                first, _, last = full.partition(" ")
                user.first_name, user.last_name = first, last
                user.is_staff = user.is_superuser = role == "admin"
                user.save()
            ward = wards.get(wcode)
            Profile.objects.update_or_create(user=user, defaults={
                "role": role, "ward": ward, "team": Team.objects.filter(ward=ward, name=team).first() if team else None})

        for line in warn:
            self.stdout.write(self.style.WARNING(line))
        self.stdout.write(self.style.SUCCESS(
            f"Ready: {Ward.objects.count()} offices, {Team.objects.count()} teams, {User.objects.count()} staff accounts, 0 sample reports."))
