import * as THREE from 'three';
import {
  BRAID, CROUCH_SPEED_FACTOR, EYE_HEIGHT, FOG_COLOR, FOG_FAR, FOG_NEAR, FOV, MAZE_COLS, MAZE_ROWS,
  RAT_RADIUS, RAT_SPEED, RULES, SNEAK_SPEED_FACTOR, TICK_RATE, TILE,
} from './config.js';
import { Maze } from './sim/maze.js';
import { Match } from './sim/match.js';
import { randomSeed } from './sim/random.js';
import { Rat, yawFor } from './sim/rat.js';
import { hearSound } from './sim/sound.js';
import { WanderBrain } from './ai/wanderBrain.js';
import { buildWorld } from './render/world.js';
import { buildCheese } from './render/cheeseView.js';
import { buildExit } from './render/exitView.js';
import { createOverlay } from './render/overlay.js';
import { createCompass } from './render/compass.js';
import { createGun } from './render/gunView.js';
import { createWhirlwind } from './render/whirlwind.js';
import { createShots } from './render/shotsView.js';
import { FirstPersonView } from './render/firstPersonView.js';
import { createRatView } from './render/ratView.js';
import { setCrispTextures, setMaxAnisotropy } from './render/textures.js';
import { KeyboardMouseController } from './input/keyboardMouse.js';
import { createAudio } from './audio/audio.js';
import { createHud } from './ui/hud.js';

// Retro look: render at a fraction of the screen resolution and stretch with sharp pixels.
const RETRO_LEVELS = [
  { name: 'off', scale: null, crisp: false },
  { name: 'medium', scale: 1 / 2, crisp: true },
  { name: 'heavy', scale: 1 / 3, crisp: true },
];

const OWN_STEP_VOLUME = 0.35; // your own footsteps, quieter than others' so theirs stand out
const SPLAT_LOUDNESS = 0.8;
const DOOR_LOUDNESS = 2.5;    // the exit opening can be heard from far off

// Speeds and stance options every rat shares (moving into hero definitions later).
const RAT_OPTIONS = {
  radius: RAT_RADIUS,
  speed: RAT_SPEED,
  suckSpeedFactor: RULES.suckSpeedFactor,
  sneakSpeedFactor: SNEAK_SPEED_FACTOR,
  crouchSpeedFactor: CROUCH_SPEED_FACTOR,
};

// --- Renderer, scene, camera -----------------------------------------------

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.autoClear = false; // the maze and the overlay are drawn one after the other
document.getElementById('game').appendChild(renderer.domElement);
setMaxAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()));

const scene = new THREE.Scene();
scene.background = new THREE.Color(FOG_COLOR);
scene.fog = new THREE.Fog(FOG_COLOR, FOG_NEAR, FOG_FAR);

const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, FOG_FAR + TILE);
scene.add(camera); // the camera carries the rat's own light, so it must be in the scene

const overlay = createOverlay();
const compass = createCompass(overlay);
const gun = createGun(overlay);
const whirlwind = createWhirlwind(camera);
const shotsView = createShots(scene);

const controller = new KeyboardMouseController(renderer.domElement);
const view = new FirstPersonView(camera);
const audio = createAudio();

// --- Level -----------------------------------------------------------------
// The current maze and everything built from it. N swaps in a new one without a reload.

let seed;
let maze;
let player;
let match;
let world;
let cheeseView;
let exitView;
let wanderer = null; // testing: { rat, brain, view }, a rat wandering the maze to listen to
let stepNoise = 0;   // your last footstep's loudness, fading, for the noise meter

