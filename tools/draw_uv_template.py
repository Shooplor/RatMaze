"""Draws the cheese wedge's UV template, faces layer and placeholder texture from
art/cheese-wedge/layout.json.

  art/cheese-wedge/cheese-wedge-uv-template.png   outlines, labels and numbered edges on a
      transparent background: the top layer in Procreate, for finding your way around
  art/cheese-wedge/cheese-wedge-uv-faces.png      just the faces, filled grey, transparent
      everywhere else: the bottom layer, to clip your paint layers to
  src/assets/textures/cheese-wedge.png            placeholder texture the game uses until
      a painting replaces it (only written if missing, or with --force)
  art/cheese-wedge/cheese-wedge.png               copy of the game's texture, next to the OBJ

Usage: python3 tools/draw_uv_template.py [--size 2048] [--force]
(`npm run art:cheese-wedge` exports the layout first, then runs this.)
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
DEFAULT_SIZE = 2048  # the size Procreate's 3D painting uses, so flat and 3D work match

# One colour per shared edge, so matching edges are easy to spot.
EDGE_COLOURS = {
    1: (230, 80, 40), 2: (200, 40, 120), 3: (40, 110, 230), 4: (30, 160, 80), 5: (120, 80, 220),
    6: (0, 150, 160), 7: (220, 150, 0), 8: (150, 90, 40), 9: (90, 90, 90),
}
INK = (60, 40, 15, 255)


def font(size, bold=False):
    try:
        return ImageFont.truetype(BOLD if bold else FONT, round(size))
    except OSError:
        return ImageFont.load_default(round(size))


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


def scaled(layout, k):
    """The layout's islands with every point multiplied by k (layout.json is in 1024 pixels)."""
    pt = lambda p: (p[0] * k, p[1] * k)
    islands = []
    for island in layout["islands"]:
        islands.append({
            **island,
            "outline": [pt(p) for p in island["outline"]],
            "edges": [{"id": e["id"], "points": [pt(p) for p in e["points"]]} for e in island["edges"]],
            "labelAt": pt(island["labelAt"]) if "labelAt" in island else None,
            "tip": pt(island["tip"]) if "tip" in island else None,
        })
    legend = {key: v * k for key, v in layout["legend"].items()}
    return islands, legend


def draw_guides(img, layout, k):
    """Outlines, numbered edges, labels and the legend, at k times the layout's size."""
    islands, legend = scaled(layout, k)
    draw = ImageDraw.Draw(img)
    for island in islands:
        cx, cy = centroid(island["outline"])
        for edge in island["edges"]:
            colour = EDGE_COLOURS[edge["id"]] + (255,)
            draw.line(edge["points"], fill=colour, width=round(7 * k), joint="curve")
        for edge in island["edges"]:
            # Number tag just inside the face, at the middle of its edge.
            mx, my = point_along(edge["points"], 0.5)
            dx, dy = cx - mx, cy - my
            d = max(1, (dx * dx + dy * dy) ** 0.5)
            tx, ty = mx + dx / d * 30 * k, my + dy / d * 30 * k
            r = 17 * k
            draw.ellipse([tx - r, ty - r, tx + r, ty + r], fill=EDGE_COLOURS[edge["id"]] + (255,))
            centred_text(draw, (tx, ty - 13 * k), str(edge["id"]), font(22 * k, bold=True), (255, 255, 255, 255))
        lx, ly = island["labelAt"] or (cx, cy)
        centred_text(draw, (lx, ly - 22 * k), island["label"], font(34 * k, bold=True), INK)
        centred_text(draw, (lx, ly + 16 * k), island["note"], font(20 * k), INK)
        if island["tip"]:
            tx, ty = island["tip"]
            draw.ellipse([tx - 6 * k, ty - 6 * k, tx + 6 * k, ty + 6 * k], fill=INK)

    size = img.width
    x, y = legend["x"], legend["y"]
    lines = [
        ("cheese-wedge.png", font(30 * k, bold=True)),
        (f"{size} x {size}", font(22 * k)),
        ("", font(12 * k)),
        ("Edges with the same number", font(19 * k)),
        ("meet on the model.", font(19 * k)),
        ("The dot marks the tip of the wedge.", font(19 * k)),
        ("", font(8 * k)),
        ("Keep this on the top layer and", font(19 * k)),
        ("hide it before exporting.", font(19 * k)),
        ("Paint inside the outlines: the", font(19 * k)),
        ("gaps get filled in automatically.", font(19 * k)),
    ]
    for text, face in lines:
        draw.text((x, y), text, font=face, fill=INK)
        y += face.size + 6 * k


def faces_layer(layout, k):
    """Just the faces, filled grey: a base layer to clip paint layers to in Procreate."""
    islands, _ = scaled(layout, k)
    size = round(layout["size"] * k)
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    for island in islands:
        draw.polygon(island["outline"], fill=(205, 205, 205, 255))
    return img


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
    size = int(sys.argv[sys.argv.index("--size") + 1]) if "--size" in sys.argv else DEFAULT_SIZE
    k = size / layout["size"]

    template = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw_guides(template, layout, k)
    template.save(ART / "cheese-wedge-uv-template.png")
    faces_layer(layout, k).save(ART / "cheese-wedge-uv-faces.png")
    print(f"wrote art/cheese-wedge/cheese-wedge-uv-template.png and cheese-wedge-uv-faces.png ({size} x {size})")

    if TEXTURE.exists() and "--force" not in sys.argv:
        print("skip  src/assets/textures/cheese-wedge.png (exists; --force overwrites, careful: replaces real art)")
    else:
        texture = cheese_fill(layout["size"], layout)
        draw_guides(texture, layout, 1)
        texture.convert("RGB").save(TEXTURE)
        print("wrote src/assets/textures/cheese-wedge.png (placeholder)")
    shutil.copy(TEXTURE, ART / "cheese-wedge.png")


if __name__ == "__main__":
    main()
