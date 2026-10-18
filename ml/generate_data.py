"""Generate a synthetic year of block-day history for the Bhavnagar ward.

Run from the repo root:  python -m ml.generate_data
"""
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

from . import ward
from .features import FEATURES, static_features

OUT = Path(__file__).parent / "data" / "training_data.csv"
DAYS = 365


def main():
    rng = np.random.default_rng(7)
    start = date(2025, 1, 1)
    dates = [start + timedelta(days=i) for i in range(DAYS + 2)]

    # Daily rain: wet monsoon (Jun-Sep), mostly dry otherwise.
    rain = np.array([
        rng.gamma(2, 8) if (d.month in (6, 7, 8, 9) and rng.random() < 0.5) else
        (rng.gamma(1, 3) if rng.random() < 0.05 else 0.0)
        for d in dates
    ])

    rows = []
    for r in range(ward.ROWS):
        for c in range(ward.COLS):
            s = static_features(r, c)
            pickup_p = 0.6 if s["near_plot"] else 0.75
            dsp, reports = 1, []  # reports per day since last pickup
            for i in range(DAYS):
                if rng.random() < pickup_p:
                    dsp, reports = 0, []
                else:
                    dsp += 1
                lam = 0.1 + 0.3 * s["footfall"] + 0.4 * s["near_market"] + 0.3 * s["near_plot"] + 0.12 * dsp
                reports = (reports + [rng.poisson(lam)])[-7:]

                market_day = int(any(dates[i + k].weekday() == ward.MARKET_WEEKDAY for k in (1, 2)))
                rain_mm = float(rain[i + 1] + rain[i + 2])
                feat = {**s, "reports_since_pickup": sum(reports), "days_since_pickup": dsp,
                        "market_day": market_day, "rain_mm": round(rain_mm, 1)}

                # Hidden "true" process that the model must learn.
                logit = (-4.6 + 0.35 * feat["reports_since_pickup"] + 0.45 * dsp + 0.9 * s["footfall"]
                         + 0.8 * s["near_market"] + 1.4 * s["near_market"] * market_day + 0.9 * s["near_bus"]
                         + 0.8 * s["near_construction"] + 1.2 * s["near_plot"]
                         + 0.04 * rain_mm * (1 + s["near_plot"] + s["near_market"]) + rng.normal(0, 0.5))
                label = int(rng.random() < 1 / (1 + np.exp(-logit)))
                rows.append({"date": dates[i].isoformat(), "block": ward.block_code(r, c), **feat, "hotspot_48h": label})

    df = pd.DataFrame(rows)[["date", "block", *FEATURES, "hotspot_48h"]]
    OUT.parent.mkdir(exist_ok=True)
    df.to_csv(OUT, index=False)
    print(f"Wrote {len(df)} rows to {OUT} (hotspot rate {df.hotspot_48h.mean():.1%})")


if __name__ == "__main__":
    main()
