"""Trash-level classifier: a pretrained CLIP vision model (free, offline after one download).

How it decides:
  1. The photo is turned into a 512-number "embedding" by the CLIP vision model.
  2. If you trained your own model on labelled ward photos (manage.py train_trash_model), a logistic
     regression on that embedding predicts clean / low / medium / high.
  3. Otherwise CLIP compares the embedding with sentences such as "a pile of garbage on the street"
     (ml/clip_prompts.py) and picks the closest level (zero-shot).
If the model files are missing, available() is False and the app falls back to the OpenCV coverage only.
"""
import json
import threading
from pathlib import Path

import cv2
import numpy as np

DIR = Path(__file__).resolve().parents[2] / "ml" / "models"
MEAN = np.array([0.48145466, 0.4578275, 0.40821073], np.float32)
STD = np.array([0.26862954, 0.26130258, 0.27577711], np.float32)
SEVERITY = {"clean": 0.0, "low": 1.0, "medium": 2.0, "high": 3.0}
_lock = threading.Lock()
_state = {}


def available():
    return (DIR / "vision.onnx").exists() and ((DIR / "text_embeds.npy").exists() or (DIR / "trash_probe.joblib").exists())


def _prompts_current():
    """True if the saved prompt embeddings match ml/clip_prompts.py."""
    from ml.clip_prompts import signature
    try:
        meta = json.loads((DIR / "classes.json").read_text())
    except (OSError, ValueError):
        return False
    return isinstance(meta, dict) and meta.get("signature") == signature()


def _load():
    with _lock:
        if not _state:
            import onnxruntime as ort

            # Prompts were edited (or saved by an older version): rebuild their embeddings from the text model.
            if (DIR / "text.onnx").exists() and (DIR / "tokenizer.json").exists() and not _prompts_current():
                from ml.download_model import build_text_embeddings
                build_text_embeddings()
            _state["sess"] = ort.InferenceSession(str(DIR / "vision.onnx"), providers=["CPUExecutionProvider"])
            if (DIR / "text_embeds.npy").exists():
                _state["text"] = np.load(DIR / "text_embeds.npy")
                meta = json.loads((DIR / "classes.json").read_text())
                _state["classes"] = meta["classes"] if isinstance(meta, dict) else meta
            probe = DIR / "trash_probe.joblib"
            if probe.exists():
                import joblib

                _state["probe"] = joblib.load(probe)
    return _state


def reload():
    with _lock:
        _state.clear()


def preprocess(img_bgr):
    """OpenCV BGR image -> CLIP input (1, 3, 224, 224): shortest side 224, centre crop, normalise."""
    h, w = img_bgr.shape[:2]
    s = 224 / min(h, w)
    img = cv2.resize(img_bgr, (max(224, round(w * s)), max(224, round(h * s))), interpolation=cv2.INTER_CUBIC)
    h, w = img.shape[:2]
    y, x = (h - 224) // 2, (w - 224) // 2
    rgb = cv2.cvtColor(img[y:y + 224, x:x + 224], cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    return ((rgb - MEAN) / STD).transpose(2, 0, 1)[None].astype(np.float32)


def embed(img_bgr):
    st = _load()
    sess = st["sess"]
    outs = sess.run(None, {sess.get_inputs()[0].name: preprocess(img_bgr)})
    names = [o.name for o in sess.get_outputs()]
    e = outs[next((i for i, n in enumerate(names) if "image_embeds" in n), 0)][0].astype(np.float32)
    if e.ndim > 1:  # some exports return per-token states; take the pooled first token
        e = e[0]
    return e / (np.linalg.norm(e) + 1e-8)


def _softmax(x):
    x = x - x.max()
    p = np.exp(x)
    return p / p.sum()


def coverage_level(coverage):
    return "low" if coverage < 12 else "medium" if coverage < 35 else "high"


def classify(img_bgr, coverage=None):
    """Returns {'level', 'probs': {clean, low, medium, high}, 'trash_prob', 'is_scene', 'method', 'decided_by'}.

    The level is the most likely class (not an average, which would always drift to MEDIUM). When the two most
    likely trash levels are almost tied, the OpenCV coverage of the photo breaks the tie.
    """
    st = _load()
    e = embed(img_bgr)
    is_scene = True
    if "probe" in st:
        probe = st["probe"]
        p = probe.predict_proba(e[None])[0]
        probs = {c: float(v) for c, v in zip(probe.classes_, p)}
        method = "trained"
    else:
        p = _softmax(100.0 * st["text"] @ e)  # CLIP logit scale = 100
        allp = dict(zip(st["classes"], p.tolist()))
        is_scene = allp.get("other", 0) < 0.5
        total = sum(allp.get(c, 0) for c in SEVERITY) or 1.0
        probs = {c: allp.get(c, 0) / total for c in SEVERITY}
        method = "zero-shot"
    for c in SEVERITY:
        probs.setdefault(c, 0.0)
    ranked = sorted(("low", "medium", "high"), key=lambda c: -probs[c])
    decided_by = "model"
    if probs["clean"] >= probs[ranked[0]]:
        level = "clean"
    else:
        level = ranked[0]
        if coverage is not None and probs[ranked[0]] - probs[ranked[1]] < 0.08:
            by_cov = coverage_level(coverage)
            if by_cov in ranked[:2]:
                level, decided_by = by_cov, "model+coverage"
    return {"level": level, "probs": {k: round(v, 3) for k, v in probs.items()}, "trash_prob": round(1 - probs["clean"], 3),
            "is_scene": is_scene, "method": method, "decided_by": decided_by}
