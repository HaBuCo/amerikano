"""Store marketing artwork for 1.2: App Store header and search results, Play feature graphic.

    python scripts/store-shots/marketing.py

Turkish and English. Pure artwork, no devices or screen captures (App Store review
objects to device frames that are not Apple's). Each design is HTML drawn by the
installed Chrome, then saved as RGB PNG without alpha:

    store-assets/marketing/<lang>/app-store-header-3840x1646.png
    store-assets/marketing/<lang>/app-store-search-3840x2560.png
    store-assets/marketing/<lang>/play-feature-1024x500.png
"""

from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path

from PIL import Image

REPO = Path(__file__).resolve().parents[2]
CARDS = REPO / "assets" / "cards"
OUT = REPO / "store-assets" / "marketing"
CHROME = next(p for p in [
    Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
    Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
] if p.exists())

COPY = {
    "tr": {
        "brand": "AMERİKANO",
        "title": "Üç oyun. Tek masa.",
        "games": "Amerikano · Klasik Rummy · Contract Rummy",
        "search_title": "Üç kart oyunu, tek uygulama",
        "search_note": "Botlarla, çevrim içi masalarda ya da arkadaşlarınla",
        "columns": [
            ("Amerikano", "12 el, her elde yeni bir görev"),
            ("Klasik Rummy", "40 puanla aç, ilk biten kazanır"),
            ("Contract Rummy", "7 kontrat ve May I? kuralı"),
        ],
        "feature_note": "Botlarla, çevrim içi ya da arkadaşlarınla",
    },
    "en": {
        "brand": "AMERIKANO",
        "title": "Three games. One table.",
        "games": "Amerikano · Classic Rummy · Contract Rummy",
        "search_title": "Three card games in one app",
        "search_note": "Play bots, online tables or your friends",
        "columns": [
            ("Amerikano", "12 deals, a new contract each time"),
            ("Classic Rummy", "Open with 40, first out wins"),
            ("Contract Rummy", "7 contracts and the May I? rule"),
        ],
        "feature_note": "Play bots, online tables or friends",
    },
}

CARD_FILES = {
    "As": "ace-spades", "Ah": "ace-hearts", "Ad": "ace-diamonds", "Ac": "ace-clubs", "JK": "joker",
    "Ks": "king-spades", "Kh": "king-hearts", "Kd": "king-diamonds", "Qd": "queen-diamonds", "Jd": "jack-diamonds",
    "Qc": "queen-clubs", "Jc": "jack-clubs",
}


def card_src(code: str) -> str:
    name = CARD_FILES.get(code) or f"{code[:-1]}-{ {'s': 'spades', 'h': 'hearts', 'd': 'diamonds', 'c': 'clubs'}[code[-1]] }"
    return (CARDS / f"{name}.png").as_uri()


STYLE = f"""
/* Installed Windows fonts by name: Chrome will not load font files from file:// pages. */
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
html, body {{ width: 100%; height: 100%; overflow: hidden; background: #0A2A1D; }}
.stage {{ position: relative; width: 100%; height: 100%; overflow: hidden;
  background: radial-gradient(ellipse 75% 85% at 50% 58%, #22744F 0%, #155138 38%, #0C3123 72%, #071D14 100%); }}
.rays {{ position: absolute; left: 50%; top: 62%; width: 0; height: 0; }}
.ray {{ position: absolute; left: -2.2vmax; top: -120vmax; width: 4.4vmax; height: 240vmax;
  background: linear-gradient(180deg, rgba(255,227,154,0) 8%, rgba(255,227,154,0.055) 36%, rgba(255,227,154,0) 50%, rgba(255,227,154,0.055) 64%, rgba(255,227,154,0) 92%); }}
.vignette {{ position: absolute; inset: 0; background: radial-gradient(ellipse 95% 95% at 50% 55%, rgba(0,0,0,0) 58%, rgba(0,0,0,0.42) 100%); }}
.glow {{ position: absolute; border-radius: 50%; background: radial-gradient(circle, rgba(246,213,126,0.30) 0%, rgba(217,164,65,0.10) 42%, rgba(217,164,65,0) 70%); }}
.card {{ position: absolute; aspect-ratio: 300 / 420; background: #fff; overflow: hidden; border: 0.2em solid #e4dac4;
  box-shadow: 0 1.6em 3.2em rgba(0,0,0,0.5), 0 0.3em 0.7em rgba(0,0,0,0.35); }}
.card img {{ width: 100%; height: 100%; display: block; }}
.brand {{ font-family: Georgia; font-weight: 700; color: #E2B351; letter-spacing: 0.42em; text-align: center; }}
.title {{ font-family: Georgia; font-weight: 700; color: #F8F1DF; text-align: center; text-shadow: 0 0.06em 0.22em rgba(0,0,0,0.45); }}
.note {{ font-family: 'Segoe UI'; font-weight: 400; color: #C8D7CD; text-align: center; }}
.rule {{ background: linear-gradient(90deg, #A87622, #F3CE6A, #A87622); border-radius: 99px; }}
.suit {{ position: absolute; font-family: Georgia; opacity: 0.07; color: #F8F1DF; }}
"""