function loadMaze(newSeed) {
  removeWanderer();
  for (const old of [world, cheeseView, exitView]) {
    if (!old) continue;
    scene.remove(old.group);
    old.dispose();
  }

  seed = newSeed;
  maze = Maze.generate({ cols: MAZE_COLS, rows: MAZE_ROWS, seed, braid: BRAID, tileSize: TILE });

  const spawn = maze.spawns.player;
  const spawnPos = maze.cellCenter(spawn.cx, spawn.cz);
  const facing = maze.openDirection(spawn.cx, spawn.cz);
  player = new Rat({
    x: spawnPos.x,
    z: spawnPos.z,
    yaw: yawFor(facing.dx, facing.dz),
    ...RAT_OPTIONS,
  });
  controller.setView(player.yaw, 0);
  controller.crouched = false;
  camera.position.set(player.x, EYE_HEIGHT, player.z);
  match = new Match(maze, [player], RULES);

  world = buildWorld(maze);
  cheeseView = buildCheese(match.cheese.pieces);
  shotsView.clear();
  exitView = buildExit(maze);
  for (const v of [world, cheeseView, exitView]) scene.add(v.group);
  compass.hide();

  hud.setResult(null);
  hud.showExitOpen(false);
  hud.setMazeCheese(match.cheese.remaining);
  hud.setCarried(0);
  hud.clearToast();

  accumulator = 0;
  showSeedInAddress(seed);

  if (import.meta.env.DEV) window.ratMaze = { maze, player, match, controller, camera, scene };
}

// Testing: a rat that wanders the corridors so you can hear footsteps that aren't yours.
function toggleWanderer() {
  if (wanderer) {
    removeWanderer();
    hud.toast('The wandering rat is gone.', 2);
    return;
  }
  const spawn = maze.cellCenter(maze.spawns.enemy.cx, maze.spawns.enemy.cz);
  const rat = new Rat({ x: spawn.x, z: spawn.z, ...RAT_OPTIONS });
  wanderer = { rat, brain: new WanderBrain(maze, rat), view: createRatView(scene) };
  match.addRat(rat);
  if (import.meta.env.DEV) window.ratMaze.wanderer = wanderer;
  hud.toast('A rat is wandering the maze. Listen for its steps.', 3);
}

function removeWanderer() {
  if (!wanderer) return;
  match.removeRat(wanderer.rat);
  wanderer.view.dispose();
  wanderer = null;
}

// Plays a sound made somewhere in the maze, as heard from where you stand.
function playFrom(name, at, loudness) {
  const heard = hearSound(maze, at, player, loudness, RULES.hearingRange);
  audio.play(name, { volume: Math.min(1.2, heard.volume), position: at, inSight: heard.inSight });
}

// What the rules report, shown on screen and heard.
function handleEvent(event) {
  const mine = event.rat === player;
  switch (event.type) {
    case 'footstep':
      if (mine) {
        stepNoise = event.loudness;
        audio.play('footstep', { volume: event.loudness * OWN_STEP_VOLUME });
      } else {
        playFrom('footstep', { x: event.x, y: 0.1, z: event.z }, event.loudness);
      }
      break;
    case 'collected':
      hud.setMazeCheese(match.cheese.remaining);
      if (mine) {
        hud.setCarried(player.carried, { bump: true });
        audio.play('collect', { volume: 0.8 });
      }
      break;
    case 'fired':
      if (mine) {
        gun.kick();
        hud.setCarried(player.carried);
        audio.play('shot');
      }
      break;
    case 'dryFire':
      if (mine) {
        hud.flashEmpty();
        audio.play('dryFire');
      }
      break;
    case 'shotHit':
      shotsView.splat(event.x, event.y, event.z);
      playFrom('splat', event, SPLAT_LOUDNESS);
      break;
    case 'exitOpened': {
      exitView.open();
      compass.show();
      hud.showExitOpen(true);
      hud.toast('All the cheese is gathered. The exit is open!');
      const { x, z } = exitView.position;
      playFrom('door', { x, y: 1, z }, DOOR_LOUDNESS);
      break;
    }
    case 'escaped':
      compass.hide();
      hud.clearToast();
      hud.setCarried(player.carried);
      hud.setResult(
        mine
          ? { title: 'You escaped!', text: `You delivered ${event.rat.delivered} cheese in ${formatTime(match.time)}.` }
          : { title: 'Too slow!', text: 'Another rat reached the exit first.' },
      );
      controller.release();
      break;
  }
}

// --- UI and settings -------------------------------------------------------

const hud = createHud({
  onPlay: () => {
    audio.unlock(); // browsers allow sound only after a click
    if (match.state === 'over') loadMaze(randomSeed());
    controller.requestLock();
  },
});
controller.onActiveChange = (active) => hud.setPlaying(active, { dragToLook: controller.dragToLook });
renderer.domElement.addEventListener('click', () => {
  audio.unlock();
  if (!controller.active) controller.requestLock();
});
audio.setMuted(readSetting('muted', 'false') === 'true');

