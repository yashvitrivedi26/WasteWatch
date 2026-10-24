"""Admin-editable settings (stored in the database, with safe defaults)."""
from .models import SiteSetting

DEFAULTS = {
    "level_medium_pct": 12,      # OpenCV coverage % at which a photo counts as MEDIUM
    "level_high_pct": 30,        # ... and HIGH
    "eta_base_min": 10,          # minutes of work for a tiny pile (2-person team)
    "eta_per_pct": 1.2,          # extra minutes per 1% of the photo covered by waste
    "after_max_ratio": 0.5,      # after-photo waste must be below this share of the before-photo waste
    "geofence_m": 200,           # worker photo must be within this distance of the report
    "forecast_radius_m": 120,    # reports closer than this form one hotspot
    "sla_hours": {"high": 6, "medium": 24, "low": 48},
    "emergency_contacts": [
        {"label": "Emergency (police, fire, ambulance)", "number": "112"},
        {"label": "Police", "number": "100"},
        {"label": "Fire", "number": "101"},
        {"label": "Ambulance", "number": "108"},
    ],
    "helpline_note": "For hazardous, medical or burning waste, a blocked drain or a dead animal, tick 'Emergency' when you report and also call the ward office.",
}


def get(key):
    row = SiteSetting.objects.filter(key=key).first()
    return row.value if row else DEFAULTS[key]


def all_settings():
    saved = {s.key: s.value for s in SiteSetting.objects.all()}
    return {k: saved.get(k, v) for k, v in DEFAULTS.items()}


def put(key, value):
    if key not in DEFAULTS:
        raise KeyError(key)
    SiteSetting.objects.update_or_create(key=key, defaults={"value": value})
