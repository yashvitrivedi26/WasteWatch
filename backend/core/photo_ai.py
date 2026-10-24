"""Waste analysis: a pretrained CLIP model decides the trash LEVEL (see trash_model.py); OpenCV measures how much
of the photo is covered, draws the overlay, checks blur/darkness and spots duplicate photos. Free, offline, no API key.

OpenCV part:

How it works (classical computer vision, no trained model):
  1. Quality gate: reject photos that are too small, too dark or too blurry (Laplacian variance).
  2. Ignore sky and green foliage (HSV colour ranges).
  3. Waste looks like "clutter": many edges, and strong local changes of brightness and colour. We build a
     clutter score per pixel from Canny edge density + local standard deviation in the LAB colour space,
     threshold it, clean it with morphology and drop tiny blobs.
  4. coverage % = clutter area / non-sky area  ->  LOW / MEDIUM / HIGH (thresholds editable in Admin).
  5. A 64-bit perceptual hash (dHash) detects the same photo being submitted twice.

Limits: this measures how much of the picture is covered by cluttered material, not what the material is. A
heap of bricks and a heap of bags both count. The thresholds were chosen on synthetic test pictures, so
tune them with real photos (python manage.py analyze_image <file>) and replace analyze() with a trained model
(e.g. YOLO / MobileNet) when you have labelled photos. The rest of the app only uses the dict returned here.
"""
import cv2
import numpy as np

from . import config, trash_model

MAX_SIDE = 640
LEVEL_BGR = {"low": (110, 175, 60), "medium": (40, 160, 230), "high": (50, 80, 220)}
TYPE_FACTOR = {"construction": 1.8, "organic": 1.2, "mixed": 1.1, "household": 1.0, "plastic": 1.0}


class PhotoError(ValueError):
    """The photo cannot be analysed (bad file, too blurry, ...). The message is shown to the user as a code."""

    def __init__(self, code):
        super().__init__(code)
        self.code = code


def decode(data):
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise PhotoError("bad_image")
    h, w = img.shape[:2]
    if min(h, w) < 120:
        raise PhotoError("too_small")
    s = MAX_SIDE / max(h, w)
    return cv2.resize(img, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA) if s < 1 else img


def dhash(img):
    g = cv2.resize(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), (9, 8), interpolation=cv2.INTER_AREA)
    bits = (g[:, 1:] > g[:, :-1]).flatten()
    return f"{int(''.join('1' if b else '0' for b in bits), 2):016x}"


def hamming(a, b):
    return bin(int(a, 16) ^ int(b, 16)).count("1") if a and b else 64


def _local_std(ch, k=15):
    f = ch.astype(np.float32)
    m = cv2.blur(f, (k, k))
    return np.sqrt(np.maximum(cv2.blur(f * f, (k, k)) - m * m, 0))


def clutter_mask(img):
    """Returns (mask uint8 0/255, valid-area pixel count)."""
    h, w = img.shape[:2]
    gray = cv2.GaussianBlur(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), (3, 3), 0)
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    H, S, V = cv2.split(hsv)

    edges = cv2.Canny(gray, 50, 140).astype(np.float32) / 255.0
    edge_density = cv2.blur(edges, (21, 21))
    lum = _local_std(lab[:, :, 0])
    chroma = _local_std(lab[:, :, 1]) + _local_std(lab[:, :, 2])
    score = (0.55 * np.clip(edge_density / 0.18, 0, 1) + 0.25 * np.clip(lum / 35, 0, 1)
             + 0.20 * np.clip(chroma / 18, 0, 1))

    top = np.zeros((h, w), bool)
    top[: int(h * 0.5)] = True
    sky = (((H >= 85) & (H <= 135) & (V > 130) & (S < 140) & top) | ((V > 215) & (S < 40) & top)).astype(np.uint8)
    sky = cv2.morphologyEx(sky, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8))
    # vegetation: grass, ivy, bushes (also dull yellow-green leaves), where green is the strongest channel
    b, g, r = cv2.split(img.astype(np.int16))
    leaf = (((H >= 25) & (H <= 95) & (S > 35) & (V > 30)) | ((g > r + 12) & (g > b + 12))).astype(np.uint8)
    leaf = cv2.morphologyEx(leaf, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    excluded = (sky | leaf).astype(bool)

    mask = ((score > 0.42) & ~excluded).astype(np.uint8) * 255
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11)))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))

    n, lbl, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    keep = np.zeros_like(mask)
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] >= 0.004 * h * w:
            keep[lbl == i] = 255
    valid = int(h * w - np.count_nonzero(sky))
    return keep, max(valid, 1)


def level_for(coverage):
    return ("high" if coverage >= config.get("level_high_pct")
            else "medium" if coverage >= config.get("level_medium_pct") else "low")


def _round5(x):
    return max(10, int(round(x / 5.0)) * 5)


def estimate_minutes(coverage, waste_type="mixed"):
    """(minimum, maximum) minutes for a standard 2-person team to clear this much waste."""
    base = config.get("eta_base_min") + config.get("eta_per_pct") * coverage
    lo = _round5(base * TYPE_FACTOR.get(waste_type, 1.1))
    return lo, _round5(lo * 1.4)


def overlay_jpeg(img, mask, level):
    out = img.copy()
    col = np.zeros_like(img)
    col[:] = LEVEL_BGR[level]
    m = mask > 0
    out[m] = cv2.addWeighted(img, 0.62, col, 0.38, 0)[m]
    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cv2.drawContours(out, cnts, -1, LEVEL_BGR[level], 2)
    ok, buf = cv2.imencode(".jpg", out, [cv2.IMWRITE_JPEG_QUALITY, 72])
    return buf.tobytes() if ok else b""


def analyze(data, waste_type="mixed"):
    """Analyse photo bytes. Raises PhotoError('bad_image' | 'too_small' | 'blurry' | 'too_dark')."""
    img = decode(data)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blur = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    bright = float(gray.mean())
    if bright < 22:
        raise PhotoError("too_dark")
    if blur < 12:
        raise PhotoError("blurry")

    mask, valid = clutter_mask(img)
    coverage = float(round(100.0 * np.count_nonzero(mask) / valid, 1))
    level, waste_found, model = level_for(coverage), coverage >= 3, None
    if trash_model.available():
        model = trash_model.classify(img, coverage)
        if not model["is_scene"]:
            raise PhotoError("not_scene")
        waste_found = model["level"] != "clean"
        level = "low" if model["level"] == "clean" else model["level"]
    # The time estimate uses at least the coverage that matches the level, so a HIGH dump never gets a 10-minute ETA.
    eff = max(coverage, {"low": 0, "medium": config.get("level_medium_pct"), "high": config.get("level_high_pct")}[level])
    lo, hi = estimate_minutes(eff, waste_type)
    n_blobs = int(max(cv2.connectedComponents(mask)[0] - 1, 0))
    return {
        "coverage_pct": coverage,
        "level": level,
        "waste_found": bool(waste_found),
        "eta_min": lo,
        "eta_max": hi,
        "blur_score": round(blur, 1),
        "brightness": round(bright, 1),
        "blobs": n_blobs,
        "hash": dhash(img),
        "overlay": overlay_jpeg(img, mask, level),
        "label": ("waste detected" if waste_found else "little or no waste visible"),
        "model": model,
    }


def coverage_only(data):
    """Used for before / after photos taken by workers: (coverage %, model level or None)."""
    img = decode(data)
    mask, valid = clutter_mask(img)
    cov = float(round(100.0 * np.count_nonzero(mask) / valid, 1))
    return cov, (trash_model.classify(img, cov)["level"] if trash_model.available() else None)
