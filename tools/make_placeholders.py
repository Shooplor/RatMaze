"""Generates the placeholder art in src/assets/ (textures/ and ui/).

Each placeholder shows its file name and size, so it's clear which drawing replaces it.
Save a drawing over the file (same name, same size) and it shows up in the game.
Tiling textures wrap seamlessly so the placeholders don't show seams in the maze.

Run:  python3 tools/make_placeholders.py            (only creates missing files)
      python3 tools/make_placeholders.py --force    (overwrites, careful: replaces real art)
"""

import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ASSETS = Path(__file__).resolve().parent.parent / "src" / "assets"
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"


def vary(color, rng, amount):
    """Same colour, a little lighter or darker."""
    delta = rng.randint(-amount, amount)
    return tuple(max(0, min(255, c + delta)) for c in color)


def font(size):
    try:
        return ImageFont.truetype(FONT, size)
    except OSError:  # DejaVu isn't on every machine
        return ImageFont.load_default(size)


def label(img, name, note):
    draw = ImageDraw.Draw(img)
    big = font(img.width // 14)
    small = font(img.width // 24)
    lines = [(name, big), (f"{img.width} x {img.height}", small), (note, small), ("PLACEHOLDER", small)]
    heights = [draw.textbbox((0, 0), text, font=face)[3] for text, face in lines]
    y = (img.height - sum(heights) - 10 * (len(lines) - 1)) // 2
    for (text, face), h in zip(lines, heights):
        w = draw.textlength(text, font=face)
        x = (img.width - w) // 2
        draw.rectangle([x - 8, y - 4, x + w + 8, y + h + 6], fill=(0, 0, 0))
        draw.text((x, y), text, font=face, fill=(235, 220, 170))
        y += h + 10


def bricks(size, base, mortar, rows, cols, seed):
    """Staggered brick rows. Bricks that cross the right edge wrap to the left so it tiles."""
    rng = random.Random(seed)
    img = Image.new("RGB", (size, size), mortar)
    draw = ImageDraw.Draw(img)
    bh = size // rows
    bw = size // cols
    gap = max(2, size // 128)
    for r in range(rows):
        offset = (bw // 2) if r % 2 else 0
        for c in range(cols):
            x0 = c * bw + offset
            color = vary(base, rng, 14)
            for shift in (0, -size):  # the second copy covers the wrap-around part
                draw.rectangle([x0 + shift + gap, r * bh + gap, x0 + shift + bw - gap, (r + 1) * bh - gap], fill=color)
    return img


def slabs(size, base, line, n, seed):
    rng = random.Random(seed)
    img = Image.new("RGB", (size, size), line)
    draw = ImageDraw.Draw(img)
    step = size // n
    gap = max(2, size // 160)
    for i in range(n):
        for j in range(n):
            draw.rectangle([i * step + gap, j * step + gap, (i + 1) * step - gap, (j + 1) * step - gap], fill=vary(base, rng, 10))
    return img


def planks(size, base, line, n, seed):
    rng = random.Random(seed)
    img = Image.new("RGB", (size, size), line)
    draw = ImageDraw.Draw(img)
    step = size // n
    gap = max(2, size // 200)
    for i in range(n):
        draw.rectangle([0, i * step + gap, size, (i + 1) * step - gap], fill=vary(base, rng, 10))
    return img


def door(size, seed):
    """Vertical planks with two iron bands and a ring handle."""
    rng = random.Random(seed)
    img = Image.new("RGB", (size, size), (26, 18, 12))
    draw = ImageDraw.Draw(img)
    n = 5
    step = size // n
    for i in range(n):
        draw.rectangle([i * step + 3, 0, (i + 1) * step - 3, size], fill=vary((104, 70, 40), rng, 12))
    for y in (size // 5, size * 4 // 5):
        draw.rectangle([0, y - 14, size, y + 14], fill=(46, 44, 42))
        for x in range(step // 2, size, step):
            draw.ellipse([x - 6, y - 6, x + 6, y + 6], fill=(80, 76, 70))
    cx, cy = size * 3 // 4, size // 2 + 40
    draw.ellipse([cx - 26, cy - 26, cx + 26, cy + 26], outline=(150, 140, 120), width=8)
    return img


def cheese(size, seed):
    """Yellow cheese with holes. Holes crossing an edge wrap to the other side so it tiles."""
    rng = random.Random(seed)
    img = Image.new("RGB", (size, size), (240, 192, 70))
    draw = ImageDraw.Draw(img)
    for _ in range(14):
        x, y = rng.randrange(size), rng.randrange(size)
        r = rng.randint(size // 40, size // 12)
        for ox in (-size, 0, size):
            for oy in (-size, 0, size):
                draw.ellipse([x + ox - r, y + oy - r, x + ox + r, y + oy + r], fill=(196, 140, 38))
                draw.ellipse([x + ox - r + r // 4, y + oy - r + r // 4, x + ox + r, y + oy + r], fill=(214, 160, 48))
    return img


def cheese_icon(size):
    """HUD icon: a cheese wedge on a transparent background. No label, it is shown small."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    s = size / 256
    top = [(28 * s, 120 * s), (228 * s, 70 * s), (228 * s, 120 * s)]
    front = [(28 * s, 120 * s), (228 * s, 120 * s), (228 * s, 200 * s), (28 * s, 200 * s)]
    draw.polygon(front, fill=(240, 192, 70, 255), outline=(90, 60, 10, 255))
    draw.polygon(top, fill=(255, 220, 120, 255), outline=(90, 60, 10, 255))
    for x, y, r in ((70, 160, 14), (130, 175, 10), (180, 150, 16), (200, 185, 8)):
        draw.ellipse([(x - r) * s, (y - r) * s, (x + r) * s, (y + r) * s], fill=(196, 140, 38, 255))
    return img


# Path inside src/assets -> (image, note shown on it). A note of None means no label.
PLACEHOLDERS = {
    "textures/wall.png": lambda: (bricks(512, (92, 74, 58), (38, 30, 24), rows=8, cols=4, seed=1), "maze wall, tiles"),
    "textures/floor.png": lambda: (slabs(512, (70, 66, 58), (30, 28, 24), n=4, seed=2), "maze floor, tiles"),
    "textures/ceiling.png": lambda: (planks(512, (54, 44, 36), (22, 18, 14), n=6, seed=3), "maze ceiling, tiles"),
    "textures/door.png": lambda: (door(512, seed=4), "exit door"),
    "textures/cheese.png": lambda: (cheese(512, seed=5), "cheese & compass, tiles"),
    "ui/hud-cheese.png": lambda: (cheese_icon(256), None),
}


def main():
    force = "--force" in sys.argv
    for name, make in PLACEHOLDERS.items():
        path = ASSETS / name
        if path.exists() and not force:
            print(f"skip   {name} (exists)")
            continue
        img, note = make()
        if note:
            label(img, path.name, note)
        path.parent.mkdir(parents=True, exist_ok=True)
        img.save(path)
        print(f"wrote  {name}")


if __name__ == "__main__":
    main()
