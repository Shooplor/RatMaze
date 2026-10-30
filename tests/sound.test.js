import test from 'node:test';
import assert from 'node:assert/strict';
import { Maze } from '../src/sim/maze.js';
import { hearSound } from '../src/sim/sound.js';

const T = 2;
// A long corridor that doubles back: the two ends are close in a straight line but far apart walking.
const maze = Maze.fromAscii(`
  ###########
  #.........#
  #########.#
  #.........#
  ###########
`, T);
const at = (cx, cz) => maze.cellCenter(cx, cz);
const RANGE = 16;

test('a sound is loudest close by and fades with distance', () => {
  const near = hearSound(maze, at(3, 1), at(1, 1), 1, RANGE);
  const far = hearSound(maze, at(7, 1), at(1, 1), 1, RANGE);
  assert.ok(near.inSight && far.inSight);
  assert.ok(near.volume > far.volume && far.volume > 0);
});

test('sound travels along the corridors, not through walls, and arrives muffled', () => {
  // (1,1) and (1,3) are 4 units apart through the wall, but 20 tiles apart by corridor.
  const through = hearSound(maze, at(1, 3), at(1, 1), 1, RANGE);
  assert.equal(through.inSight, false);
  assert.equal(through.volume, 0, 'too far by the corridors to hear');

  const corner = hearSound(maze, at(9, 3), at(7, 1), 1, RANGE); // around one bend: 4 tiles walking
  assert.equal(corner.inSight, false);
  assert.ok(corner.volume > 0);
});

test('quiet sounds carry less far, and silent ones not at all', () => {
  const loud = hearSound(maze, at(5, 1), at(1, 1), 1, RANGE);
  const quiet = hearSound(maze, at(5, 1), at(1, 1), 0.3, RANGE);
  assert.ok(loud.volume > 0);
  assert.equal(quiet.volume, 0, 'a sneaking step 8 units away is inaudible');
  assert.ok(hearSound(maze, at(2, 1), at(1, 1), 0.3, RANGE).volume > 0, 'but audible right next to you');
  assert.equal(hearSound(maze, at(2, 1), at(1, 1), 0, RANGE).volume, 0);
});
