"""Read GPS coordinates from a photo's EXIF data (server-side fallback when the browser sends no location)."""
from PIL import Image


def _to_deg(dms, ref):
    deg = float(dms[0]) + float(dms[1]) / 60 + float(dms[2]) / 3600
    return -deg if ref in ("S", "W") else deg


def photo_gps(file):
    """Return (lat, lng) from the image's EXIF GPS tags, or None. Leaves the file readable afterwards."""
    try:
        gps = Image.open(file).getexif().get_ifd(0x8825)
        if not gps or 2 not in gps or 4 not in gps:
            return None
        lat, lng = _to_deg(gps[2], gps.get(1)), _to_deg(gps[4], gps.get(3))
        return None if (lat == 0 and lng == 0) else (lat, lng)
    except Exception:
        return None
    finally:
        try:
            file.seek(0)
        except Exception:
            pass
