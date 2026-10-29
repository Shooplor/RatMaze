import test from 'node:test';
import assert from 'node:assert/strict';
import { Maze } from '../src/sim/maze.js';
import { Match } from '../src/sim/match.js';
import { Rat, yawFor } from '../src/sim/rat.js';

const T = 2;
const R = 0.3;
const REACH = T * 0.45;

// A corridor with the exit door in the north wall above its far end.
const layout = `
  #####D#
  #P....#
  #######
`;

function setup() {
  const maze = Maze.fromAscii(layout, T);
  const start = maze.cellCenter(maze.spawns.player.cx, maze.spawns.player.cz);
  const rat = new Rat({ x: start.x, z: start.z, radius: R, speed: 4 });
  const match = new Match(maze, [rat], { reach: REACH });
  return { maze, rat, match };
}

function walk(rat, match, maze, dir, seconds) {
  const yaw = yawFor(dir[0], dir[1]);
  for (let t = 0; t < seconds; t += 1 / 60) {
    rat.applyCommand({ forward: 1, right: 0, yaw, pitch: 0 }, 1 / 60, maze);
    match.update(1 / 60);
  }
}

test('cheese sits on every open tile except where the rat starts', () => {
  const { match } = setup();
  assert.equal(match.cheese.total, 4);
  assert.equal(match.cheese.has(1, 1), false);
});

test('walking down a corridor collects its cheese, each piece once', () => {
  const { maze, rat, match } = setup();
  walk(rat, match, maze, [1, 0], 0.7); // about 1.4 tiles east
  assert.equal(rat.carried, 1);
  assert.equal(match.cheese.remaining, 3);
  const events = match.drainEvents();
  assert.deepEqual(events.map((e) => e.type), ['collected']);
  assert.deepEqual(events[0].tiles, [{ cx: 2, cz: 1 }]);
});

test('hugging the wall still collects the cheese', () => {
  const { maze, rat, match } = setup();
  rat.z = 1 * T + R; // pressed against the north wall
  walk(rat, match, maze, [1, 0], 3);
  assert.equal(rat.carried, 4);
});

test('the exit stays shut until the maze is empty, then the first rat through wins', () => {
  const { maze, rat, match } = setup();
  rat.x = rat.prevX = 5.5 * T; // right under the door (tile 5, 0)
  match.update(1 / 60);
  assert.equal(match.cheese.remaining, 3);

  walk(rat, match, maze, [0, -1], 1); // push north into the closed door
  assert.equal(match.state, 'collecting');
  assert.ok(rat.z >= 1 * T + R - 1e-9, 'the closed door blocks');

  walk(rat, match, maze, [-1, 0], 3); // back west for the rest
  assert.equal(match.cheese.remaining, 0);
  assert.equal(match.state, 'exitOpen');
  assert.ok(maze.isOpen(5, 0), 'door is open');

  walk(rat, match, maze, [1, 0], 3); // east to the end again
  walk(rat, match, maze, [0, -1], 1); // and through the door
  assert.equal(match.state, 'over');
  assert.equal(match.winner, rat);
  assert.equal(rat.delivered, 4);
  assert.equal(rat.carried, 0);
  const types = match.drainEvents().map((e) => e.type).filter((t) => t !== 'collected');
  assert.deepEqual(types, ['exitOpened', 'escaped']);
});

test('the testing shortcut hands over all cheese and opens the exit on the next tick', () => {
  const { rat, match } = setup();
  match.giveAllCheese(rat);
  assert.equal(rat.carried, 4);
  match.update(1 / 60);
  assert.equal(match.state, 'exitOpen');
});
