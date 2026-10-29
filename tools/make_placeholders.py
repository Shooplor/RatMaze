"""Generates the placeholder textures in public/textures/.

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

OUT = Path(__file__).resolve().parent.parent / "public" / "textures"
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
    heights = [draw.textbbox((0, 0), text, font=font)[3] for text, font in lines]
    y = (img.height - sum(heights) - 10 * (len(lines) - 1)) // 2
    for (text, font), h in zip(lines, heights):
        w = draw.textlength(text, font=font)
        x = (img.width - w) // 2
        draw.rectangle([x - 8, y - 4, x + w + 8, y + h + 6], fill=(0, 0, 0))
        draw.text((x, y), text, font=font, fill=(235, 220, 170))
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


TEXTURES = {
    "wall.png": lambda: (bricks(512, (92, 74, 58), (38, 30, 24), rows=8, cols=4, seed=1), "maze wall, tiles"),
    "floor.png": lambda: (slabs(512, (70, 66, 58), (30, 28, 24), n=4, seed=2), "maze floor, tiles"),
    "ceiling.png": lambda: (planks(512, (54, 44, 36), (22, 18, 14), n=6, seed=3), "maze ceiling, tiles"),
}


def main():
    force = "--force" in sys.argv
    OUT.mkdir(parents=True, exist_ok=True)
    for name, make in TEXTURES.items():
        path = OUT / name
        if path.exists() and not force:
            print(f"skip   {name} (exists)")
            continue
        img, note = make()
        label(img, name, note)
        img.save(path)
        print(f"wrote  {name}")


if __name__ == "__main__":
    main()
