"""48 h rain forecast from Open-Meteo (free, no API key), cached per location for an hour."""
import json
import time
import urllib.request

_cache = {}


def rain_next_48h(lat, lng):
    """Returns (mm, source). Falls back to 0 mm if offline."""
    key = (round(lat, 2), round(lng, 2))
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < 3600:
        return hit[1]
    url = ("https://api.open-meteo.com/v1/forecast"
           f"?latitude={lat:.4f}&longitude={lng:.4f}&daily=precipitation_sum&forecast_days=3&timezone=Asia%2FKolkata")
    try:
        with urllib.request.urlopen(url, timeout=4) as r:
            daily = json.load(r)["daily"]["precipitation_sum"]
        value = (round(sum(x or 0 for x in daily[1:3]), 1), "Open-Meteo")
    except Exception:
        value = (0.0, "offline")
    _cache[key] = (time.time(), value)
    return value
