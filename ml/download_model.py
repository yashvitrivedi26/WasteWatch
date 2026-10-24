"""Download the free CLIP model (ONNX, ~150 MB, no API key) and prepare the trash-level prompts.

Run once from the repo root:  python -m ml.download_model
Source: https://huggingface.co/Xenova/clip-vit-base-patch32 (MIT licence, OpenAI CLIP ViT-B/32, quantized ONNX).
"""
import json
import urllib.request
from pathlib import Path

import numpy as np

from .clip_prompts import CLASSES

REPO = "https://huggingface.co/Xenova/clip-vit-base-patch32/resolve/main/"
FILES = {"vision.onnx": "onnx/vision_model_quantized.onnx", "text.onnx": "onnx/text_model_quantized.onnx", "tokenizer.json": "tokenizer.json"}
DIR = Path(__file__).parent / "models"


def fetch(name, path):
    out = DIR / name
    if out.exists() and out.stat().st_size > 1000:
        print(f"  {name}: already downloaded")
        return out
    print(f"  {name}: downloading ...", flush=True)
    tmp = out.with_suffix(".part")
    urllib.request.urlretrieve(REPO + path, tmp)
    tmp.replace(out)
    return out


def output_named(sess, outs, word):
    names = [o.name for o in sess.get_outputs()]
    for i, n in enumerate(names):
        if word in n:
            return outs[i]
    return outs[0]


def build_text_embeddings():
    import onnxruntime as ort
    from tokenizers import Tokenizer

    tok = Tokenizer.from_file(str(DIR / "tokenizer.json"))
    sess = ort.InferenceSession(str(DIR / "text.onnx"), providers=["CPUExecutionProvider"])
    inputs = [i.name for i in sess.get_inputs()]
    vecs = {}
    for cls, prompts in CLASSES.items():
        embs = []
        for p in prompts:
            ids = np.array([tok.encode(p).ids], dtype=np.int64)
            feed = {"input_ids": ids}
            if "attention_mask" in inputs:
                feed["attention_mask"] = np.ones_like(ids)
            e = output_named(sess, sess.run(None, feed), "text_embeds")[0]
            embs.append(e / np.linalg.norm(e))
        m = np.mean(embs, axis=0)
        vecs[cls] = (m / np.linalg.norm(m)).astype(np.float32)
    np.save(DIR / "text_embeds.npy", np.stack([vecs[c] for c in CLASSES]))
    (DIR / "classes.json").write_text(json.dumps(list(CLASSES)))
    print(f"  prompts ready for: {', '.join(CLASSES)}")


def main():
    DIR.mkdir(exist_ok=True)
    print("Downloading the CLIP model (one time, about 150 MB) ...")
    for name, path in FILES.items():
        fetch(name, path)
    build_text_embeddings()
    print("Done. Restart the backend to use the trash-level model.")


if __name__ == "__main__":
    main()
