import * as THREE from 'three';
import {
  BRAID, EYE_HEIGHT, FOG_COLOR, FOG_FAR, FOG_NEAR, FOV, MAZE_COLS, MAZE_ROWS,
  RAT_RADIUS, RAT_SPEED, TICK_RATE, TILE,
} from './config.js';
import { Maze } from './sim/maze.js';
import { randomSeed } from './sim/random.js';
import { Rat, yawFor } from './sim/rat.js';
import { buildWorld } from './render/world.js';
import { FirstPersonView } from './render/firstPersonView.js';
import { setCrispTextures, setMaxAnisotropy } from './render/textures.js';
import { KeyboardMouseController } from './input/keyboardMouse.js';
import { createHud } from './ui/hud.js';

// Retro look: render at a fraction of the screen resolution and stretch with sharp pixels.
const RETRO_LEVELS = [
  { name: 'off', scale: null, crisp: false },
  { name: 'medium', scale: 1 / 2, crisp: true },
  { name: 'heavy', scale: 1 / 3, crisp: true },
];

// --- Level -----------------------------------------------------------------

const seed = readSeed();
const maze = Maze.generate({ cols: MAZE_COLS, rows: MAZE_ROWS, seed, braid: BRAID, tileSize: TILE });

// --- Renderer, scene, camera -----------------------------------------------

const renderer = new THREE.WebGLRenderer({ antialias: true });
document.getElementById('game').appendChild(renderer.domElement);
setMaxAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()));

const scene = new THREE.Scene();
scene.background = new THREE.Color(FOG_COLOR);
scene.fog = new THREE.Fog(FOG_COLOR, FOG_NEAR, FOG_FAR);

const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, FOG_FAR + TILE);
scene.add(camera); // the camera carries the rat's own light, so it must be in the scene

const world = buildWorld(maze, scene);

// --- Player ----------------------------------------------------------------

const spawn = maze.spawns.player;
const spawnPos = maze.cellCenter(spawn.cx, spawn.cz);
const facing = maze.openDirection(spawn.cx, spawn.cz);
const player = new Rat({
  x: spawnPos.x,
  z: spawnPos.z,
  yaw: yawFor(facing.dx, facing.dz),
  radius: RAT_RADIUS,
  speed: RAT_SPEED,
});

const controller = new KeyboardMouseController(renderer.domElement);
controller.setView(player.yaw, 0);
const view = new FirstPersonView(camera);
camera.position.set(player.x, EYE_HEIGHT, player.z);

// --- UI and settings -------------------------------------------------------

const hud = createHud({ onPlay: () => controller.requestLock() });
controller.onLockChange = (locked) => hud.setPlaying(locked);
renderer.domElement.addEventListener('click', () => {
  if (!controller.locked) controller.requestLock();
});

const savedRetro = Number(readSetting('retro', 1));
let retroIndex = Number.isInteger(savedRetro) ? savedRetro % RETRO_LEVELS.length : 1;
applyRetro();

document.addEventListener('keydown', (e) => {
  if (e.code === 'KeyP') {
    retroIndex = (retroIndex + 1) % RETRO_LEVELS.length;
    writeSetting('retro', retroIndex);
    applyRetro();
  } else if (e.code === 'KeyN') {
    window.location.search = `?seed=${randomSeed()}`;
  }
});

window.addEventListener('resize', resize);
resize();

if (import.meta.env.DEV) window.ratMaze = { maze, player, controller, camera, scene };

// --- Game loop -------------------------------------------------------------
// The simulation steps at a fixed rate (steady and repeatable, which multiplayer needs).
// Rendering runs as fast as the screen allows and blends between the last two steps.

const TICK = 1 / TICK_RATE;
let accumulator = 0;
let lastTime = performance.now();
let fps = { frames: 0, time: 0, value: 0 };

function frame(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.25);
  lastTime = now;

  if (controller.locked) {
    accumulator += dt;
    while (accumulator >= TICK) {
      player.applyCommand(controller.getCommand(), TICK, maze);
      accumulator -= TICK;
    }
  }

  view.update(player, accumulator / TICK, controller.yaw, controller.pitch, dt);
  world.update(now / 1000);
  renderer.render(scene, camera);
  updateDebug(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// --- Helpers ---------------------------------------------------------------

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function applyRetro() {
  const level = RETRO_LEVELS[retroIndex];
  renderer.setPixelRatio(level.scale ?? Math.min(window.devicePixelRatio, 2));
  renderer.domElement.classList.toggle('pixelated', level.scale !== null);
  setCrispTextures(level.crisp);
  resize();
}

function updateDebug(dt) {
  fps.frames++;
  fps.time += dt;
  if (fps.time >= 0.5) {
    fps.value = Math.round(fps.frames / fps.time);
    fps = { frames: 0, time: 0, value: fps.value };
  }
  hud.setDebug(`maze #${seed} · retro: ${RETRO_LEVELS[retroIndex].name} · ${fps.value} fps`);
}

// The seed lives in the URL, so reloading keeps the same maze and a maze can be shared.
function readSeed() {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = Number.parseInt(params.get('seed'), 10);
  if (Number.isFinite(fromUrl)) return fromUrl;
  const fresh = randomSeed();
  params.set('seed', fresh);
  window.history.replaceState(null, '', `?${params}`);
  return fresh;
}

// Settings are a convenience; private browsing can block storage, so never rely on it.
function readSetting(key, fallback) {
  try {
    return window.localStorage.getItem(`ratmaze.${key}`) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeSetting(key, value) {
  try {
    window.localStorage.setItem(`ratmaze.${key}`, String(value));
  } catch {
    // ignore
  }
}
