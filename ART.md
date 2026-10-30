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
| `cheese-wedge.png` | 1024 × 1024 | The floating cheese you suck up, and the cheese you shoot. |

This one is painted onto the model's layout (its UVs), not tiled: each face of the wedge
has its own area of the image. Everything you need is in `art/cheese-wedge/`.

**Painting it flat:** make a 1024 × 1024 canvas in Procreate, import
`cheese-wedge-uv-template.png` as the top layer, and paint each face on the layers below,
a little past its outline. Edges with the same number meet on the model; the dot marks
the tip of the wedge. Hide the template, export as PNG, and save it as
`src/assets/textures/cheese-wedge.png`.

**Painting it in 3D:** import `cheese-wedge.obj` into Procreate (3D painting) and paint
straight onto the wedge. Export the texture as PNG and save it under the same name. It
uses the same layout as the template, so either way works.

If the model ever changes, `npm run art:cheese-wedge` writes a fresh OBJ and template.

## Gunny's gun

| File | What |
|---|---|
| Gun model | Gunny's scrap vacuum gun in first person. For now it is a placeholder built in code (`src/render/gunView.js`). Send the model as `.glb` if you can (`.fbx` or `.obj` also work, I'll convert it). I'll fit its size and position on screen and find the nozzle, where the whirlwind starts and shots come out. If it has a part that should spin while sucking, or a cheese jar that fills up, tell me which parts. |

## Coming in later steps

| File | Canvas | What |
|---|---|---|
| Gunny | 1024 × 1024 | Gunny as other players see him (painted on the 3D model in Procreate) |
| Gunny's arms | 1024 × 1024 | First-person paw (painted on the 3D model in Procreate) |
| Hero portrait | 1024 × 1536 | Character select card |
| More HUD icons | 256 × 256 each | Health, cheese gun, and so on |

## Regenerating placeholders

`python3 tools/make_placeholders.py` creates any missing placeholder files. It never
overwrites a file that already exists unless you pass `--force`, so it can't replace your art.
