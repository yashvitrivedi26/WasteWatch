"""48 h rain forecast from Open-Meteo (free, no API key)."""
import json
import time
import urllib.request

from ml import ward

_cache = {"at": 0, "value": None}


def rain_next_48h():
    """Returns (mm, source). Cached for an hour; falls back to 0 mm if offline."""
    if _cache["value"] and time.time() - _cache["at"] < 3600:
        return _cache["value"]
    lat, lng = ward.block_center(ward.ROWS // 2, ward.COLS // 2)
    url = ("https://api.open-meteo.com/v1/forecast"
           f"?latitude={lat:.4f}&longitude={lng:.4f}&daily=precipitation_sum&forecast_days=3&timezone=Asia%2FKolkata")
    try:
        with urllib.request.urlopen(url, timeout=5) as r:
            daily = json.load(r)["daily"]["precipitation_sum"]
        value = (round(sum(x or 0 for x in daily[1:3]), 1), "Open-Meteo")
    except Exception:
        value = (0.0, "offline (assumed dry)")
    _cache.update(at=time.time(), value=value)
    return value
