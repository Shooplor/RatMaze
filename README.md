# Rat's Maze

A first-person maze game: gather every piece of cheese, then carry it to the exit
before the rival rat does. Built with HTML, CSS, JavaScript and [three.js](https://threejs.org).

**Status:** Gunny's scrap vacuum gun sucks up cheese (right mouse) and shoots it back
out (left mouse). Gather every piece, then follow the cheese compass to the exit door.
Footsteps and the vacuum make noise other rats can hear; sneak or crouch to stay quiet.
No rival rat yet (T lets a wandering test rat loose so you can hear one).

## Run it

You need [Node.js](https://nodejs.org) 20 or newer.

```sh
npm install      # once
npm run dev      # then open the address it prints, usually http://localhost:5173
```

Other commands:

```sh
npm test         # checks the game logic (maze generation, movement, collisions)
npm run build    # makes a static copy of the game in dist/ for hosting
npm run build:artifact   # packs the whole game into one file: dist-artifact/rats-maze.html
npm run art:cheese-wedge # exports the cheese wedge OBJ and its UV template to art/cheese-wedge/
npm run art:gunny-paws   # rebuilds Gunny's first-person paw in Blender, with its UV templates in art/gunny-paw/
```

Rebuilding the paw needs Blender's Python module, installed once into `.blender/`:
`python3 -m venv .blender && .blender/bin/pip install bpy`.

## Controls

| Key | Action |
|---|---|
| Mouse | Look |
| W A S D / arrows | Move |
| Right mouse (hold) | Vacuum: pull cheese into the gun. You walk at half speed |
| Left mouse | Shoot a piece of cheese (costs 1) |
| E / F | Vacuum / shoot from the keyboard |
| Shift (hold) | Sneak: quieter footsteps, slower |
| Ctrl or C | Crouch on / off: silent footsteps, slowest. C is safer, since Ctrl+W closes the browser tab |
| Esc | Pause |
| M | Sound on / off |
| [ / ] | Volume down / up (saved for next time) |
| P | Retro look: off / medium / heavy |
| N | New maze |
| K | Testing shortcut: collect all the cheese at once, to try the exit |
| T | Testing: let a wandering rat loose (or remove it), to hear footsteps that aren't yours |

Every maze comes from a number (its seed), shown bottom-left and at the end of the
address (`#maze-1234`). The same seed always builds the same maze, so you can share one.

If the browser won't capture the mouse (some embedded previews), the game switches to
drag-to-look: hold a mouse button and drag.

## Sound

Footsteps and the vacuum are noise. Other rats hear it along the corridors (not through
walls), quieter with distance and muffled when there is no straight line between you:

- walking steps are loud, sneaking steps (Shift) quiet, crouched steps silent
- the vacuum starts quiet and gets louder the longer you hold it, full after 3 seconds

Your own footsteps play quieter than other rats', so theirs stand out. The noise meter
next to your stance (bottom left) shows how loud you are right now. All sounds are
synthesized in `src/audio/sounds.js`; recorded sounds can replace any of them later.

## Art

All textures are placeholders that name the file that replaces them. See [ART.md](ART.md).

## How the code is organised

```
src/
  config.js        tuning numbers: corridor size, speed, fog, field of view
  sim/             game logic only, no 3D code, so a multiplayer server can reuse it
    maze.js        maze generation (and hand-drawn ASCII layouts)
    rat.js         a rat: moves from a command, the same for player, bot and network
    cheese.js      which tiles still hold cheese
    match.js       the round's rules: vacuum, shots, footsteps, exit opening, escaping
    sound.js       how a sound reaches a listener through the maze
    collision.js   sliding along walls
    random.js      seeded random numbers
  models/
    cheeseWedge.js the collectible cheese wedge, built by hand with a paintable UV layout
  render/          what you see (three.js)
    world.js       walls, floor, ceiling, lamps
    cheeseView.js  the floating cheese wedges
    exitView.js    the exit door and the lit alcove behind it
    overlay.js     a second 3D layer drawn over the maze (gun and compass)
    gunView.js     the first-person scrap gun (placeholder model) and its animation
    whirlwind.js   the vacuum's swirling wind effect
    shotsView.js   cheese shots in flight and the crumbs they burst into
    ratView.js     another rat in the maze (placeholder model)
    compass.js     the cheese arrow pointing at the exit
    firstPersonView.js  camera at the rat's eyes, the A/D tilt, the rat's own light
    textures.js    texture loading and the crisp retro filtering
  ai/
    wanderBrain.js TESTING: a rat that wanders at random (T), to have something to hear
  audio/
    audio.js       the sound system: volume, 3D positioning, muffling
    sounds.js      every sound, synthesized: footsteps, vacuum, shots, door
  input/           keyboard and mouse → rat commands
  ui/              HTML/CSS overlay: menus, crosshair, HUD
src/assets/textures/   the texture files
src/assets/ui/     HUD icons
src/assets/models/ 3D models (Gunny's first-person paw)
art/               files for drawing: UV templates and models to paint in Procreate
tools/             helper scripts (placeholder textures, single-file build, UV templates, importing painted UV textures)
tools/blender/     Blender scripts that build 3D models
tests/             logic tests
```
