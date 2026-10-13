"""App Store creative assets: product page header and search results, Turkish and English.

    python scripts/store-shots/creative.py

Header 3840 x 1646 (21:9) and search results 3840 x 2560 (3:2), PNG without alpha.
Apple publishes no pixel safe areas, so text and the focal artwork stay centred.
Search results use phone captures from store-assets/<lang>/raw-phone (see capture.mjs).
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import compose as c  # noqa: E402  shared palette, background and helpers

sys.path.insert(0, str(c.REPO / "store"))
import build_feature as cards  # noqa: E402  card fan helpers

OUT = c.REPO / "store-assets" / "app-store-creative"

COPY = {
    "tr": {
        "brand": "AMERİKANO",
        "header": "12 el. Tek masa.",
        "search_title": "Klasik kart oyunu",
        "search_note": "Tek, çevrim içi veya arkadaşlarınla",
    },
    "en": {
        "brand": "AMERIKANO",
        "header": "12 rounds. One table.",
        "search_title": "Classic contract rummy",
        "search_note": "Solo, online or with friends",
    },
}


def centered(draw, text, font, y, width, fill):
    draw.text(((width - font.getlength(text)) / 2, y), text, font=font, fill=fill)


def card_fan(canvas: Image.Image, center: tuple[int, int], card_w: int) -> None:
    card_h = int(card_w * 1.4)
    radius = int(card_w * 0.08)
    spread = int(card_w * 0.57)
    fan = [("queen-hearts.png", -spread, int(card_w * 0.1), 15),
           ("king-spades.png", 0, 0, 2),
           ("ace-spades.png", spread, int(card_w * 0.067), -13)]
    for name, dx, dy, angle in fan:
        card = cards.round_card(c.CARDS / name, (card_w, card_h), radius)
        card = cards.with_shadow(card, blur=int(card_w * 0.07), offset=(int(card_w * 0.03), int(card_w * 0.06)))
        cards.paste_rotated(canvas, card, (center[0] + dx, center[1] + dy), angle)


def header(lang: str) -> Image.Image:
    w, h = 3840, 1646
    copy = COPY[lang]
    canvas = c.background((w, h)).convert("RGBA")
    glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse((w / 2 - 900, h * 0.30, w / 2 + 900, h * 1.05), fill=(42, 110, 76, 110))
    canvas.alpha_composite(glow.filter(ImageFilter.GaussianBlur(120)))
    draw = ImageDraw.Draw(canvas)

    brand_font = ImageFont.truetype(str(c.FONT_SERIF), 64)
    c.draw_tracked(draw, copy["brand"], brand_font, c.GOLD, w / 2, int(h * 0.12), 30)
    title_font = ImageFont.truetype(str(c.FONT_SERIF), 150)
    centered(draw, copy["header"], title_font, int(h * 0.19), w, c.CREAM)
    line_y = int(h * 0.335)
    draw.rounded_rectangle((w / 2 - 70, line_y, w / 2 + 70, line_y + 8), radius=4, fill=c.GOLD)

    card_fan(canvas, (w // 2, int(h * 0.66)), 470)
    return canvas.convert("RGB")


def phone_panel(source: Image.Image, size: tuple[int, int]) -> Image.Image:
    pw, ph = size
    radius = int(pw * 0.09)
    pad = 90
    panel = Image.new("RGBA", (pw + pad * 2, ph + pad * 2), (0, 0, 0, 0))
    shadow = Image.new("RGBA", panel.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((pad, pad + 30, pad + pw, pad + ph + 30), radius=radius, fill=(0, 0, 0, 160))
    panel.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(40)))
    ui = c.fit_cover(source, (pw, ph), 0.0).convert("RGBA")
    mask = Image.new("L", (pw, ph), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, pw - 1, ph - 1), radius=radius, fill=255)
    ui.putalpha(mask)
    panel.alpha_composite(ui, (pad, pad))
    ImageDraw.Draw(panel).rounded_rectangle((pad + 1, pad + 1, pad + pw - 2, pad + ph - 2), radius=radius,
                                            outline=(*c.GOLD, 90), width=6)
    return panel


def search_results(lang: str) -> Image.Image:
    w, h = 3840, 2560
    copy = COPY[lang]
    canvas = c.background((w, h)).convert("RGBA")
    draw = ImageDraw.Draw(canvas)
    c.draw_tracked(draw, copy["brand"], ImageFont.truetype(str(c.FONT_SERIF), 70), c.GOLD, w / 2, 150, 32)
    centered(draw, copy["search_title"], ImageFont.truetype(str(c.FONT_SERIF), 170), 260, w, c.CREAM)
    centered(draw, copy["search_note"], ImageFont.truetype(str(c.FONT_SANS), 86), 480, w, c.MUTED)
    draw.rounded_rectangle((w / 2 - 80, 625, w / 2 + 80, 634), radius=4, fill=c.GOLD)

    raw = c.REPO / "store-assets" / lang / "raw-phone"
    shots = ["p04-table", "p05-melds", "p06-score"]
    ph = 1700
    pw = int(ph * 1080 / 2340)
    gap = 150
    total = pw * 3 + gap * 2
    top = 740
    for i, name in enumerate(shots):
        panel = phone_panel(Image.open(raw / f"{name}.png").convert("RGB"), (pw, ph))
        x = (w - total) // 2 + i * (pw + gap) - 90
        canvas.alpha_composite(panel, (x, top - 90))
    return canvas.convert("RGB")


def main() -> None:
    for lang in COPY:
        out = OUT / lang
        out.mkdir(parents=True, exist_ok=True)
        header(lang).save(out / "header-3840x1646.png", "PNG", optimize=True)
        search_results(lang).save(out / "search-results-3840x2560.png", "PNG", optimize=True)
        print("wrote", out.relative_to(c.REPO))


if __name__ == "__main__":
    main()
