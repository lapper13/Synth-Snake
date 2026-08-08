"""Generate home screen icons for Synth-Snake.

Run from the repo root:  python3 tools/make_icons.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

NOKIA_BLUE = (0, 90, 255)
WHITE = (255, 255, 255)

# A serpentine snake laid out on a 10x10 grid of cells.
SEGMENTS = [
    (2, 2), (3, 2), (4, 2), (5, 2), (6, 2), (7, 2),
    (7, 3), (7, 4),
    (6, 4), (5, 4), (4, 4), (3, 4), (2, 4),
    (2, 5), (2, 6),
    (3, 6), (4, 6), (5, 6), (6, 6), (7, 6),
]

GRID = 10
# Segments occupy rows 2..6, whose centre is 4.0. The grid centre is 4.5,
# so nudge everything down half a cell to sit optically centred.
Y_OFFSET = 0.5


def draw_icon(size: int, path: Path) -> None:
    img = Image.new("RGB", (size, size), NOKIA_BLUE)
    draw = ImageDraw.Draw(img)
    cell = size / GRID
    inset = cell * 0.10
    radius = max(1, int(cell * 0.22))

    for col, row in SEGMENTS:
        x0 = col * cell + inset
        y0 = (row + Y_OFFSET) * cell + inset
        x1 = x0 + cell - (inset * 2)
        y1 = y0 + cell - (inset * 2)
        draw.rounded_rectangle([x0, y0, x1, y1], radius=radius, fill=WHITE)

    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PNG")
    print(f"wrote {path} ({size}x{size})")


if __name__ == "__main__":
    icons = Path(__file__).resolve().parent.parent / "icons"
    draw_icon(192, icons / "icon-192.png")
    draw_icon(512, icons / "icon-512.png")
    # iOS uses this one for the home screen. It must be opaque; iOS does not
    # composite transparency and would render it on black.
    draw_icon(180, icons / "apple-touch-icon.png")
