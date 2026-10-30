"""Draws the cheese wedge's UV template and its placeholder texture from art/cheese-wedge/layout.json.

  art/cheese-wedge/cheese-wedge-uv-template.png   outlines, labels and numbered edges on a
      transparent background: put it on the top layer in Procreate and paint underneath
  src/assets/textures/cheese-wedge.png            placeholder texture the game uses until
      the real drawing replaces it (only written if missing, or with --force)
  art/cheese-wedge/cheese-wedge.png               copy of the texture, next to the OBJ

Run with `npm run art:cheese-wedge` (it exports the layout first).
"""

import json
import random
import shutil
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / "art" / "cheese-wedge"
TEXTURE = ROOT / "src" / "assets" / "textures" / "cheese-wedge.png"
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

# One colour per shared edge, so matching edges are easy to spot.
EDGE_COLOURS = {
    1: (230, 80, 40), 2: (200, 40, 120), 3: (40, 110, 230), 4: (30, 160, 80), 5: (120, 80, 220),
    6: (0, 150, 160), 7: (220, 150, 0), 8: (150, 90, 40), 9: (90, 90, 90),
}
INK = (60, 40, 15, 255)


def font(size, bold=False):
    try:
        return ImageFont.truetype(BOLD if bold else FONT, size)
    except OSError:
        return ImageFont.load_default(size)


def centroid(points):
    xs, ys = zip(*points)
    return sum(xs) / len(xs), sum(ys) / len(ys)


def point_along(points, share):
    """The point `share` of the way along a polyline."""
    lengths = [((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2) ** 0.5 for a, b in zip(points, points[1:])]
    target = sum(lengths) * share
    for (a, b), length in zip(zip(points, points[1:]), lengths):
        if target <= length:
            t = target / length if length else 0
            return a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
        target -= length
    return points[-1]


def centred_text(draw, xy, text, face, fill):
    w = draw.textlength(text, font=face)
    draw.text((xy[0] - w / 2, xy[1]), text, font=face, fill=fill)


def draw_guides(img, layout, labels=True):
    """Outlines, numbered edges, labels and the legend."""
    draw = ImageDraw.Draw(img)
    for island in layout["islands"]:
        cx, cy = centroid(island["outline"])
        for edge in island["edges"]:
            colour = EDGE_COLOURS[edge["id"]] + (255,)
            draw.line([tuple(p) for p in edge["points"]], fill=colour, width=7, joint="curve")
        for edge in island["edges"]:
            # Number tag just inside the face, at the middle of its edge.
            mx, my = point_along(edge["points"], 0.5)
            dx, dy = cx - mx, cy - my
            d = max(1, (dx * dx + dy * dy) ** 0.5)
            tx, ty = mx + dx / d * 30, my + dy / d * 30
            colour = EDGE_COLOURS[edge["id"]] + (255,)
            draw.ellipse([tx - 17, ty - 17, tx + 17, ty + 17], fill=colour)
            centred_text(draw, (tx, ty - 13), str(edge["id"]), font(22, bold=True), (255, 255, 255, 255))
        if labels:
            lx, ly = island.get("labelAt", (cx, cy))
            centred_text(draw, (lx, ly - 22), island["label"], font(34, bold=True), INK)
            centred_text(draw, (lx, ly + 16), island["note"], font(20), INK)
        if island.get("tip") and labels:
            tx, ty = island["tip"]
            draw.ellipse([tx - 6, ty - 6, tx + 6, ty + 6], fill=INK)

    legend = layout["legend"]
    x, y = legend["x"], legend["y"]
    lines = [
        ("cheese-wedge.png", font(30, bold=True)),
        ("1024 x 1024", font(22)),
        ("", font(12)),
        ("Paint each face inside its outline,", font(19)),
        ("and a little past it.", font(19)),
        ("Edges with the same number", font(19)),
        ("meet on the model.", font(19)),
        ("The dot marks the tip of the wedge.", font(19)),
        ("Keep this on the top layer, paint", font(19)),
        ("below it, hide it before exporting.", font(19)),
    ]
    for text, face in lines:
        draw.text((x, y), text, font=face, fill=INK)
        y += face.size + 6


def cheese_fill(size, layout, seed=7):
    """Placeholder paint: pale cheese with holes on the faces, a darker waxy rind."""
    rng = random.Random(seed)
    img = Image.new("RGBA", (size, size), (190, 140, 40, 255))
    for island in layout["islands"]:
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).polygon([tuple(p) for p in island["outline"]], fill=255)
        face = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        draw = ImageDraw.Draw(face)
        xs, ys = zip(*island["outline"])
        box = (min(xs) - 30, min(ys) - 30, max(xs) + 30, max(ys) + 30)
        if island["name"] == "rind":
            draw.rectangle(box, fill=(222, 156, 48, 255))
            for i in range(int(box[1]), int(box[3]), 14):
                draw.line([(box[0], i), (box[2], i)], fill=(210, 145, 40, 255), width=4)
        else:
            draw.rectangle(box, fill=(246, 206, 92, 255))
            for _ in range(10):
                r = rng.randint(14, 42)
                hx, hy = rng.uniform(box[0], box[2]), rng.uniform(box[1], box[3])
                draw.ellipse([hx - r, hy - r, hx + r, hy + r], fill=(214, 160, 52, 255))
                draw.ellipse([hx - r + r // 3, hy - r + r // 3, hx + r, hy + r], fill=(228, 178, 64, 255))
        img.paste(face, (0, 0), mask)
    return img


def main():
    layout = json.loads((ART / "layout.json").read_text())
    size = layout["size"]

    template = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw_guides(template, layout)
    template.save(ART / "cheese-wedge-uv-template.png")
    print("wrote art/cheese-wedge/cheese-wedge-uv-template.png")

    if TEXTURE.exists() and "--force" not in sys.argv:
        print("skip  src/assets/textures/cheese-wedge.png (exists; --force overwrites, careful: replaces real art)")
    else:
        texture = cheese_fill(size, layout)
        draw_guides(texture, layout)
        texture.convert("RGB").save(TEXTURE)
        print("wrote src/assets/textures/cheese-wedge.png (placeholder)")
    shutil.copy(TEXTURE, ART / "cheese-wedge.png")


if __name__ == "__main__":
    main()
