"""Sentetik eğitim verisi: destelerdeki kartları masaya dizip YOLO etiketleriyle kaydeder.

Kullanım: uv run python generate.py --train 8000 --val 800
Her kartın iki köşesi (sol üst ve 180° dönük sağ alt) ayrı nesnedir. Üstüne
başka kart gelip köşesi büyük ölçüde kapanan değerler etiketlenmez.
"""
from __future__ import annotations

import argparse
import math
import random
import shutil
from multiprocessing import Pool
from pathlib import Path

import cv2
import numpy as np

from cards import CARD_SIZE, CLASSES, Card, load_deck

HERE = Path(__file__).parent
DECKS = HERE / "data" / "decks"
BACKGROUNDS = HERE / "data" / "backgrounds"
BACKS = HERE.parents[1] / "assets" / "cards" / "back.png"
OUT = HERE / "data" / "synth"
SIZE = 640
MIN_VISIBLE = 0.8

_decks: list[list[Card]] = []
_backgrounds: list[Path] = []
_back: np.ndarray | None = None


def _init():
    global _decks, _backgrounds, _back
    _decks = [deck for folder in sorted(DECKS.iterdir()) if folder.is_dir() and (deck := load_deck(folder))]
    _backgrounds = [p for p in BACKGROUNDS.glob("*") if p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}] if BACKGROUNDS.exists() else []
    if BACKS.exists():
        back = cv2.imread(str(BACKS), cv2.IMREAD_UNCHANGED)
        _back = cv2.resize(back, CARD_SIZE, interpolation=cv2.INTER_AREA)


# ---------------------------------------------------------------- arka planlar

