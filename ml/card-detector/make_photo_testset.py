"""Tek kart fotoğraflarını, kırpmada bulunan köşelerden etiketleyip gerçek bir sınav seti yapar.

Kullanım: uv run python make_photo_testset.py data/photos/kartlar data/real/tek-kart \
    --labels data/photos/etiketler.json --corners data/photos/elle_koseler.json --deck data/photos/deste.json
Sonra: uv run yolo val model=runs/<ad>/weights/best.pt data=data/real/tek-kart/data.yaml
"""
import argparse
import json
import shutil
from pathlib import Path

import cv2
import numpy as np

from cards import CARD_SIZE, CLASSES
from prepare_photos import find_card, order_corners


def card_to_photo(corners: np.ndarray) -> np.ndarray:
    """prepare_photos.warp_card'ın tersi: kart koordinatlarından fotoğraf koordinatlarına."""
    tl, tr, br, bl = corners
    if np.linalg.norm(tr - tl) > np.linalg.norm(bl - tl):
        corners = np.float32([tr, br, bl, tl])
    w, h = CARD_SIZE
    inset = 4
    dst = np.float32([[-inset, -inset], [w + inset, -inset], [w + inset, h + inset], [-inset, h + inset]])
    return cv2.getPerspectiveTransform(dst, corners)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("src", type=Path)
    parser.add_argument("dst", type=Path)
    parser.add_argument("--labels", type=Path, required=True)
    parser.add_argument("--corners", type=Path)
    parser.add_argument("--deck", type=Path, required=True, help="deste.json (değer kutuları)")
    args = parser.parse_args()
    labels = json.loads(args.labels.read_text(encoding="utf-8"))
    manual = json.loads(args.corners.read_text(encoding="utf-8")) if args.corners else {}
    deck = json.loads(args.deck.read_text(encoding="utf-8"))
    if args.dst.exists():
        shutil.rmtree(args.dst)
    (args.dst / "images" / "val").mkdir(parents=True)
    (args.dst / "labels" / "val").mkdir(parents=True)
    w, h = CARD_SIZE
    for i, path in enumerate(sorted(p for p in args.src.iterdir() if p.name in labels)):
        image = cv2.imread(str(path))
        ih, iw = image.shape[:2]
        corners = order_corners(np.float32(manual[path.name])) if path.name in manual else find_card(image)
        m = card_to_photo(corners)
        cls = CLASSES.index(labels[path.name])
        x0, y0, x1, y1 = deck["joker_corner" if labels[path.name] == "joker" else "corner"]
        lines = []
        for box in ([x0, y0, x1, y1], [w - x1, h - y1, w - x0, h - y0]):
            pts = np.float32([[box[0], box[1]], [box[2], box[1]], [box[2], box[3]], [box[0], box[3]]])
            p = cv2.perspectiveTransform(pts[None], m)[0]
            bx0, by0 = p.min(0)
            bx1, by1 = p.max(0)
            lines.append(f"{cls} {(bx0 + bx1) / 2 / iw:.6f} {(by0 + by1) / 2 / ih:.6f} {(bx1 - bx0) / iw:.6f} {(by1 - by0) / ih:.6f}\n")
        name = f"tek_{i:03d}"
        shutil.copy(path, args.dst / "images" / "val" / f"{name}.jpg")
        (args.dst / "labels" / "val" / f"{name}.txt").write_text("".join(lines))
    names = "\n".join(f"  {i}: '{n}'" for i, n in enumerate(CLASSES))
    (args.dst / "data.yaml").write_text(f"path: {args.dst.resolve().as_posix()}\ntrain: images/val\nval: images/val\nnames:\n{names}\n")
    print(f"{len(labels)} fotoğraf -> {args.dst}")


if __name__ == "__main__":
    main()
