"""TFLite modelini, uygulamadaki ön/son işlemenin aynısıyla tek kart fotoğraflarında dener.

Kullanım (TensorFlow ayrı ortamda):
  uvx --python 3.11 --from ai_edge_litert --with opencv-python --with numpy \
      python check_tflite.py exports/v1_tf/v1_raw_float16.tflite
Uygulamadaki src/scorekeeper/card-detector.ts bu dosyadaki letterbox ve decode
adımlarını birebir izler; birini değiştirirsen diğerini de değiştir.
"""
import json
import sys
from pathlib import Path

import cv2
import numpy as np
from ai_edge_litert.interpreter import Interpreter

CLASSES = ["joker", "A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"]
SIZE = 640
CONF = 0.4
IOU = 0.5


def letterbox(rgb: np.ndarray) -> tuple[np.ndarray, float, int, int]:
    h, w = rgb.shape[:2]
    scale = SIZE / max(h, w)
    nw, nh = round(w * scale), round(h * scale)
    out = np.full((SIZE, SIZE, 3), 114, np.uint8)
    dx, dy = (SIZE - nw) // 2, (SIZE - nh) // 2
    out[dy:dy + nh, dx:dx + nw] = cv2.resize(rgb, (nw, nh), interpolation=cv2.INTER_LINEAR)
    return out, scale, dx, dy


def decode(raw: np.ndarray) -> list[tuple[int, float, float, float, float, float]]:
    """raw: (4 + sınıf, 8400). Kutular giriş pikseli cinsinden merkez/genişlik."""
    if raw.max() <= 2:  # bazı dönüştürmeler kutuları 0-1 aralığına normalize eder
        raw = raw.copy()
        raw[:4] *= SIZE
    scores = raw[4:]
    cls = scores.argmax(0)
    conf = scores.max(0)
    keep = np.where(conf >= CONF)[0]
    dets = sorted(((int(cls[i]), float(conf[i]), *map(float, raw[:4, i])) for i in keep), key=lambda d: -d[1])
    out = []
    for d in dets:
        if all(o[0] != d[0] or iou(o, d) < IOU for o in out):
            out.append(d)
    return out


def iou(a, b) -> float:
    ax0, ay0, ax1, ay1 = a[2] - a[4] / 2, a[3] - a[5] / 2, a[2] + a[4] / 2, a[3] + a[5] / 2
    bx0, by0, bx1, by1 = b[2] - b[4] / 2, b[3] - b[5] / 2, b[2] + b[4] / 2, b[3] + b[5] / 2
    inter = max(0, min(ax1, bx1) - max(ax0, bx0)) * max(0, min(ay1, by1) - max(ay0, by0))
    return inter / (a[4] * a[5] + b[4] * b[5] - inter + 1e-9)


def main():
    interpreter = Interpreter(model_path=sys.argv[1])
    interpreter.allocate_tensors()
    inp = interpreter.get_input_details()[0]
    out = interpreter.get_output_details()[0]
    print("giriş", inp["shape"], inp["dtype"], "çıkış", out["shape"])
    labels = json.loads(Path("data/photos/etiketler.json").read_text(encoding="utf-8"))
    ok, bad = 0, []
    for name, label in sorted(labels.items()):
        rgb = cv2.cvtColor(cv2.imread(f"data/photos/kartlar/{name}"), cv2.COLOR_BGR2RGB)
        img, *_ = letterbox(rgb)
        interpreter.set_tensor(inp["index"], (img.astype(np.float32) / 255)[None])
        interpreter.invoke()
        raw = interpreter.get_tensor(out["index"])[0]
        if raw.shape[0] != 4 + len(CLASSES):
            raw = raw.T
        preds = [CLASSES[d[0]] for d in decode(raw)]
        if preds and all(p == label for p in preds):
            ok += 1
        else:
            bad.append((label, preds))
    print(f"{ok}/{len(labels)} doğru", bad)


if __name__ == "__main__":
    main()
