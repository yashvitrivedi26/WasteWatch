"""Train the trash-level model on your own labelled photos.

Put photos in folders named by level, then run:
    python manage.py train_trash_model path\\to\\photos
    photos/clean/*.jpg   photos/low/*.jpg   photos/medium/*.jpg   photos/high/*.jpg
At least ~20 photos per folder is a good start. The CLIP model turns each photo into an embedding and a
logistic regression learns your ward's levels. The result is saved to ml/models/trash_probe.joblib and used
automatically instead of the zero-shot prompts.
"""
from pathlib import Path

import cv2
import numpy as np
from django.core.management.base import BaseCommand, CommandError

from core import trash_model

LEVELS = ["clean", "low", "medium", "high"]
EXT = {".jpg", ".jpeg", ".png", ".webp"}


class Command(BaseCommand):
    help = "Train the trash-level classifier from folders clean/ low/ medium/ high/."

    def add_arguments(self, parser):
        parser.add_argument("folder")

    def handle(self, folder, **opts):
        if not (trash_model.DIR / "vision.onnx").exists():
            raise CommandError("Download the model first: python -m ml.download_model (from the repo root)")
        from sklearn.linear_model import LogisticRegression
        from sklearn.model_selection import cross_val_score
        import joblib

        X, y = [], []
        for lvl in LEVELS:
            for p in sorted((Path(folder) / lvl).glob("*")):
                if p.suffix.lower() not in EXT:
                    continue
                img = cv2.imread(str(p))
                if img is None:
                    continue
                X.append(trash_model.embed(img))
                y.append(lvl)
            self.stdout.write(f"{lvl}: {y.count(lvl)} photos")
        if len(set(y)) < 2 or len(y) < 8:
            raise CommandError("Need photos in at least two of the folders clean/ low/ medium/ high/.")
        X, y = np.array(X), np.array(y)
        clf = LogisticRegression(max_iter=2000, C=2.0, class_weight="balanced")
        folds = min(5, min(list(y).count(c) for c in set(y)))
        if folds >= 2:
            acc = cross_val_score(clf, X, y, cv=folds).mean()
            self.stdout.write(f"Cross-validated accuracy: {acc:.0%}")
        clf.fit(X, y)
        joblib.dump(clf, trash_model.DIR / "trash_probe.joblib")
        trash_model.reload()
        self.stdout.write(self.style.SUCCESS("Saved ml/models/trash_probe.joblib. Restart the backend."))
