"""Synthetic Bhavnagar ward: a 10 x 7 grid of ~100 m blocks with landmarks."""
import random

ORIGIN_LAT, ORIGIN_LNG = 21.7645, 72.1490  # south-west corner
DLAT, DLNG = 0.0009, 0.000967  # ~100 m at 21.76 N
ROWS, COLS = 7, 10
MARKET_WEEKDAY = 6  # weekly market (haat) on Sunday; Monday = 0
TEAMS = ["Team A", "Team B", "Team C", "Team D"]

LANDMARKS = [
    {"type": "market", "name": "Vegetable market", "row": 4, "col": 2},
    {"type": "bus", "name": "Bus stand", "row": 1, "col": 7},
    {"type": "construction", "name": "Construction site", "row": 5, "col": 8},
    {"type": "plot", "name": "Open plot", "row": 2, "col": 4},
]


def block_code(row, col):
    return f"{chr(65 + ROWS - 1 - row)}{col + 1}"  # A = top row


def block_bounds(row, col):
    s, w = ORIGIN_LAT + row * DLAT, ORIGIN_LNG + col * DLNG
    return [[s, w], [s + DLAT, w + DLNG]]


def block_center(row, col):
    (s, w), (n, e) = block_bounds(row, col)
    return [(s + n) / 2, (w + e) / 2]


def locate(lat, lng):
    """Return (row, col) of the block containing the point, or None if outside the ward."""
    row, col = int((lat - ORIGIN_LAT) // DLAT), int((lng - ORIGIN_LNG) // DLNG)
    return (row, col) if 0 <= row < ROWS and 0 <= col < COLS else None


def near(row, col, kind, radius=1):
    return int(any(l["type"] == kind and max(abs(l["row"] - row), abs(l["col"] - col)) <= radius for l in LANDMARKS))


def footfall(row, col):
    """Relative foot traffic 0..1: higher near the market and bus stand."""
    best = 0.0
    for l in LANDMARKS:
        if l["type"] in ("market", "bus"):
            d = max(abs(l["row"] - row), abs(l["col"] - col))
            best = max(best, 1 - d / 4)
    noise = random.Random(row * 100 + col).uniform(0, 0.2)
    return round(min(1.0, 0.15 + 0.65 * best + noise), 2)
