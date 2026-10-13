"""Tek kart fotoğraflarından kartı bulup düz (300x420) kırpar.

Kullanım: uv run python prepare_photos.py data/photos/kartlar data/decks/harun \
    --labels data/photos/etiketler.json --corners data/photos/elle_koseler.json
Kart zeminden açık renkli ve az doygun olmasıyla ayrılır; en büyük dörtgen alınıp
perspektif düzeltilir. Sonuçlar ve bir özet tablo (_ozet.jpg) çıktı klasörüne yazılır.
"""
import argparse
import json
from pathlib import Path

import cv2
import numpy as np

from cards import CARD_SIZE


def order_corners(pts: np.ndarray) -> np.ndarray:
    s, d = pts.sum(1), np.diff(pts, axis=1)[:, 0]
    return np.float32([pts[s.argmin()], pts[d.argmin()], pts[s.argmax()], pts[d.argmax()]])


# Işığa göre kart zemini farklı görünür; sırayla daha gevşek/sıkı eşikler denenir.
THRESHOLDS = [(60, 140), (45, 160), (80, 120), (35, 175), (100, 110)]


def find_card(image: np.ndarray) -> np.ndarray:
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    found = []
    for max_sat, min_val in THRESHOLDS:
        mask = ((hsv[..., 1] < max_sat) & (hsv[..., 2] > min_val)).astype(np.uint8) * 255
        try:
            found.append(_find_in_mask(image, mask))
        except ValueError:
            continue
    if not found:
        raise ValueError("kart bulunamadı")
    # Parlama ya da tahta karışmamış sonuç en düzgün dikdörtgendir.
    return max(found, key=lambda f: f[1])[0]


def _find_in_mask(image: np.ndarray, mask: np.ndarray) -> tuple[np.ndarray, float]:
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8))
    # Kenara değen parlamalardan kopar: aşındır, her parçayı içi dolu çiz, geri büyüt.
    k = max(9, int(min(image.shape[:2]) * 0.012)) | 1
    eroded = cv2.erode(mask, np.ones((k, k), np.uint8))
    contours, _ = cv2.findContours(eroded, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    min_area = image.shape[0] * image.shape[1] * 0.02
    best = None
    for c in sorted(contours, key=cv2.contourArea, reverse=True)[:6]:
        if cv2.contourArea(c) < min_area:
            break
        blob = np.zeros(mask.shape, np.uint8)
        cv2.drawContours(blob, [c], -1, 255, -1)
        blob = cv2.dilate(blob, np.ones((k, k), np.uint8))
        found, _ = cv2.findContours(blob, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        c = max(found, key=cv2.contourArea)
        (w, h) = cv2.minAreaRect(c)[1]
        if min(w, h) == 0:
            continue
        ratio = max(w, h) / min(w, h)
        fill = cv2.contourArea(c) / (w * h)
        # İskambil kartı yaklaşık 1.4 oranındadır; parlama lekeleri bu orana ve doluluğa uymaz.
        if 1.2 < ratio < 1.75 and fill > 0.85:
            best, best_fill = c, fill
            break
    if best is None:
        raise ValueError("kart bulunamadı")
    hull = cv2.convexHull(best)
    # Yuvarlak köşeler yüzünden dörtgene inmek için toleransı adım adım artır.
    for eps in (0.01, 0.015, 0.02, 0.03, 0.04):
        approx = cv2.approxPolyDP(hull, eps * cv2.arcLength(hull, True), True)
        if len(approx) == 4:
            return order_corners(approx.reshape(-1, 2).astype(np.float32)), best_fill
    return order_corners(cv2.boxPoints(cv2.minAreaRect(best)).astype(np.float32)), best_fill


def warp_card(image: np.ndarray, corners: np.ndarray) -> np.ndarray:
    tl, tr, br, bl = corners
    if np.linalg.norm(tr - tl) > np.linalg.norm(bl - tl):
        # Yatık kart: dik hale getirmek için köşe sırasını kaydır.
        corners = np.float32([tr, br, bl, tl])
    w, h = CARD_SIZE
    # Kenardaki zemin artığını almamak için içeriden biraz kırp.
    inset = 4
    dst = np.float32([[-inset, -inset], [w + inset, -inset], [w + inset, h + inset], [-inset, h + inset]])
    return cv2.warpPerspective(image, cv2.getPerspectiveTransform(corners, dst), (w, h), flags=cv2.INTER_CUBIC)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("src", type=Path)
    parser.add_argument("dst", type=Path)
    parser.add_argument("--labels", type=Path, help="dosya adı -> değer (ör. \"K\", \"joker\") JSON'u; verilirse çıktı destenin dosya adı olur")
    parser.add_argument("--corners", type=Path, help="otomatik bulunamayan kartlar için dosya adı -> 4 köşe noktası JSON'u")
    args = parser.parse_args()
    labels = json.loads(args.labels.read_text(encoding="utf-8")) if args.labels else {}
    manual = json.loads(args.corners.read_text(encoding="utf-8")) if args.corners else {}
    args.dst.mkdir(parents=True, exist_ok=True)
    tiles, failed, names = [], [], []
    for i, path in enumerate(sorted(p for p in args.src.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png"})):
        image = cv2.imread(str(path))
        try:
            corners = order_corners(np.float32(manual[path.name])) if path.name in manual else find_card(image)
            card = warp_card(image, corners)
        except ValueError:
            failed.append(path.name)
            continue
        name = f"{labels[path.name]}_{i:03d}" if path.name in labels else f"{i:03d}"
        names.append(f"{name}\t{path.name}")
        cv2.imwrite(str(args.dst / f"{name}.png"), card)
        tile = cv2.resize(card, (150, 210))
        cv2.putText(tile, name, (20, 200), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 0, 255), 2)
        tiles.append(tile)
    count = len(tiles)
    (args.dst / "_dosyalar.txt").write_text("\n".join(names), encoding="utf-8")
    while len(tiles) % 10:
        tiles.append(np.zeros_like(tiles[0]))
    cv2.imwrite(str(args.dst / "_ozet.jpg"), np.vstack([np.hstack(tiles[i:i + 10]) for i in range(0, len(tiles), 10)]))
    print(f"{count} kırpıldı, bulunamayan: {failed}")


if __name__ == "__main__":
    main()
