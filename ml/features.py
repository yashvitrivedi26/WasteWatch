"""Feature definitions shared by training (ml/train.py) and scoring (Django)."""
from . import ward

FEATURES = [
    "reports_since_pickup",  # citizen reports since last pickup (max 7 days back)
    "days_since_pickup",
    "footfall",
    "near_market",
    "near_bus",
    "near_construction",
    "near_plot",
    "market_day",  # weekly market falls in the next 48 h
    "rain_mm",  # forecast rain over the next 48 h
]


def static_features(row, col):
    return {
        "footfall": ward.footfall(row, col),
        "near_market": ward.near(row, col, "market"),
        "near_bus": ward.near(row, col, "bus"),
        "near_construction": ward.near(row, col, "construction"),
        "near_plot": ward.near(row, col, "plot"),
    }


def reason_text(feature, value):
    v = value
    return {
        "reports_since_pickup": f"{int(v)} citizen report{'s' if v != 1 else ''} since last pickup",
        "days_since_pickup": f"{int(v)} day{'s' if v != 1 else ''} since last pickup",
        "footfall": "High foot traffic",
        "near_market": "Next to vegetable market",
        "near_bus": "Near bus stand",
        "near_construction": "Construction debris nearby",
        "near_plot": "Open plot (illegal dumping)",
        "market_day": "Weekly market in next 48 h",
        "rain_mm": f"{v:.0f} mm rain forecast (wet waste, clogged drains)",
    }[feature]