def rays(count: int = 12) -> str:
    return '<div class="rays">' + ''.join(
        f'<div class="ray" style="transform: rotate({i * 180 / count}deg)"></div>' for i in range(count)) + '</div>'


def card(code: str, x: float, y: float, width: float, angle: float = 0, origin: str = "50% 50%") -> str:
    """A card whose centre sits at (x, y), in the unit the caller uses (px)."""
    height = width * 1.4
    return (f'<div class="card" style="left:{x - width / 2}px; top:{y - height / 2}px; width:{width}px; '
            f'border-radius:{width * 0.065}px; font-size:{width / 100}px; transform: rotate({angle}deg); '
            f'transform-origin:{origin}"><img src="{card_src(code)}"></div>')


def fan(codes: list[str], cx: float, cy: float, width: float, spread: float, lift: float) -> str:
    """Cards fanned from a pivot below their centres, like a hand held up."""
    n = len(codes)
    out = []
    for i, code in enumerate(codes):
        t = (i - (n - 1) / 2) / max(1, (n - 1) / 2)
        angle = t * spread
        x = cx + t * width * 0.62 * (n - 1) / 2
        y = cy + abs(t) ** 1.6 * lift
        out.append(card(code, x, y, width, angle))
    return ''.join(out)


def suits_backdrop(w: int, h: int, size: int) -> str:
    marks = [("♠", 0.07, 0.18), ("♥", 0.93, 0.22), ("♦", 0.12, 0.82), ("♣", 0.88, 0.8), ("♥", 0.28, 0.08), ("♠", 0.74, 0.1)]
    return ''.join(f'<div class="suit" style="left:{x * w - size / 2}px; top:{y * h - size / 2}px; font-size:{size}px">{s}</div>'
                   for s, x, y in marks)


def page(w: int, h: int, body: str) -> str:
    return f'<!doctype html><html><head><meta charset="utf-8"><style>{STYLE}</style></head><body><div class="stage">{body}</div></body></html>'


def header(lang: str) -> str:
    w, h, copy = 3840, 1646, COPY[lang]
    body = rays() + f'<div class="glow" style="left:{w / 2 - 1100}px; top:{h * 0.42}px; width:2200px; height:2200px"></div>'
    body += suits_backdrop(w, h, 260)
    # Sets either side, half off the edge: depth for wide screens, safe to crop on narrow ones.
    body += fan(["7s", "7h", "7d"], 380, h * 0.7, 330, 9, 30) + fan(["9c", "10c", "Jc"], w - 380, h * 0.7, 330, 9, 30)
    body += f'<div class="brand" style="position:absolute; left:0; right:0; top:{h * 0.09}px; font-size:68px">{copy["brand"]}</div>'
    body += f'<div class="title" style="position:absolute; left:0; right:0; top:{h * 0.16}px; font-size:170px">{copy["title"]}</div>'
    body += f'<div class="note" style="position:absolute; left:0; right:0; top:{h * 0.31}px; font-size:64px">{copy["games"]}</div>'
    body += f'<div class="rule" style="position:absolute; left:{w / 2 - 80}px; top:{h * 0.385}px; width:160px; height:9px"></div>'
    body += fan(["As", "Ah", "JK", "Ad", "Ac"], w / 2, h * 0.8, 430, 26, 120)
    return page(w, h, body + '<div class="vignette"></div>')


