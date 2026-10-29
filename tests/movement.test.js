import test from 'node:test';
import assert from 'node:assert/strict';
import { Maze } from '../src/sim/maze.js';
import { Rat, yawFor } from '../src/sim/rat.js';
import { moveCircle } from '../src/sim/collision.js';

const T = 2; // tile size used in these tests
const R = 0.3;

// A straight east-west corridor: open tiles x = 1..5 at z = 1.
const corridor = Maze.fromAscii(`
  #######
  #.....#
  #######
`, T);

test('walking into a wall stops at the wall', () => {
  // Start mid-corridor, push hard east: the corridor's east wall starts at x = 6 * T.
  const { x, z } = moveCircle(corridor, 3 * T, 1.5 * T, R, 100, 0);
  assert.ok(Math.abs(x - (6 * T - R)) < 1e-9, `x = ${x}`);
  assert.ok(Math.abs(z - 1.5 * T) < 1e-9);
});

test('a huge single step cannot tunnel through a wall', () => {
  const { z } = moveCircle(corridor, 3 * T, 1.5 * T, R, 0, 50);
  assert.ok(z <= 2 * T - R + 1e-9, `z = ${z}`);
});

test('moving diagonally into a wall slides along it', () => {
  const start = { x: 2 * T, z: 2 * T - R }; // touching the south wall
  const { x, z } = moveCircle(corridor, start.x, start.z, R, 1, 1);
  assert.ok(x > start.x + 0.99, 'keeps the sideways part of the move');
  assert.ok(Math.abs(z - start.z) < 1e-9, 'stays against the wall');
});

test('rats move where they face and never through walls', () => {
  const maze = Maze.generate({ cols: 21, rows: 21, seed: 3, braid: 0.6, tileSize: T });
  const start = maze.cellCenter(maze.spawns.player.cx, maze.spawns.player.cz);
  const rat = new Rat({ x: start.x, z: start.z, radius: R, speed: 4 });

  // Facing east and pressing forward moves +x.
  const east = yawFor(1, 0);
  const before = rat.x;
  rat.applyCommand({ forward: 1, right: 0, yaw: east, pitch: 0 }, 0.1, maze);
  assert.ok(rat.x > before || maze.isWall(maze.spawns.player.cx + 1, maze.spawns.player.cz));

  // Wander randomly for a long time: the rat's circle must never overlap a wall tile.
  let seed = 1;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 20000; i++) {
    rat.applyCommand({ forward: rand() * 2 - 1, right: rand() * 2 - 1, yaw: rand() * 7, pitch: 0 }, 1 / 60, maze);
    for (const [ox, oz] of [[R, 0], [-R, 0], [0, R], [0, -R]]) {
      const { cx, cz } = maze.cellAt(rat.x + ox * 0.999, rat.z + oz * 0.999);
      assert.ok(maze.isOpen(cx, cz), `step ${i}: inside wall at ${rat.x}, ${rat.z}`);
    }
  }
});

test('diagonal input is no faster than straight input', () => {
  const open = Maze.fromAscii(Array(9).fill('.........').join('\n'), T);
  const a = new Rat({ x: 9, z: 9, radius: R, speed: 4 });
  const b = new Rat({ x: 9, z: 9, radius: R, speed: 4 });
  a.applyCommand({ forward: 1, right: 0, yaw: 0, pitch: 0 }, 0.5, open);
  b.applyCommand({ forward: 1, right: 1, yaw: 0, pitch: 0 }, 0.5, open);
  const distA = Math.hypot(a.x - 9, a.z - 9);
  const distB = Math.hypot(b.x - 9, b.z - 9);
  assert.ok(Math.abs(distA - distB) < 1e-9);
});
