# Art slots

Every texture in the game is a PNG in `public/textures/`. Right now each one is a
placeholder that shows its own file name and size.

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

## Coming in later steps

| File | Canvas | What |
|---|---|---|
| `door.png` | 512 × 1024 | The exit door |
| `cheese.png` | 512 × 512 | Cheese wedge and the compass arrow |
| Gunny | 1024 × 1024 | Gunny as other players see him (painted on the 3D model in Procreate) |
| Gunny's arms | 1024 × 1024 | First-person paw (painted on the 3D model in Procreate) |
| Cheese gun | 1024 × 1024 | Gunny's crafted gun (painted on the 3D model in Procreate) |
| Hero portrait | 1024 × 1536 | Character select card |
| HUD icons | 256 × 256 each | Cheese counter, health, and so on |

## Regenerating placeholders

`python3 tools/make_placeholders.py` creates any missing placeholder files. It never
overwrites a file that already exists unless you pass `--force`, so it can't replace your art.
