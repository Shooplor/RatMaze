import test from 'node:test';
import assert from 'node:assert/strict';
import { Maze } from '../src/sim/maze.js';

function reachableFrom(maze, start) {
  const seen = new Set([`${start.cx},${start.cz}`]);
  const queue = [start];
  while (queue.length) {
    const { cx, cz } = queue.shift();
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const key = `${cx + dx},${cz + dz}`;
      if (maze.isOpen(cx + dx, cz + dz) && !seen.has(key)) {
        seen.add(key);
        queue.push({ cx: cx + dx, cz: cz + dz });
      }
    }
  }
  return seen.size;
}

const deadEndCount = (maze) =>
  maze.openCells().filter(({ cx, cz }) => maze.openNeighbourCount(cx, cz) === 1).length;

test('same seed builds the same maze, different seeds differ', () => {
  const a = Maze.generate({ cols: 21, rows: 21, seed: 42, braid: 0.6 });
  const b = Maze.generate({ cols: 21, rows: 21, seed: 42, braid: 0.6 });
  const c = Maze.generate({ cols: 21, rows: 21, seed: 43, braid: 0.6 });
  assert.equal(a.toAscii(), b.toAscii());
  assert.notEqual(a.toAscii(), c.toAscii());
});

test('every open tile is reachable and the border is solid', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const maze = Maze.generate({ cols: 21, rows: 21, seed, braid: 0.6 });
    assert.equal(reachableFrom(maze, maze.spawns.player), maze.openCells().length, `seed ${seed}`);
    for (let i = 0; i < maze.cols; i++) {
      assert.ok(maze.isWall(i, 0) && maze.isWall(i, maze.rows - 1), `seed ${seed}`);
    }
    for (let i = 0; i < maze.rows; i++) {
      assert.ok(maze.isWall(0, i) && maze.isWall(maze.cols - 1, i), `seed ${seed}`);
    }
  }
});

test('even sizes are rounded up to odd', () => {
  const maze = Maze.generate({ cols: 20, rows: 12, seed: 1 });
  assert.equal(maze.cols, 21);
  assert.equal(maze.rows, 13);
});

test('braid 0 gives a perfect maze, braid 1 removes every dead end', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const perfect = Maze.generate({ cols: 21, rows: 21, seed, braid: 0 });
    // A perfect maze is a tree: 100 rooms joined by 99 passages.
    assert.equal(perfect.openCells().length, 100 + 99);
    assert.ok(deadEndCount(perfect) > 0);

    const braided = Maze.generate({ cols: 21, rows: 21, seed, braid: 1 });
    assert.equal(deadEndCount(braided), 0, `seed ${seed}`);
  }
});

test('spawns and lamps sit on open tiles; spawns are in opposite corners', () => {
  const maze = Maze.generate({ cols: 21, rows: 21, seed: 7, braid: 0.6 });
  assert.deepEqual(maze.spawns.player, { cx: 1, cz: 1 });
  assert.deepEqual(maze.spawns.enemy, { cx: 19, cz: 19 });
  assert.ok(maze.lamps.length >= 2);
  for (const { cx, cz } of [maze.spawns.player, maze.spawns.enemy, ...maze.lamps]) {
    assert.ok(maze.isOpen(cx, cz));
  }
});

test('hand-drawn ASCII layouts load and round-trip', () => {
  const layout = `
    #######
    #P..L.#
    #.###.#
    #....E#
    #######
  `;
  const maze = Maze.fromAscii(layout);
  assert.equal(maze.cols, 7);
  assert.equal(maze.rows, 5);
  assert.deepEqual(maze.spawns.player, { cx: 1, cz: 1 });
  assert.deepEqual(maze.spawns.enemy, { cx: 5, cz: 3 });
  assert.deepEqual(maze.lamps, [{ cx: 4, cz: 1 }]);
  assert.equal(maze.toAscii(), layout.trim().split('\n').map((l) => l.trim()).join('\n'));
});

test('outside the grid counts as wall', () => {
  const maze = Maze.fromAscii('...\n...');
  assert.ok(maze.isWall(-1, 0));
  assert.ok(maze.isWall(0, 2));
  assert.ok(maze.isOpen(2, 1));
});
