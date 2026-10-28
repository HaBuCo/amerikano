# Enlarges the suit under each card's corner rank, so overlapped cards in a
# crowded hand stay easy to tell apart. The new corner suit is the deck's own
# large pip (taken from the 2 of that suit) scaled down, so it stays sharp.
#
#   python scripts/enlarge-corner-suits.py
#
# Needs Pillow. Safe to run twice: cards whose corner suit is already large are skipped.
from pathlib import Path

from PIL import Image

CARDS = Path(__file__).resolve().parent.parent / 'assets' / 'cards'
SUITS = ['clubs', 'diamonds', 'hearts', 'spades']
RANKS = ['ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king']
# The index column: the rank sits above y=54, pips and face frames start at x=42.
COLUMN = (3, 56, 41, 108)
SUIT_TOP = 58
SUIT_WIDTH = 38


def dark(pixel):
    return pixel[3] > 0 and sum(pixel[:3]) < 690


def bbox(image, box):
    pixels = image.load()
    points = [(x, y) for y in range(box[1], box[3]) for x in range(box[0], box[2]) if dark(pixels[x, y])]
    xs = [x for x, _ in points]
    ys = [y for _, y in points]
    return (min(xs), min(ys), max(xs) + 1, max(ys) + 1)


def pip(suit):
    two = Image.open(CARDS / f'2-{suit}.png').convert('RGBA')
    shape = two.crop(bbox(two, (90, 20, 210, 150)))
    height = round(shape.height * SUIT_WIDTH / shape.width)
    return shape.resize((SUIT_WIDTH, height), Image.LANCZOS)


def enlarge_corner(image, glyph):
    """Replaces the top-left corner suit; the caller rotates the card for the other corner."""
    background = image.getpixel((25, 112))
    image.paste(background, COLUMN)
    left = COLUMN[2] - SUIT_WIDTH
    image.alpha_composite(glyph, (left, SUIT_TOP))


def main():
    for suit in SUITS:
        glyph = pip(suit)
        for rank in RANKS:
            path = CARDS / f'{rank}-{suit}.png'
            card = Image.open(path).convert('RGBA')
            current = bbox(card, (0, 56, 42, 100))
            if current[2] - current[0] > 32:
                print(f'{path.name}: already enlarged')
                continue
            enlarge_corner(card, glyph)
            card = card.rotate(180)
            enlarge_corner(card, glyph)
            card.rotate(180).save(path, optimize=True)
            print(f'{path.name}: corner suits enlarged')


if __name__ == '__main__':
    main()