def search(lang: str) -> str:
    w, h, copy = 3840, 2560, COPY[lang]
    body = rays() + suits_backdrop(w, h, 300)
    body += f'<div class="brand" style="position:absolute; left:0; right:0; top:150px; font-size:74px">{copy["brand"]}</div>'
    body += f'<div class="title" style="position:absolute; left:0; right:0; top:260px; font-size:180px">{copy["search_title"]}</div>'
    body += f'<div class="note" style="position:absolute; left:0; right:0; top:500px; font-size:84px">{copy["search_note"]}</div>'
    body += f'<div class="rule" style="position:absolute; left:{w / 2 - 90}px; top:650px; width:180px; height:10px"></div>'
    # One typical hand per game, laid on the felt.
    hands = [
        [(["7s", "7h", "7d"], 0), (["4h", "5h", "6h"], 1)],
        [(["9c", "10c", "Jc", "Qc"], 0), (["Ks", "Kh", "Kd"], 1)],
        [(["As", "2s", "3s", "4s"], 0), (["Jd", "Qd", "Kd", "Ad"], 1)],
    ]
    column = w / 3
    for index, (groups, (name, rule)) in enumerate(zip(hands, copy["columns"])):
        cx = column * index + column / 2
        body += f'<div class="glow" style="left:{cx - 700}px; top:{1050}px; width:1400px; height:1400px; opacity:0.8"></div>'
        for codes, row in groups:
            cw = 300
            step = cw * 0.56
            start = cx - step * (len(codes) - 1) / 2
            y = 1180 + row * 470
            body += ''.join(card(code, start + i * step, y, cw, (i - (len(codes) - 1) / 2) * 3) for i, code in enumerate(codes))
        body += f'<div class="title" style="position:absolute; left:{column * index}px; width:{column}px; top:2030px; font-size:112px">{name}</div>'
        body += f'<div class="note" style="position:absolute; left:{column * index}px; width:{column}px; top:2190px; font-size:66px">{rule}</div>'
        if index:
            body += f'<div style="position:absolute; left:{column * index - 2}px; top:1000px; width:4px; height:1350px; background:linear-gradient(180deg, rgba(226,179,81,0), rgba(226,179,81,0.45), rgba(226,179,81,0))"></div>'
    return page(w, h, body + '<div class="vignette"></div>')


def feature(lang: str) -> str:
    w, h, copy = 1024, 500, COPY[lang]
    body = rays(10) + f'<div class="glow" style="left:{w * 0.72 - 380}px; top:{h * 0.5 - 380}px; width:760px; height:760px"></div>'
    # The text flows in one column, so a two-line title pushes the rest down instead of overlapping it.
    body += (f'<div style="position:absolute; left:72px; width:440px; top:50%; transform:translateY(-50%); display:flex; flex-direction:column; align-items:flex-start; gap:14px">'
             f'<div class="brand" style="font-size:22px; text-align:left">{copy["brand"]}</div>'
             f'<div class="title" style="font-size:50px; line-height:1.1; text-align:left">{copy["title"].replace(". ", ".<br>")}</div>'
             f'<div class="rule" style="width:60px; height:4px; margin:4px 0"></div>'
             f'<div class="note" style="font-size:19px; text-align:left">{copy["games"]}</div>'
             f'<div class="note" style="font-size:17px; text-align:left; color:#9EB3A6; margin-top:-8px">{copy["feature_note"]}</div>'
             '</div>')
    body += fan(["As", "Ah", "JK", "Ad", "Ac"], w * 0.74, h * 0.6, 128, 26, 36)
    return page(w, h, body + '<div class="vignette"></div>')


def render(html: str, size: tuple[int, int], out: Path) -> None:
    with tempfile.TemporaryDirectory() as folder:
        source = Path(folder) / "art.html"
        shot = Path(folder) / "art.png"
        source.write_text(html, encoding="utf-8")
        subprocess.run([str(CHROME), "--headless=new", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files",
                        "--force-device-scale-factor=1", f"--window-size={size[0]},{size[1]}", "--virtual-time-budget=4000",
                        f"--screenshot={shot}", source.as_uri()], check=True, capture_output=True)
        image = Image.open(shot)
        if image.size != size:
            raise RuntimeError(f"{out.name}: Chrome drew {image.size}, expected {size}")
        # The stores want opaque images.
        image.convert("RGB").save(out, "PNG", optimize=True)


def main() -> None:
    for lang in COPY:
        folder = OUT / lang
        folder.mkdir(parents=True, exist_ok=True)
        render(header(lang), (3840, 1646), folder / "app-store-header-3840x1646.png")
        render(search(lang), (3840, 2560), folder / "app-store-search-3840x2560.png")
        render(feature(lang), (1024, 500), folder / "play-feature-1024x500.png")
        print("wrote", folder.relative_to(REPO))


if __name__ == "__main__":
    main()
