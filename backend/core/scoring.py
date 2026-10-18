"""Runs the trained model on current block data and explains it with SHAP."""
from datetime import timedelta
from functools import lru_cache

import joblib
import numpy as np
import pandas as pd
from django.conf import settings
from django.utils import timezone

from ml import ward
from ml.features import reason_text, static_features

from .models import Block, RiskScore
from .weather import rain_next_48h

HIGH, MEDIUM = 0.25, 0.12  # thresholds tuned to the ~8% base hotspot rate


def level(prob):
    return "high" if prob >= HIGH else "medium" if prob >= MEDIUM else "low"


class ModelMissing(Exception):
    pass


@lru_cache(maxsize=1)
def _load():
    if not settings.ML_MODEL_PATH.exists():
        raise ModelMissing("Model not trained. From the repo root run: python -m ml.generate_data && python -m ml.train")
    import shap  # imported lazily: slow to import

    bundle = joblib.load(settings.ML_MODEL_PATH)
    return bundle["model"], bundle["features"], shap.TreeExplainer(bundle["model"])


def build_features(blocks, scenario=None):
    scenario = scenario or {}
    now = timezone.localtime()
    rain_mm, _ = rain_next_48h()
    if scenario.get("rain"):
        rain_mm = max(rain_mm, 30.0)
    market_day = int(scenario.get("market_day") or any(
        (now + timedelta(days=k)).weekday() == ward.MARKET_WEEKDAY for k in (1, 2)))

    rows = []
    for b in blocks:
        since = max(b.last_pickup_at, now - timedelta(days=7))
        dsp = (now.date() - timezone.localtime(b.last_pickup_at).date()).days
        if scenario.get("missed_pickup"):
            dsp += 2
        rows.append({
            **static_features(b.row, b.col),
            "reports_since_pickup": b.reports.filter(created_at__gte=since).count(),
            "days_since_pickup": dsp,
            "market_day": market_day,
            "rain_mm": rain_mm,
        })
    return pd.DataFrame(rows)


def predict(blocks, scenario=None):
    """Returns [(block, prob, reasons)] with the top 3 SHAP reasons per block."""
    model, features, explainer = _load()
    blocks = list(blocks)
    X = build_features(blocks, scenario)[features]
    probs = model.predict_proba(X)[:, 1]
    sv = explainer.shap_values(X)
    sv = np.asarray(sv[1] if isinstance(sv, list) else sv)
    if sv.ndim == 3:
        sv = sv[:, :, 1]

    out = []
    for i, b in enumerate(blocks):
        ranked = sorted(zip(features, sv[i], X.iloc[i]), key=lambda t: -t[1])
        reasons = [reason_text(f, v) for f, s, v in ranked if s > 0 and v > 0][:3]
        out.append((b, float(probs[i]), reasons))
    return out


def score_and_save(blocks=None):
    blocks = blocks if blocks is not None else Block.objects.all()
    today = timezone.localdate()
    results = predict(blocks)
    for b, prob, reasons in results:
        RiskScore.objects.update_or_create(block=b, date=today, defaults={"prob": prob, "reasons": reasons})
    return results
