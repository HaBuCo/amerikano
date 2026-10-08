"""English App Store / Google Play images for Amerikano.

Inputs are the English web captures in store-assets/en/raw-phone and raw-ipad
(see capture.mjs). Outputs go to store-assets/en/<device>/ plus the Play
feature graphic. The look follows the original Turkish phone screenshots.

    python scripts/store-shots/compose.py
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

REPO = Path(__file__).resolve().parents[2]
EN = REPO / "store-assets" / "en"
CARDS = REPO / "assets" / "cards"

FELT = (18, 61, 43)
FELT_DEEP = (8, 28, 20)
FELT_GLOW = (32, 92, 64)
CREAM = (248, 241, 223)
GOLD = (217, 164, 65)
MUTED = (158, 179, 166)

FONT_SERIF = Path(r"C:\Windows\Fonts\georgiab.ttf")
FONT_SANS = Path(r"C:\Windows\Fonts\segoeui.ttf")
BRAND = "AMERIKANO"

PHONE_SHOTS = [
    ("p01-home", "01-home", "Play solo or online", "The classic Amerikano table", 0.0),
    ("p02-setup", "02-setup", "Set up your own table", "Opponents, pace and game length", 0.0),
    ("p03-round-intro", "03-new-round", "Every round, a new contract", "12 rounds, 12 different goals", 0.35),
    ("p04-table", "04-table", "Your cards, your move", "The table is ready", 0.0),
    ("p05-melds", "05-melds", "Meld sets and runs", "Sets, runs and jokers", 0.0),
    ("p06-score", "06-score", "Round over, scores are clear", "On to the next round", 0.0),
]

IPAD_SHOTS = [
    ("i01-score", "01-score", "Round over, scores are clear", "Lowest total after 12 rounds wins"),
    ("i02-home", "02-home", "Play solo or online", "The classic Amerikano table"),
    ("i03-setup", "03-setup", "Choose pace, level and length", "Set up the table your way"),
    ("i04-table", "04-table", "Meet the contract, empty your hand", "Sets, runs and jokers"),
    ("i05-tutorial", "05-academy", "A two-minute guide before you play", "Learn as you go"),
    ("i06-rules", "06-rules", "Fewest points after 12 rounds wins", "Every rule in one place"),
    ("i07-settings", "07-settings", "Sound, pace and privacy in one place", "Make the game your own"),
]

PHONE_SIZES = {
    "ios-6.9": (1320, 2868),
    "ios-6.7": (1290, 2796),
    "ios-6.3": (1206, 2622),
    "android": (1080, 1920),
}
IPAD_SIZE = (2064, 2752)


def background(size: tuple[int, int]) -> Image.Image:
    w, h = size
    yy = np.linspace(0, 1, h, dtype=np.float32)[:, None]
    xx = np.linspace(0, 1, w, dtype=np.float32)[None, :]
    radial = np.sqrt((xx - 0.52) ** 2 + ((yy - 0.18) * 0.72) ** 2)
    radial = np.clip(radial / 0.78, 0, 1)
    radial = radial * radial * (3 - 2 * radial)
    mix = np.array(FELT, np.float32) * (1 - yy) + np.array(FELT_DEEP, np.float32) * yy
    color = np.broadcast_to(mix[:, None, :], (h, w, 3)).copy()
    fade = radial[..., None]
    glow = np.array(FELT_GLOW, np.float32)
    color = color * fade + glow * (1 - fade) * 0.42 + color * (1 - 0.42 * (1 - fade))
    img = Image.fromarray(np.clip(color, 0, 255).astype(np.uint8), "RGB")
    noise = np.random.default_rng(7).integers(0, 16, (h, w), dtype=np.uint8)
    return Image.blend(img, Image.fromarray(np.stack([noise] * 3, axis=2), "RGB"), 0.03)


def fit_cover(im: Image.Image, box: tuple[int, int], anchor: float) -> Image.Image:
    tw, th = box
    scale = max(tw / im.width, th / im.height)
    nw, nh = max(tw, round(im.width * scale)), max(th, round(im.height * scale))
    fitted = im.resize((nw, nh), Image.Resampling.LANCZOS)
    left = (nw - tw) // 2
    top = max(0, min(round((nh - th) * anchor), nh - th))
    return fitted.crop((left, top, left + tw, top + th))


def draw_tracked(draw, text, font, fill, cx, y, tracking):
    widths = [font.getlength(ch) for ch in text]
    x = cx - (sum(widths) + tracking * (len(text) - 1)) / 2
    for ch, width in zip(text, widths):
        draw.text((x, y), ch, font=font, fill=fill)
        x += width + tracking


def wrap(text, font, max_width):
    lines, current = [], ""
    for word in text.split():
        trial = f"{current} {word}".strip()
        if font.getlength(trial) <= max_width or not current:
            current = trial
        else:
            lines.append(current)
            current = word
    return lines + [current]


def compose(title: str, note: str, size: tuple[int, int], source: Image.Image, anchor: float, unit: int) -> Image.Image:
    """`unit` is the width the type scale is based on (phone width, or a phone-like width for iPad)."""
    w, h = size
    canvas = background(size).convert("RGBA")
    draw = ImageDraw.Draw(canvas)
    title_font = ImageFont.truetype(str(FONT_SERIF), int(unit * 0.054))
    note_font = ImageFont.truetype(str(FONT_SANS), int(unit * 0.027))
    brand_font = ImageFont.truetype(str(FONT_SERIF), int(unit * 0.024))
    cx = w / 2

    brand_y = int(h * 0.026)
    draw_tracked(draw, BRAND, brand_font, GOLD, cx, brand_y, unit * 0.013)
    title_y = brand_y + int(unit * 0.046)
    line_gap = int(unit * 0.064)
    lines = wrap(title, title_font, w * 0.88)
    for i, line in enumerate(lines):
        draw.text((cx - title_font.getlength(line) / 2, title_y + i * line_gap), line, font=title_font, fill=CREAM)
    note_y = title_y + len(lines) * line_gap + int(unit * 0.004)
    draw.text((cx - note_font.getlength(note) / 2, note_y), note, font=note_font, fill=MUTED)
    line_y = note_y + int(unit * 0.042)
    line_h = max(3, int(unit * 0.004))
    draw.rounded_rectangle((cx - unit * 0.039, line_y, cx + unit * 0.039, line_y + line_h), radius=2, fill=GOLD)

    side, radius, bottom = int(w * 0.052), int(unit * 0.042), int(h * 0.026)
    top = int(line_y + line_h + unit * 0.038)
    panel = (w - side * 2, h - top - bottom)
    ui = fit_cover(source, panel, anchor).convert("RGBA")
    mask = Image.new("L", panel, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, panel[0] - 1, panel[1] - 1), radius=radius, fill=255)
    ui.putalpha(mask)

    shadow = Image.new("RGBA", (panel[0] + 80, panel[1] + 80), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((20, 28, panel[0] + 60, panel[1] + 68), radius=radius + 8, fill=(0, 0, 0, 150))
    canvas.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(26)), (side - 40, top - 34))
    canvas.alpha_composite(ui, (side, top))
    stroke = Image.new("RGBA", panel, (0, 0, 0, 0))
    ImageDraw.Draw(stroke).rounded_rectangle((1, 1, panel[0] - 2, panel[1] - 2), radius=radius,
                                             outline=(*GOLD, 78), width=max(2, int(unit * 0.0028)))
    canvas.alpha_composite(stroke, (side, top))
    return canvas.convert("RGB")


def contact_sheet(paths: list[Path], dest: Path) -> None:
    thumbs = [Image.open(p).convert("RGB") for p in paths]
    thumbs = [im.resize((360, int(im.height * 360 / im.width)), Image.Resampling.LANCZOS) for im in thumbs]
    gap = 24
    sheet = Image.new("RGB", (360 * len(thumbs) + gap * (len(thumbs) + 1), max(t.height for t in thumbs) + gap * 2), FELT_DEEP)
    for i, im in enumerate(thumbs):
        sheet.paste(im, (gap + i * (360 + gap), gap))
    sheet.save(dest, "PNG", optimize=True)


def feature_graphic() -> None:
    """Google Play feature graphic, 1024 x 500, no alpha — English copy of the Turkish layout."""
    import sys
    sys.path.insert(0, str(REPO / "store"))
    import build_feature as tr  # the Turkish script owns the card fan and background

    scale = 2
    W, H = 1024 * scale, 500 * scale
    canvas = tr.background((W, H)).convert("RGBA")
    draw = ImageDraw.Draw(canvas)
    left, brand_y = 120, 278
    tr.draw_tracked_left(draw, BRAND, ImageFont.truetype(str(FONT_SERIF), 44), GOLD, left, brand_y, 16)
    title_y = brand_y + 58
    draw.text((left, title_y), "Classic card game", font=ImageFont.truetype(str(FONT_SERIF), 92), fill=CREAM)
    note_y = title_y + 114
    draw.text((left, note_y), "Solo, online or with friends", font=ImageFont.truetype(str(FONT_SANS), 34), fill=MUTED)
    draw.rounded_rectangle((left, note_y + 58, left + 88, note_y + 64), radius=3, fill=GOLD)
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse((1280, 160, 2040, 900), fill=(42, 110, 76, 90))
    canvas.alpha_composite(glow.filter(ImageFilter.GaussianBlur(48)))
    for path, center, angle in [(CARDS / "queen-hearts.png", (1458, 518), 15), (CARDS / "king-spades.png", (1628, 488), 2), (CARDS / "ace-spades.png", (1796, 508), -13)]:
        tr.paste_rotated(canvas, tr.with_shadow(tr.round_card(path, (300, 420), 24)), center, angle)
    out = EN / "android" / "feature-graphic.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").resize((1024, 500), Image.Resampling.LANCZOS).save(out, "PNG", optimize=True)
    print("wrote", out.relative_to(REPO))


def main() -> None:
    for folder, size in PHONE_SIZES.items():
        out = EN / folder
        out.mkdir(parents=True, exist_ok=True)
        paths = []
        for raw, name, title, note, anchor in PHONE_SHOTS:
            image = compose(title, note, size, Image.open(EN / "raw-phone" / f"{raw}.png").convert("RGB"), anchor, size[0])
            image.save(out / f"{name}.png", "PNG", optimize=True)
            paths.append(out / f"{name}.png")
        contact_sheet(paths, EN / f"{folder}-preview.png")
        print("wrote", folder)

    out = EN / "ipad-13"
    out.mkdir(parents=True, exist_ok=True)
    paths = []
    for raw, name, title, note in IPAD_SHOTS:
        # Type is scaled to a phone-like width so the caption keeps the phone proportions.
        image = compose(title, note, IPAD_SIZE, Image.open(EN / "raw-ipad" / f"{raw}.png").convert("RGB"), 0.0, 1400)
        image.save(out / f"{name}.png", "PNG", optimize=True)
        paths.append(out / f"{name}.png")
    contact_sheet(paths, EN / "ipad-13-preview.png")
    print("wrote ipad-13")
    feature_graphic()


if __name__ == "__main__":
    main()
