"""Train the 48 h hotspot model.  Run from the repo root:  python -m ml.train"""
from datetime import datetime
from pathlib import Path

import joblib
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.metrics import average_precision_score, roc_auc_score

from .features import FEATURES

HERE = Path(__file__).parent
DATA = HERE / "data" / "training_data.csv"
MODEL = HERE / "model.joblib"


def main():
    if not DATA.exists():
        raise SystemExit("No training data. Run: python -m ml.generate_data")
    df = pd.read_csv(DATA, parse_dates=["date"])

    # Time-based split: train on the past, test on the last 60 days (no leakage).
    cutoff = df.date.max() - pd.Timedelta(days=60)
    train, test = df[df.date <= cutoff], df[df.date > cutoff]

    model = GradientBoostingClassifier(n_estimators=200, max_depth=3, learning_rate=0.05, random_state=0)
    model.fit(train[FEATURES], train.hotspot_48h)

    p = model.predict_proba(test[FEATURES])[:, 1]
    auc = roc_auc_score(test.hotspot_48h, p)
    ap = average_precision_score(test.hotspot_48h, p)
    print(f"Test ROC-AUC {auc:.3f} | PR-AUC {ap:.3f} | base rate {test.hotspot_48h.mean():.1%}")

    joblib.dump({"model": model, "features": FEATURES, "trained_at": datetime.now().isoformat(), "auc": auc}, MODEL)
    print(f"Saved model to {MODEL}")


if __name__ == "__main__":
    main()
