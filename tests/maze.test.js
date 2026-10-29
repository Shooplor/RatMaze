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

test('the exit is a door in the outer wall, reachable, and fair to both spawns', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const maze = Maze.generate({ cols: 21, rows: 21, seed, braid: 0.6 });
    const { cx, cz, dx, dz } = maze.exit;
    const onBorder = cx === 0 || cz === 0 || cx === maze.cols - 1 || cz === maze.rows - 1;
    assert.ok(onBorder, `seed ${seed}: exit not on the border`);
    assert.ok(maze.isWall(cx, cz), 'the door is solid until it opens');
    assert.ok(maze.isWall(cx + dx, cz + dz) && !maze.inBounds(cx + dx, cz + dz), 'outside is beyond the grid');
    assert.ok(maze.isOpen(cx - dx, cz - dz), 'a corridor leads to the door');

    // No other spot in the outer wall is fairer than the one chosen.
    const fromPlayer = maze.distancesFrom(maze.spawns.player);
    const fromEnemy = maze.distancesFrom(maze.spawns.enemy);
    const gap = (x, z) => Math.abs(fromPlayer[z * maze.cols + x] - fromEnemy[z * maze.cols + x]);
    const chosen = gap(cx - dx, cz - dz);
    for (let i = 1; i < maze.cols - 1; i++) {
      for (const [x, z] of [[i, 1], [i, maze.rows - 2], [1, i], [maze.cols - 2, i]]) {
        if (maze.isOpen(x, z)) assert.ok(gap(x, z) >= chosen, `seed ${seed}: fairer exit near ${x},${z}`);
      }
    }
  }
});

test('hand-drawn layouts can place the exit with D', () => {
  const maze = Maze.fromAscii(`
    ###D###
    #P....#
    #######
  `);
  assert.deepEqual(maze.exit, { cx: 3, cz: 0, dx: 0, dz: -1 });
  assert.ok(maze.isWall(3, 0));
  assert.equal(maze.toAscii().split('\n')[0], '###D###');
});
