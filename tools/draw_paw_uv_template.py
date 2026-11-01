"""Draws the painting templates and the starting texture for Gunny's paw, from
art/gunny-paw/layout.json (written by tools/blender/build_gunny_paws.py).

  art/gunny-paw/gunny-paw-uv-template.png  outlines, a faint wireframe and labels on a
      transparent background: the top layer in Procreate, for finding your way around
  art/gunny-paw/gunny-paw-uv-base.png      the paw's colours as they are now (pink skin
      fading into dark fur at the wrist) on the pieces, transparent around them: the bottom
      layer, to paint over and to clip your paint layers to
  src/assets/textures/gunny-paw.png        the texture the game uses: those colours with the
      gaps between pieces filled (only written if missing, or with --force)
  art/gunny-paw/gunny-paw.png              copy of the game's texture, next to the OBJ

Usage: python3 tools/draw_paw_uv_template.py [--force]
(`npm run art:gunny-paws` builds the paw and its layout first, then runs this.)
"""

import json
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
from import_uv_texture import fill_gaps  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / "art" / "gunny-paw"
TEXTURE = ROOT / "src" / "assets" / "textures" / "gunny-paw.png"
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
INK = (60, 40, 15, 255)
HALO = (255, 255, 255, 255)  # outline round the labels, so they read on dark fur too
OUTLINE = (40, 120, 200, 255)
WIRE = (40, 120, 200, 70)


def font(size, bold=False):
    try:
        return ImageFont.truetype(BOLD if bold else FONT, round(size))
    except OSError:
        return ImageFont.load_default(round(size))


def triangles(layout):
    """Every face of the layout split into triangles, with its corners' colours."""
    for face, colours in zip(layout["islands"], layout["colours"]):
        pts = face["outline"]
        for i in range(1, len(pts) - 1):
            yield (pts[0], pts[i], pts[i + 1]), (colours[0], colours[i], colours[i + 1])


def base_colours(layout):
    """Each face filled with its corners' colours, blended across it; transparent around."""
    size = layout["size"]
    rgba = np.zeros((size, size, 4), np.float32)
    for ((x0, y0), (x1, y1), (x2, y2)), colours in triangles(layout):
        left, right = int(max(0, min(x0, x1, x2) - 1)), int(min(size - 1, max(x0, x1, x2) + 1))
        top, bottom = int(max(0, min(y0, y1, y2) - 1)), int(min(size - 1, max(y0, y1, y2) + 1))
        ys, xs = np.mgrid[top:bottom + 1, left:right + 1] + 0.5
        det = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
        if abs(det) < 1e-9:
            continue
        a = ((y1 - y2) * (xs - x2) + (x2 - x1) * (ys - y2)) / det
        b = ((y2 - y0) * (xs - x2) + (x0 - x2) * (ys - y2)) / det
        c = 1 - a - b
        # A little over each edge, so neighbouring faces leave no hairline cracks.
        inside = (a >= -0.02) & (b >= -0.02) & (c >= -0.02)
        col = np.array(colours, np.float32)
        weights = np.clip(np.stack([a, b, c], -1), 0, None)
        weights /= np.maximum(weights.sum(-1, keepdims=True), 1e-6)
        rgb = weights @ col
        region = rgba[top:bottom + 1, left:right + 1]
        region[inside, :3] = rgb[inside]
        region[inside, 3] = 255
    return Image.fromarray(rgba.round().astype(np.uint8), "RGBA")


def template(layout):
    """Outlines of the pieces, a faint grid of the model's faces, and labels."""
    size = layout["size"]
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Edges used by one face only are the outlines of the pieces.
    count = {}
    for face in layout["islands"]:
        pts = [tuple(round(c, 1) for c in p) for p in face["outline"]]
        for a, b in zip(pts, pts[1:] + pts[:1]):
            key = (a, b) if a < b else (b, a)
            count[key] = count.get(key, 0) + 1
    for (a, b), n in count.items():
        draw.line([a, b], fill=WIRE if n > 1 else OUTLINE, width=1 if n > 1 else 5)

    for label in layout["labels"]:
        x, y = label["at"]
        title, note = font(46, bold=True), font(24)
        tw, nw = draw.textlength(label["title"], font=title), draw.textlength(label["note"], font=note)
        draw.text((x - tw / 2, y - 50), label["title"], font=title, fill=INK, stroke_width=4, stroke_fill=HALO)
        draw.text((x - nw / 2, y + 6), label["note"], font=note, fill=INK, stroke_width=3, stroke_fill=HALO)
    for tip in layout["fingers"]:
        x, y = tip["at"]
        draw.ellipse([x - 9, y - 9, x + 9, y + 9], fill=HALO)
        draw.ellipse([x - 6, y - 6, x + 6, y + 6], fill=INK)
        draw.text((x + 12, y - 16), tip["label"], font=font(28, bold=True), fill=INK, stroke_width=3, stroke_fill=HALO)

    legend = [
        ("gunny-paw.png", font(40, bold=True)),
        (f"{size} x {size}", font(26)),
        ("Gunny's right paw:", font(24)),
        ("the fist on the gun's grip.", font(24)),
        ("Keep this layer on top,", font(24)),
        ("hide it before exporting.", font(24)),
        ("Paint inside the outlines:", font(24)),
        ("the gaps fill in by themselves.", font(24)),
        ("The dark end of each piece", font(24)),
        ("is the furry forearm.", font(24)),
    ]
    width = max(draw.textlength(t, font=f) for t, f in legend)
    height = sum(f.size + 10 for _, f in legend)
    x, y = free_spot(layout, width + 40, height + 40)
    for text, face in legend:
        draw.text((x + 20, y + 20), text, font=face, fill=INK)
        y += face.size + 10
    return img


def free_spot(layout, width, height):
    """A top-left corner where a box of this size covers no piece (top right preferred)."""
    size = layout["size"]
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    for face in layout["islands"]:
        draw.polygon([tuple(p) for p in face["outline"]], fill=255, outline=255, width=24)
    used = np.array(mask) > 0
    step = 16
    for y in range(0, int(size - height), step):
        for x in range(int(size - width), -1, -step):
            if not used[y:y + int(height), x:x + int(width)].any():
                return x, y
    return size - width, 0  # nowhere free: over the pieces in the top right


def main():
    layout = json.loads((ART / "layout.json").read_text())
    base = base_colours(layout)
    base.save(ART / "gunny-paw-uv-base.png", optimize=True)
    template(layout).save(ART / "gunny-paw-uv-template.png", optimize=True)
    print("wrote art/gunny-paw/gunny-paw-uv-base.png and gunny-paw-uv-template.png "
          f"({layout['size']} x {layout['size']})")

    if TEXTURE.exists() and "--force" not in sys.argv:
        print("skip  src/assets/textures/gunny-paw.png (exists; --force overwrites, careful: replaces real art)")
    else:
        rgb = np.array(base.convert("RGB"))
        Image.fromarray(fill_gaps(rgb, layout)).save(TEXTURE, optimize=True)
        print("wrote src/assets/textures/gunny-paw.png (the paw's current colours)")
    shutil.copy(TEXTURE, ART / "gunny-paw.png")


if __name__ == "__main__":
    main()
