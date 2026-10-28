"""Store screenshots for 1.2, Turkish and English, from the capture-v12.mjs captures.

    python scripts/store-shots/compose-v12.py <captures folder>

The captures folder holds <lang>-phone/ and <lang>-ipad/ (see capture-v12.mjs).
Output: store-assets/v1.2/<lang>/<device>/NN-name.png plus a preview sheet per device.
Same look as compose.py: caption on felt above the app screen, no device frame.
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import compose as c  # noqa: E402  background, caption layout and contact sheet

OUT = c.REPO / "store-assets" / "v1.2"
BRANDS = {"tr": "AMERİKANO", "en": "AMERIKANO"}
CAPTIONS = {
    "tr": [
        ("01-home", "Üç oyun, tek masa", "Amerikano, Klasik Rummy ve Contract Rummy"),
        ("02-table", "Kartlar elinde, hamle sende", "Küt aç, seri diz, elini bitir"),
        ("03-lesson", "Oynayarak öğren", "12 kısa dersle bütün kurallar"),
        ("04-online", "Büyük masalarda yarış", "Kazanana özel çuha ve rozet"),
        ("05-victory", "Her zafer bir kutlama", "Coin'leri topla, zirveye çık"),
        ("06-store", "Masanı kendine göre süsle", "Kart arkaları ve masa çuhaları"),
    ],
    "en": [
        ("01-home", "Three games, one table", "Amerikano, Classic Rummy and Contract Rummy"),
        ("02-table", "Your cards, your move", "Meld sets, build runs, go out"),
        ("03-lesson", "Learn by playing", "12 short lessons cover every rule"),
        ("04-online", "Play the big tables", "Winners earn an exclusive felt and badge"),
        ("05-victory", "Every win, celebrated", "Collect coins, climb the rankings"),
        ("06-store", "Make the table yours", "Card backs and table felts"),
    ],
}


def main(captures: Path) -> None:
    for lang, captions in CAPTIONS.items():
        c.BRAND = BRANDS[lang]
        targets = [(folder, size, "phone", size[0], 0.0) for folder, size in c.PHONE_SIZES.items()]
        # iPad type follows a phone-like width so the caption keeps the phone proportions.
        # The tablet capture is a little taller than its panel; crop evenly so the hand at the bottom stays.
        targets.append(("ipad-13", c.IPAD_SIZE, "ipad", 1400, 0.5))
        for folder, size, group, unit, anchor in targets:
            out = OUT / lang / folder
            out.mkdir(parents=True, exist_ok=True)
            paths = []
            for name, title, note in captions:
                source = Image.open(captures / f"{lang}-{group}" / f"{name}.png").convert("RGB")
                c.compose(title, note, size, source, anchor, unit).save(out / f"{name}.png", "PNG", optimize=True)
                paths.append(out / f"{name}.png")
            c.contact_sheet(paths, OUT / lang / f"{folder}-preview.png")
            print("wrote", out.relative_to(c.REPO))


if __name__ == "__main__":
    main(Path(sys.argv[1]))