def procedural_background(rng: random.Random) -> np.ndarray:
    kind = rng.choice(["felt", "wood", "solid", "cloth", "gradient"])
    base = np.array([rng.randint(0, 255) for _ in range(3)], np.float32)
    if kind == "felt":
        base = np.array(rng.choice([(40, 100, 30), (90, 60, 20), (30, 30, 120), (60, 60, 60), (20, 70, 20)]), np.float32)
    img = np.ones((SIZE, SIZE, 3), np.float32) * base
    if kind in {"felt", "solid"}:
        noise = cv2.GaussianBlur(np.random.randn(SIZE, SIZE).astype(np.float32), (0, 0), rng.uniform(0.5, 3)) * rng.uniform(4, 18)
        img += noise[..., None]
    elif kind == "wood":
        tone = np.array(rng.choice([(40, 80, 140), (30, 60, 100), (70, 120, 170), (20, 40, 70)]), np.float32)
        y = np.linspace(0, rng.uniform(8, 30), SIZE)
        warp = cv2.GaussianBlur(np.random.randn(SIZE, SIZE).astype(np.float32), (0, 0), 12) * 25
        grain = np.sin(y[:, None] + warp + np.random.randn(SIZE, SIZE) * 0.15) * rng.uniform(10, 30)
        img = np.ones((SIZE, SIZE, 3), np.float32) * tone + grain[..., None]
        if rng.random() < 0.5:
            img = img.transpose(1, 0, 2).copy()
    elif kind == "cloth":
        c2 = np.array([rng.randint(0, 255) for _ in range(3)], np.float32)
        step = rng.randint(12, 60)
        yy, xx = np.mgrid[0:SIZE, 0:SIZE]
        pattern = ((xx // step + yy // step) % 2) if rng.random() < 0.5 else ((xx // step) % 2)
        img = np.where(pattern[..., None] == 1, base, c2).astype(np.float32)
        img += np.random.randn(SIZE, SIZE, 1).astype(np.float32) * 6
    else:
        c2 = np.array([rng.randint(0, 255) for _ in range(3)], np.float32)
        t = np.linspace(0, 1, SIZE)[:, None, None]
        img = base * (1 - t) + c2 * t
        img = np.repeat(img, SIZE, axis=1)
    return np.clip(img, 0, 255).astype(np.uint8)


def background(rng: random.Random) -> np.ndarray:
    if _backgrounds and rng.random() < 0.6:
        img = cv2.imread(str(rng.choice(_backgrounds)))
        if img is not None:
            h, w = img.shape[:2]
            side = min(h, w)
            crop = rng.uniform(0.5, 1.0) * side
            x, y = rng.uniform(0, w - crop), rng.uniform(0, h - crop)
            return cv2.resize(img[int(y):int(y + crop), int(x):int(x + crop)], (SIZE, SIZE))
    return procedural_background(rng)


# ---------------------------------------------------------------- yerleşim

def card_transform(cx: float, cy: float, scale: float, angle: float) -> np.ndarray:
    """Kart koordinatlarından sahne koordinatlarına 3x3 afin dönüşüm."""
    w, h = CARD_SIZE
    a = math.radians(angle)
    rot = np.array([[math.cos(a), -math.sin(a)], [math.sin(a), math.cos(a)]]) * scale
    m = np.eye(3)
    m[:2, :2] = rot
    m[:2, 2] = np.array([cx, cy]) - rot @ np.array([w / 2, h / 2])
    return m


def layout(rng: random.Random, n: int) -> list[np.ndarray]:
    w, h = CARD_SIZE
    style = rng.choices(["row", "fan", "scatter", "grid", "rows"], [4, 3, 2, 1, 2])[0]
    width = rng.uniform(55, 190)
    scale = width / w
    base_angle = rng.uniform(-180, 180) if rng.random() < 0.3 else rng.uniform(-25, 25)
    out = []
    if style in {"row", "rows"}:
        lines = 1 if style == "row" else rng.randint(2, 3)
        per = math.ceil(n / lines)
        step = width * rng.uniform(0.22, 0.65)
        line_gap = h * scale * rng.uniform(0.35, 1.1)
        a = math.radians(base_angle)
        dx, dy = np.array([math.cos(a), math.sin(a)]), np.array([-math.sin(a), math.cos(a)])
        start = np.array([SIZE / 2, SIZE / 2]) - dx * step * (per - 1) / 2 - dy * line_gap * (lines - 1) / 2
        for i in range(n):
            line, col = divmod(i, per)
            pos = start + dx * step * col + dy * line_gap * line + np.random.randn(2) * width * 0.04
            out.append(card_transform(*pos, scale, base_angle + rng.gauss(0, 3)))
    elif style == "fan":
        spread = rng.uniform(4, 12)
        radius = h * scale * rng.uniform(0.9, 1.6)
        pivot = np.array([SIZE / 2 + rng.uniform(-60, 60), SIZE / 2 + radius * 0.6])
        for i in range(n):
            ang = base_angle + (i - (n - 1) / 2) * spread
            a = math.radians(ang)
            pos = pivot + np.array([math.sin(a), -math.cos(a)]) * radius
            out.append(card_transform(*pos, scale, ang))
    elif style == "grid":
        cols = math.ceil(math.sqrt(n * 1.4))
        gap = width * rng.uniform(1.05, 1.4)
        rows_gap = h * scale * rng.uniform(1.02, 1.3)
        for i in range(n):
            r, c = divmod(i, cols)
            out.append(card_transform(SIZE / 2 + (c - (cols - 1) / 2) * gap, SIZE / 2 + (r - n / cols / 2 + 0.5) * rows_gap, scale, base_angle + rng.gauss(0, 4)))
    else:
        for _ in range(n):
            out.append(card_transform(rng.uniform(0.1, 0.9) * SIZE, rng.uniform(0.1, 0.9) * SIZE, scale * rng.uniform(0.9, 1.1), rng.uniform(-180, 180)))
    # Bütün yerleşimi kadraja sığacak şekilde biraz kaydır.
    shift = np.eye(3)
    shift[:2, 2] = [rng.uniform(-60, 60), rng.uniform(-60, 60)]
    return [shift @ m for m in out]


def perspective(rng: random.Random) -> np.ndarray:
    """Telefonu eğik tutmayı taklit eden rastgele perspektif."""
    k = rng.uniform(0, 0.18)
    src = np.float32([[0, 0], [SIZE, 0], [SIZE, SIZE], [0, SIZE]])
    jitter = lambda: rng.uniform(-k, k) * SIZE
    dst = np.float32([[jitter(), jitter()], [SIZE + jitter(), jitter()], [SIZE + jitter(), SIZE + jitter()], [jitter(), SIZE + jitter()]])
    return cv2.getPerspectiveTransform(src, dst)


# ---------------------------------------------------------------- görünüm

def shade_card(img: np.ndarray, rng: random.Random) -> np.ndarray:
    """Kart yüzeyine hafif renk tonu ve ışık eğimi."""
    out = img.astype(np.float32)
    tint = np.array([rng.uniform(0.85, 1.05) for _ in range(3)], np.float32)
    out[..., :3] *= tint
    h, w = img.shape[:2]
    gx, gy = rng.uniform(-0.25, 0.25), rng.uniform(-0.25, 0.25)
    grad = 1 + gx * np.linspace(-1, 1, w)[None, :] + gy * np.linspace(-1, 1, h)[:, None]
    out[..., :3] *= grad[..., None]
    return np.clip(out, 0, 255).astype(np.uint8)


def photometric(img: np.ndarray, rng: random.Random) -> np.ndarray:
    out = img.astype(np.float32)
    # Gölge: sahnenin bir kısmını karart.
    if rng.random() < 0.4:
        mask = np.zeros((SIZE, SIZE), np.float32)
        pts = np.int32([[rng.randint(-100, SIZE + 100), rng.randint(-100, SIZE + 100)] for _ in range(rng.randint(3, 6))])
        cv2.fillPoly(mask, [cv2.convexHull(pts)], 1)
        mask = cv2.GaussianBlur(mask, (0, 0), rng.uniform(10, 50))
        out *= (1 - mask * rng.uniform(0.2, 0.6))[..., None]
    # Parlama: lamba yansıması.
    if rng.random() < 0.25:
        yy, xx = np.mgrid[0:SIZE, 0:SIZE]
        cx, cy, r = rng.uniform(0, SIZE), rng.uniform(0, SIZE), rng.uniform(40, 200)
        glare = np.exp(-((xx - cx) ** 2 + (yy - cy) ** 2) / (2 * r * r)) * rng.uniform(40, 140)
        out += glare[..., None]
    # Işık rengi, parlaklık, kontrast.
    out *= np.array([rng.uniform(0.8, 1.15) for _ in range(3)], np.float32)
    out = (out - 128) * rng.uniform(0.7, 1.3) + 128 + rng.uniform(-40, 30)
    out = np.clip(out, 0, 255).astype(np.uint8)
    if rng.random() < 0.4:
        out = cv2.GaussianBlur(out, (0, 0), rng.uniform(0.3, 1.6))
    if rng.random() < 0.15:
        k = rng.randint(3, 9)
        kernel = np.zeros((k, k), np.float32)
        kernel[k // 2, :] = 1 / k
        rot = cv2.getRotationMatrix2D((k / 2, k / 2), rng.uniform(0, 180), 1)
        out = cv2.filter2D(out, -1, cv2.warpAffine(kernel, rot, (k, k)))
    if rng.random() < 0.5:
        out = np.clip(out + np.random.randn(*out.shape) * rng.uniform(2, 10), 0, 255).astype(np.uint8)
    if rng.random() < 0.7:
        ok, enc = cv2.imencode(".jpg", out, [cv2.IMWRITE_JPEG_QUALITY, rng.randint(35, 95)])
        out = cv2.imdecode(enc, cv2.IMREAD_COLOR)
    return out


# ---------------------------------------------------------------- sahne

def corner_polys(card: Card) -> list[np.ndarray]:
    w, h = CARD_SIZE
    x0, y0, x1, y1 = card.corner
    tl = np.float32([[x0, y0], [x1, y0], [x1, y1], [x0, y1]])
    br = np.float32([[w - x1, h - y1], [w - x0, h - y1], [w - x0, h - y0], [w - x1, h - y0]])
    return [tl, br]


def make_scene(seed: int) -> tuple[np.ndarray, list[tuple[int, float, float, float, float]]]:
    rng = random.Random(seed)
    np.random.seed(seed % (2 ** 32))
    deck = rng.choice(_decks)
    scene = background(rng).astype(np.float32)
    n = rng.randint(1, 15)
    transforms = layout(rng, n)
    persp = perspective(rng)
    ids = np.zeros((SIZE, SIZE), np.int32)  # her pikselde en üstteki kartın numarası
    placed: list[tuple[Card | None, np.ndarray]] = []
    w, h = CARD_SIZE
    for i, m in enumerate(transforms, start=1):
        full = persp @ m
        if _back is not None and rng.random() < 0.06:
            card, face = None, _back
        else:
            card = rng.choice(deck)
            face = card.image
        face = shade_card(face, rng)
        warped = cv2.warpPerspective(face, full, (SIZE, SIZE), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))
        alpha = warped[..., 3:4].astype(np.float32) / 255
        # Kartın altına yumuşak gölge.
        if rng.random() < 0.7:
            shadow = cv2.GaussianBlur(alpha[..., 0], (0, 0), rng.uniform(1.5, 4))
            off = np.float32([[1, 0, rng.uniform(1, 5)], [0, 1, rng.uniform(1, 6)]])
            shadow = cv2.warpAffine(shadow, off, (SIZE, SIZE))
            scene *= (1 - shadow * rng.uniform(0.2, 0.45))[..., None]
        scene = scene * (1 - alpha) + warped[..., :3].astype(np.float32) * alpha
        ids[alpha[..., 0] > 0.5] = i
        placed.append((card, full))

    labels = []
    for i, (card, full) in enumerate(placed, start=1):
        if card is None:
            continue
        for poly in corner_polys(card):
            pts = cv2.perspectiveTransform(poly[None], full)[0]
            mask = np.zeros((SIZE, SIZE), np.uint8)
            cv2.fillPoly(mask, [np.int32(np.round(pts))], 1)
            area = mask.sum()
            if area < 30:
                continue
            visible = (mask.astype(bool) & (ids == i)).sum() / area
            x0, y0 = pts.min(0)
            x1, y1 = pts.max(0)
            inside = max(0, min(x1, SIZE) - max(x0, 0)) * max(0, min(y1, SIZE) - max(y0, 0)) / max(1e-6, (x1 - x0) * (y1 - y0))
            if visible < MIN_VISIBLE or inside < 0.9:
                continue
            x0, y0, x1, y1 = max(0, x0), max(0, y0), min(SIZE, x1), min(SIZE, y1)
            labels.append((card.cls, (x0 + x1) / 2 / SIZE, (y0 + y1) / 2 / SIZE, (x1 - x0) / SIZE, (y1 - y0) / SIZE))
    return photometric(np.clip(scene, 0, 255).astype(np.uint8), rng), labels


def _write(job: tuple[str, int]):
    split, seed = job
    img, labels = make_scene(seed)
    name = f"{split}_{seed:07d}"
    cv2.imwrite(str(OUT / "images" / split / f"{name}.jpg"), img, [cv2.IMWRITE_JPEG_QUALITY, 92])
    (OUT / "labels" / split / f"{name}.txt").write_text("".join(f"{c} {x:.6f} {y:.6f} {w:.6f} {h:.6f}\n" for c, x, y, w, h in labels))
    return len(labels)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--train", type=int, default=8000)
    parser.add_argument("--val", type=int, default=800)
    parser.add_argument("--workers", type=int, default=8)
    args = parser.parse_args()
    if OUT.exists():
        shutil.rmtree(OUT)
    for split in ("train", "val"):
        (OUT / "images" / split).mkdir(parents=True)
        (OUT / "labels" / split).mkdir(parents=True)
    jobs = [("train", i) for i in range(args.train)] + [("val", 10_000_000 - 1 - i) for i in range(args.val)]
    with Pool(args.workers, initializer=_init) as pool:
        total = sum(pool.imap_unordered(_write, jobs, chunksize=32))
    names = "\n".join(f"  {i}: '{name}'" for i, name in enumerate(CLASSES))
    (OUT / "data.yaml").write_text(f"path: {OUT.as_posix()}\ntrain: images/train\nval: images/val\nnames:\n{names}\n")
    print(f"{len(jobs)} görüntü, {total} etiketli köşe -> {OUT}")


if __name__ == "__main__":
    main()
