# Rat's Maze

A first-person maze game: gather every piece of cheese, then carry it to the exit
before the rival rat does. Built with HTML, CSS, JavaScript and [three.js](https://threejs.org).

**Status:** step 1 of the plan — walk a dark, randomly generated maze.

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
```

## Controls

| Key | Action |
|---|---|
| Mouse | Look |
| W A S D / arrows | Move |
| Esc | Pause |
| P | Retro look: off / medium / heavy |
| N | New maze |

Every maze comes from a number (its seed), shown bottom-left and at the end of the
address (`#maze-1234`). The same seed always builds the same maze, so you can share one.

If the browser won't capture the mouse (some embedded previews), the game switches to
drag-to-look: hold a mouse button and drag.

## Art

All textures are placeholders that name the file that replaces them. See [ART.md](ART.md).

## How the code is organised

```
src/
  config.js        tuning numbers: corridor size, speed, fog, field of view
  sim/             game logic only, no 3D code, so a multiplayer server can reuse it
    maze.js        maze generation (and hand-drawn ASCII layouts)
    rat.js         a rat: moves from a command, the same for player, bot and network
    collision.js   sliding along walls
    random.js      seeded random numbers
  render/          what you see (three.js)
    world.js       walls, floor, ceiling, lamps
    firstPersonView.js  camera at the rat's eyes, head-bob, the rat's own light
    textures.js    texture loading and the crisp retro filtering
  input/           keyboard and mouse → rat commands
  ui/              HTML/CSS overlay: menus, crosshair, HUD
src/assets/textures/   the texture files
tools/             helper scripts (placeholder textures, single-file build)
tests/             logic tests
```
