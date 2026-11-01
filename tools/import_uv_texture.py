"""Puts a painted UV texture into the game, with the gaps between its faces filled in.

The gaps between the faces of a UV layout are never shown directly, but when a model is
small on screen the graphics card blends neighbouring pixels, and a white gap then shows
up as pale seams along the model's edges. This fills every gap pixel with the colour of
the nearest painted face. The painted faces themselves are left exactly as they are.

Usage:
  python3 tools/import_uv_texture.py <painted.png> <layout.json> <out.png>
e.g.
  python3 tools/import_uv_texture.py art/cheese-wedge/cheese-wedge-painted.png \\
      art/cheese-wedge/layout.json src/assets/textures/cheese-wedge.png
"""

import json
import sys

import numpy as np
from PIL import Image, ImageDraw

PADDING = 32  # pixels of gap to fill around each face (at the painting's size)


def main(painted_path, layout_path, out_path):
    painted = Image.open(painted_path).convert("RGB")
    layout = json.loads(open(layout_path).read())
    scale = painted.width / layout["size"]

    # Which pixels belong to a face, from the layout's outlines at the painting's size.
    mask_img = Image.new("L", painted.size, 0)
    draw = ImageDraw.Draw(mask_img)
    for island in layout["islands"]:
        draw.polygon([(x * scale, y * scale) for x, y in island["outline"]], fill=255)
    inside = np.array(mask_img) > 0
    colour = np.array(painted)

    # Grow the faces outward one pixel at a time, copying the colour from the face.
    for _ in range(PADDING):
        grown = inside.copy()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            src = np.roll(np.roll(inside, dy, axis=0), dx, axis=1)
            take = src & ~grown
            shifted = np.roll(np.roll(colour, dy, axis=0), dx, axis=1)
            colour[take] = shifted[take]
            grown |= take
        inside = grown

    Image.fromarray(colour).save(out_path, optimize=True)
    print(f"wrote {out_path} ({painted.width} x {painted.height}, gaps filled {PADDING} px out from each face)")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    main(*sys.argv[1:])
