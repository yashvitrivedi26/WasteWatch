"""Geo helpers shared by the backend (no synthetic grid any more: every point is a real GPS location)."""
import math


def distance_m(lat1, lng1, lat2, lng2):
    """Great-circle distance in metres (haversine)."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lng2 - lng1) / 2) ** 2
    return 6371000 * 2 * math.asin(math.sqrt(a))


def route_order(points, start=None):
    """Nearest-neighbour visiting order for [(id, lat, lng)] starting at `start` (lat, lng) or the first point."""
    left = list(points)
    if not left:
        return []
    cur = start or (left[0][1], left[0][2])
    out = []
    while left:
        nxt = min(left, key=lambda p: distance_m(cur[0], cur[1], p[1], p[2]))
        left.remove(nxt)
        out.append(nxt[0])
        cur = (nxt[1], nxt[2])
    return out
