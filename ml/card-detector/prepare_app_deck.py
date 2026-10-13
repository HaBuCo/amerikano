"""Uygulamadaki CC0 desteyi (assets/cards) eğitim destesi biçimine kopyalar."""
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "assets" / "cards"
TARGET = Path(__file__).parent / "data" / "decks" / "app"
RANKS = {"ace": "A", "king": "K", "queen": "Q", "jack": "J"}

TARGET.mkdir(parents=True, exist_ok=True)
for path in SOURCE.glob("*.png"):
    if path.stem == "back":
        continue
    if path.stem == "joker":
        shutil.copy(path, TARGET / "joker.png")
        continue
    rank, suit = path.stem.split("-")
    shutil.copy(path, TARGET / f"{RANKS.get(rank, rank)}_{suit}.png")
print(f"{len(list(TARGET.iterdir()))} kart -> {TARGET}")