const savedRetro = Number(readSetting('retro', 1));
let retroIndex = Number.isInteger(savedRetro) ? savedRetro % RETRO_LEVELS.length : 1;
applyRetro();

document.addEventListener('keydown', (e) => {
  if (e.code === 'KeyP') {
    retroIndex = (retroIndex + 1) % RETRO_LEVELS.length;
    writeSetting('retro', retroIndex);
    applyRetro();
  } else if (e.code === 'KeyN') {
    loadMaze(randomSeed());
  } else if (e.code === 'KeyK' && controller.active) {
    match.giveAllCheese(player); // testing shortcut, until there's a quicker way to see the exit
  } else if (e.code === 'KeyT' && controller.active) {
    toggleWanderer();
  } else if (e.code === 'KeyM') {
    audio.setMuted(!audio.muted);
    writeSetting('muted', audio.muted);
  }
});

// Pasting a link to a different maze switches to it.
window.addEventListener('hashchange', () => {
  const linked = seedFromAddress();
  if (linked !== null && linked !== seed) loadMaze(linked);
});

window.addEventListener('resize', resize);
resize();

// --- Game loop -------------------------------------------------------------
// The simulation steps at a fixed rate (steady and repeatable, which multiplayer needs).
// Rendering runs as fast as the screen allows and blends between the last two steps.

const TICK = 1 / TICK_RATE;
const lookDirection = new THREE.Vector3();
let accumulator = 0;
let lastTime = performance.now();
let fps = { frames: 0, time: 0, value: 0 };

loadMaze(seedFromAddress() ?? randomSeed());

function frame(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.25);
  lastTime = now;

  if (controller.active && match.state !== 'over') {
    accumulator += dt;
    while (accumulator >= TICK) {
      player.applyCommand(controller.getCommand(), TICK, maze);
      if (wanderer) wanderer.rat.applyCommand(wanderer.brain.command(), TICK, maze);
      match.update(TICK);
      accumulator -= TICK;
    }
  }
  match.drainEvents().forEach(handleEvent);

  const time = now / 1000;
  const alpha = accumulator / TICK;
  const cmd = controller.getCommand();
  const playing = controller.active && match.state !== 'over';
  view.update(player, alpha, cmd, dt);
  for (const v of [world, cheeseView, exitView]) v.update(time, dt);
  compass.update(dt, camera.position, cmd.yaw, exitView.position);
  shotsView.sync(match.shots, alpha, time);
  shotsView.update(dt);
  gun.update(dt, time, {
    moving: playing && (cmd.forward !== 0 || cmd.right !== 0),
    sucking: playing && cmd.suck,
    carried: player.carried,
  });
  whirlwind.update(dt, time, playing && cmd.suck, gun.muzzle);
  wanderer?.view.update(wanderer.rat, alpha, dt);

  const vacuumNoise = playing ? match.vacuumLoudness(player) : 0;
  audio.setVacuum(vacuumNoise);
  audio.setListener(camera.position, camera.getWorldDirection(lookDirection));
  stepNoise *= Math.exp(-dt * 2.5); // fades between steps, so walking keeps the meter up
  hud.setStance(
    player.crouching ? 'Crouched' : player.sneaking ? 'Sneaking' : 'Walking',
    Math.max(stepNoise, vacuumNoise),
  );

  renderer.clear();
  renderer.render(scene, camera);
  renderer.clearDepth();
  renderer.render(overlay.scene, overlay.camera);
  updateDebug(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// --- Helpers ---------------------------------------------------------------

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  overlay.resize(camera.aspect);
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function formatTime(seconds) {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
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
  const sound = audio.muted ? 'off' : 'on';
  hud.setDebug(`maze #${seed} · retro: ${RETRO_LEVELS[retroIndex].name} · sound: ${sound} · ${fps.value} fps`);
}

// The maze's seed lives in the address (#maze-1234), so reloading keeps the same maze
// and a link can be shared.
function seedFromAddress() {
  const found = /^#maze-(\d+)$/.exec(window.location.hash);
  return found ? Number(found[1]) : null;
}

function showSeedInAddress(value) {
  try {
    window.history.replaceState(null, '', `#maze-${value}`);
  } catch {
    // Some embedded views don't allow changing the address; the maze still works.
  }
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
