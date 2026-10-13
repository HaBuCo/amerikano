"""Deste yükleme ve kart köşesindeki değer kutusunun bulunması.

Bir deste `data/decks/<deste>/` altında, her kart için düz (dik) kırpılmış bir
yüz görüntüsüdür. Dosya adı sınıfla başlar: `K_maca.png`, `10-kupa.jpg`,
`joker.png`, `joker_2.png` gibi. Sınıflar sadece değerdir; takım öğretilmez.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

CLASSES = ["joker", "A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"]
CARD_SIZE = (300, 420)  # genişlik, yükseklik; bütün desteler bu boyuta getirilir

_NAME = re.compile(r"^(joker|10|[2-9]|[AKQJ])(?=$|[^0-9a-z])", re.IGNORECASE)


@dataclass
class Card:
    cls: int
    image: np.ndarray  # BGRA, CARD_SIZE
    corner: tuple[int, int, int, int]  # sol üst değer kutusu (x0, y0, x1, y1)


def class_from_name(stem: str) -> int | None:
    match = _NAME.match(stem.strip())
    if not match:
        return None
    key = match.group(1)
    key = "joker" if key.lower() == "joker" else key.upper()
    return CLASSES.index(key)


def find_corner_box(image: np.ndarray, is_joker: bool) -> tuple[int, int, int, int]:
    """Sol üst köşedeki mürekkebi (değer + takım işareti) saran kutu.

    Kenar boşluğu ve yuvarlak köşe dışarıda bırakılır; arama alanı Joker'in dikey
    yazısı için daha uzundur. Köşeye bağlı en büyük mürekkep grubunu alırız ki
    ortadaki resimler kutuya karışmasın.
    """
    h, w = image.shape[:2]
    x1, y1 = int(w * (0.22 if is_joker else 0.2)), int(h * (0.47 if is_joker else 0.3))
    region = image[:y1, :x1]
    gray = cv2.cvtColor(region[:, :, :3], cv2.COLOR_BGR2GRAY)
    alpha = region[:, :, 3] if region.shape[2] == 4 else np.full(gray.shape, 255, np.uint8)
    # Kart zemini açık renktir; ondan belirgin biçimde koyu ya da renkli olan her şey mürekkep sayılır.
    hsv = cv2.cvtColor(region[:, :, :3], cv2.COLOR_BGR2HSV)
    ink = ((gray < 170) | (hsv[:, :, 1] > 90)) & (alpha > 200)
    margin_x, margin_y = int(w * 0.02), int(h * 0.015)
    ink[:margin_y, :] = False
    ink[:, :margin_x] = False
    ink = ink.astype(np.uint8)
    count, _, stats, _ = cv2.connectedComponentsWithStats(ink)
    comps = [(int(x), int(y), int(x + bw), int(y + bh)) for x, y, bw, bh, area in stats[1:] if area >= 12]
    # Değer: köşeye en yakın, sol kenara yaslı ilk grup ("10" gibi yan yana parçalar sonra eklenir).
    seeds = [c for c in comps if c[0] < w * 0.12 and c[3] - c[1] < y1 * 0.9]
    if not seeds:
        raise ValueError("köşede değer bulunamadı")
    x0, y0, bx1, by1 = min(seeds, key=lambda c: c[1])
    seed_h = by1 - y0
    used = {(x0, y0, bx1, by1)}
    changed = True
    while changed:
        changed = False
        for c in comps:
            if c in used:
                continue
            ch = c[3] - c[1]
            overlap = min(by1, c[3]) - max(y0, c[1])
            beside = overlap >= ch * 0.5 and c[0] - bx1 < w * 0.025 and ch <= seed_h * 1.6 and c[2] < w * 0.2
            # Joker'de harfler alt alta dizilir.
            below = is_joker and c[1] - by1 < h * 0.03 and x0 - 4 <= (c[0] + c[2]) / 2 <= bx1 + 4
            if beside or below:
                x0, y0, bx1, by1 = min(x0, c[0]), min(y0, c[1]), max(bx1, c[2]), max(by1, c[3])
                used.add(c)
                changed = True
    if not is_joker:
        # Takım işareti: değerin hemen altında, aynı sütunda duran ilk grup.
        width = bx1 - x0
        suits = [c for c in comps if c not in used and by1 - 2 <= c[1] < by1 + h * 0.08
                 and x0 - w * 0.02 <= (c[0] + c[2]) / 2 <= bx1 + w * 0.02 and c[2] - c[0] < width * 1.6 + 10]
        if suits:
            c = min(suits, key=lambda c: c[1])
            x0, y0, bx1, by1 = min(x0, c[0]), min(y0, c[1]), max(bx1, c[2]), max(by1, c[3])
    pad = 3
    return max(0, x0 - pad), max(0, y0 - pad), min(x1, bx1 + pad), min(y1, by1 + pad)


def load_deck(folder: Path) -> list[Card]:
    """Destede `deste.json` varsa değer kutusu oradan alınır (fotoğraftan kırpılan
    destelerde köşe her kartta aynı yerdedir ve otomatik bulma desenlere takılabilir):
    {"corner": [x0, y0, x1, y1], "joker_corner": [...]} — CARD_SIZE ölçeğinde."""
    config_path = folder / "deste.json"
    config = json.loads(config_path.read_text(encoding="utf-8")) if config_path.exists() else {}
    cards = []
    for path in sorted(folder.iterdir()):
        if path.suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp"}:
            continue
        cls = class_from_name(path.stem)
        if cls is None:
            continue
        image = cv2.imread(str(path), cv2.IMREAD_UNCHANGED)
        if image is None:
            continue
        if image.ndim == 2:
            image = cv2.cvtColor(image, cv2.COLOR_GRAY2BGRA)
        elif image.shape[2] == 3:
            image = cv2.cvtColor(image, cv2.COLOR_BGR2BGRA)
        image = cv2.resize(image, CARD_SIZE, interpolation=cv2.INTER_AREA)
        image = round_corners(image)
        is_joker = CLASSES[cls] == "joker"
        fixed = config.get("joker_corner" if is_joker else "corner")
        corner = tuple(fixed) if fixed else find_corner_box(image, is_joker)
        cards.append(Card(cls, image, corner))
    return cards


def round_corners(image: np.ndarray, radius: int = 14) -> np.ndarray:
    """Fotoğraftan kırpılan kartların köşelerindeki masa parçalarını sil."""
    h, w = image.shape[:2]
    mask = np.zeros((h, w), np.uint8)
    cv2.rectangle(mask, (radius, 0), (w - radius, h), 255, -1)
    cv2.rectangle(mask, (0, radius), (w, h - radius), 255, -1)
    for cx, cy in [(radius, radius), (w - radius - 1, radius), (radius, h - radius - 1), (w - radius - 1, h - radius - 1)]:
        cv2.circle(mask, (cx, cy), radius, 255, -1)
    out = image.copy()
    out[:, :, 3] = np.minimum(out[:, :, 3], mask)
    return out
