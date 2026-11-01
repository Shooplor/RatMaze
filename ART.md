# Art slots

Every texture in the game is a PNG in `src/assets/textures/`, and HUD icons are in
`src/assets/ui/`. Right now each one is a placeholder that shows its own file name and size.

**To put your drawing in the game:** export it from Procreate as PNG at the size listed,
save it over the placeholder with the same file name, and refresh the browser.

Draw at normal brightness. The maze is dark and the lighting darkens everything,
so a drawing that looks right on the iPad will look right in the game.

## Maze (step 1)

| File | Canvas | Where it appears | Notes |
|---|---|---|---|
| `wall.png` | 512 × 512 | Every wall face. One image = one wall panel, floor to ceiling, one corridor wide. | Must tile: the left edge continues from the right edge, the top from the bottom. |
| `floor.png` | 512 × 512 | The floor. One image = one corridor square. | Must tile on all four edges. |
| `ceiling.png` | 512 × 512 | The ceiling. One image = one corridor square. | Must tile on all four edges. |

## Cheese and the exit (step 2)

| File | Canvas | Where it appears | Notes |
|---|---|---|---|
| `door.png` | 512 × 512 | The exit door, floor to ceiling, one corridor wide. | Drawn as seen from the corridor. |
| `cheese.png` | 512 × 512 | The cheese compass arrow, the cheese wheel behind the exit, the cheese in the gun's jar and the crumbs from a splat. | Draw it as cheese surface (holes, texture) that tiles, not as one object. |
| `ui/hud-cheese.png` | 256 × 256 | The cheese icon next to your carried count, bottom right. | Transparent background. Shown at about 48 × 48. |

## The cheese wedge you collect

| File | Canvas | Where it appears |
|---|---|---|
| `cheese-wedge.png` | 1024 × 1024 or 2048 × 2048 | The floating cheese you suck up, and the cheese you shoot. **Painted** (your 3D painting from Procreate). |

This one is painted onto the model's layout (its UVs), not tiled: each face of the wedge
has its own area of the image. Everything you need is in `art/cheese-wedge/`.

**Painting it flat (recommended: every layer, opacity and effect works):**

1. Make a **2048 × 2048** canvas in Procreate.
2. Insert `cheese-wedge-uv-faces.png` (Actions → Add → Insert a file) and keep it as
   the bottom layer: it's the five faces filled grey.
3. Paint on layers above it, each set to **Clipping Mask** (tap the layer → Clipping
   Mask), so the paint stays inside the faces by itself. To carry on from the 3D painting,
   insert `cheese-wedge-painted.png` as one of those clipped layers.
4. Insert `cheese-wedge-uv-template.png` as the **top** layer to find your way around:
   edges with the same number meet on the model, and the dot marks the tip of the wedge.
5. Hide the template, then Actions → Share → **PNG**, and send it over. Paint inside the
   outlines; the gaps between faces get filled in when it's imported (below).

**Painting it in 3D:** import `cheese-wedge.obj` into Procreate (3D painting) and paint
straight onto the wedge. Then Actions → Share → **Share Textures**: Procreate gives you a
zip with a Colour, a Metallic and a Roughness image. The **Colour** one is the texture;
the others aren't used. It uses the same layout as the template, so either way works.

**Putting a painting in:** the original goes in `art/cheese-wedge/cheese-wedge-painted.png`,
and the game's copy is made from it with the gaps between faces filled in (so no pale
seams show when a wedge is far away):

    python3 tools/import_uv_texture.py art/cheese-wedge/cheese-wedge-painted.png \
        art/cheese-wedge/layout.json src/assets/textures/cheese-wedge.png

To finish a flat painting in 3D, the OBJ can be packed with the latest texture so
Procreate opens the wedge already painted.

If the model ever changes, `npm run art:cheese-wedge` writes a fresh OBJ, template and
faces layer (2048 × 2048 by default; `--size` changes it).

## Gunny's gun and paw

| File | What |
|---|---|
| Gun model | Gunny's scrap vacuum gun in first person. For now it is a placeholder built in code (`src/render/gunView.js`). Send the model as `.glb` if you can (`.fbx` or `.obj` also work, I'll convert it). I'll fit its size and position on screen and find the nozzle, where the whirlwind starts and shots come out. If it has a part that should spin while sucking, or a cheese jar that fills up, tell me which parts. |
| `models/gunny-paws.glb` | Gunny's right paw in first person: a fist on the gun's grip. Built in Blender by `tools/blender/build_gunny_paws.py` (`npm run art:gunny-paws`): a pink rat hand with knuckle bulges, long dark claws and the thumb folded over the fingers, fading into a short piece of dark furry forearm. Its surface is an even grid of four-sided faces, so a painted texture sits on it without stretching. When the real gun arrives, the paw gets re-posed to its grip. |

## Gunny's paw texture

| File | Canvas | Where it appears |
|---|---|---|
| `gunny-paw.png` | 2048 × 2048 | The skin of Gunny's paw (the claws and the tufts at the wrist keep their own colours). **Painted** on the paw's UV layout. For now it holds the paw's plain colours. |

Everything you need is in `art/gunny-paw/`. The layout has four pieces, each standing
upright with the fingers at the top and the forearm at the bottom:
- the back of the hand, with the knuckles and the backs of the fingers;
- the palm side, with the finger pads and the inside of the wrist;
- the thumb's nail side;
- the thumb pad.

In the game the fist sits at the bottom of the screen. The thumb's nail side shows most,
then the fingers and a little of the palm side.

**Painting it flat (recommended):**

1. Make a **2048 × 2048** canvas in Procreate.
2. Insert `gunny-paw-uv-base.png` (Actions → Add → Insert a file) as the bottom layer. It
   holds the paw's current colours on the pieces (pink skin darkening into fur toward the
   forearm) and is transparent around them. Paint over it, or on layers above it set to
   **Clipping Mask**, so the paint stays inside the pieces.
3. Insert `gunny-paw-uv-template.png` as the **top** layer to find your way around. It shows
   the outlines, a faint grid of the model's faces, and the names of the pieces and fingers.
4. Hide the template, then Actions → Share → **PNG**, and send it over. Paint inside the
   outlines; the gaps between pieces get filled in when it's imported (below).

**Painting it in 3D:** import `gunny-paw.obj` into Procreate and paint straight onto the
paw. Then Actions → Share → **Share Textures**, and send the **Colour** image from the zip.
It uses the same layout, so either way works.

**Putting a painting in:** the original goes in `art/gunny-paw/gunny-paw-painted.png`, and
the game's copy is made from it with the gaps between the pieces filled in:

    python3 tools/import_uv_texture.py art/gunny-paw/gunny-paw-painted.png \
        art/gunny-paw/layout.json src/assets/textures/gunny-paw.png

If the paw's shape changes (`npm run art:gunny-paws`, for example when it's re-posed to the
real gun), it gets a new layout and fresh templates, and a painting made on the old layout
has to be moved over to the new one.

## Coming in later steps

| File | Canvas | What |
|---|---|---|
| Gunny | 1024 × 1024 | Gunny as other players see him (painted on the 3D model in Procreate) |
| Hero portrait | 1024 × 1536 | Character select card |
| More HUD icons | 256 × 256 each | Health, cheese gun, and so on |

## Regenerating placeholders

`python3 tools/make_placeholders.py` creates any missing placeholder files. It never
overwrites a file that already exists unless you pass `--force`, so it can't replace your art.
