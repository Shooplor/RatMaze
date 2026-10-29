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
| `cheese.png` | 512 × 512 | The floating cheese wedges, the cheese wheel behind the exit, and the cheese compass arrow. | Each wedge shows only part of the image, so draw it as cheese surface (holes, texture) that tiles, not as one wedge. |
| `ui/hud-cheese.png` | 256 × 256 | The cheese icon next to your carried count, bottom right. | Transparent background. Shown at about 48 × 48. |

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
