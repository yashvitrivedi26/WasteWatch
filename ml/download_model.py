"""Download the free CLIP image model (no API key) used to judge the trash level.

Run once from the repo root:  python -m ml.download_model
The text side is already in the repo (ml/models/text_embeds.npy), so only the image model is downloaded.
Sources, tried in order:
  1. Jina AI clip-as-service ONNX export of OpenAI CLIP ViT-B/32 (Amazon S3, ~350 MB)
  2. Xenova/clip-vit-base-patch32 quantized ONNX on Hugging Face (~90 MB)

To change the prompts in ml/clip_prompts.py, also run:  pip install onnx_clip  and  python -m ml.download_model --prompts
"""
import json
import sys
import urllib.request
from pathlib import Path

import numpy as np

from .clip_prompts import CLASSES, signature

DIR = Path(__file__).parent / "models"
JINA = "https://clip-as-service.s3.us-east-2.amazonaws.com/models-436c69702d61732d53657276696365/onnx/ViT-B-32/"
VISION_SOURCES = [
    (JINA + "visual.onnx", 300_000_000),
    ("https://huggingface.co/Xenova/clip-vit-base-patch32/resolve/main/onnx/vision_model_quantized.onnx", 50_000_000),
]


def _progress(block, size, total):
    if total > 0:
        pct = min(100, block * size * 100 // total)
        print(f"\r    {pct:3d}%  ({block * size // 1_000_000} of {total // 1_000_000} MB)", end="", flush=True)


def fetch(url, out, min_size):
    tmp = out.with_suffix(".part")
    try:
        urllib.request.urlretrieve(url, tmp, _progress)
        print()
        if tmp.stat().st_size < min_size:
            raise OSError("file too small (download was cut off)")
        tmp.replace(out)
        return True
    except Exception as e:  # network blocked, proxy, timeout ...
        print(f"\n    failed: {e}")
        tmp.unlink(missing_ok=True)
        return False


def download_vision():
    out = DIR / "vision.onnx"
    if out.exists() and out.stat().st_size > 50_000_000:
        print("  image model: already downloaded")
        return True
    for url, min_size in VISION_SOURCES:
        print(f"  image model from {url.split('/')[2]} ...")
        if fetch(url, out, min_size):
            return True
    return False


def build_text_embeddings():
    """Re-encode the prompts with the CLIP text model (only needed after editing ml/clip_prompts.py)."""
    import onnxruntime as ort
    from onnx_clip.tokenizer import Tokenizer  # pip install onnx_clip

    text = DIR / "text.onnx"
    if not text.exists() and not fetch(JINA + "textual.onnx", text, 200_000_000):
        raise SystemExit("Could not download the text model.")
    tok = Tokenizer()
    sess = ort.InferenceSession(str(text), providers=["CPUExecutionProvider"])
    rows = []
    for prompts in CLASSES.values():
        ids = tok.encode_text(prompts).astype(np.int32)
        e = sess.run(None, {"input_ids": ids, "attention_mask": (ids > 0).astype(np.int32)})[0]
        m = (e / np.linalg.norm(e, axis=1, keepdims=True)).mean(0)
        rows.append(m / np.linalg.norm(m))
    np.save(DIR / "text_embeds.npy", np.stack(rows).astype(np.float32))
    (DIR / "classes.json").write_text(json.dumps({"classes": list(CLASSES), "signature": signature()}))
    print(f"  prompts encoded for: {', '.join(CLASSES)}")


def main():
    DIR.mkdir(exist_ok=True)
    if "--prompts" in sys.argv:
        build_text_embeddings()
        return
    print("Downloading the CLIP image model (one time) ...")
    if not download_vision():
        raise SystemExit("Download failed from every source. Check the internet connection and run: python -m ml.download_model")
    print("Done. Restart the backend; the report page will show 'trash-model v3' under the level bars.")


if __name__ == "__main__":
    main()
