import { createRng } from './random.js';

export const OPEN = 0;
export const WALL = 1;

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * A Pac-Man style tile grid: every tile is wall or floor and corridors are one tile wide.
 * Pure data with no rendering, so a future server can build the identical maze.
 *
 * Tile (cx, cz) covers world x in [cx * tileSize, (cx + 1) * tileSize], same for z.
 */
export class Maze {
  constructor(cols, rows, tiles, tileSize = 1) {
    this.cols = cols;
    this.rows = rows;
    this.tiles = tiles;
    this.tileSize = tileSize;
    this.seed = null;
    this.spawns = { player: null, enemy: null };
    this.lamps = [];
  }

  /** Random maze from a seed: carve a perfect maze, then braid some dead ends into loops. */
  static generate({ cols = 21, rows = 21, seed = 1, braid = 0.5, tileSize = 1 } = {}) {
    cols = toOdd(Math.max(5, cols));
    rows = toOdd(Math.max(5, rows));
    const rng = createRng(seed);
    const maze = new Maze(cols, rows, new Uint8Array(cols * rows).fill(WALL), tileSize);
    maze.seed = seed;

    carve(maze, rng);
    braidDeadEnds(maze, rng, braid);

    // Opposite corners, so the player and the bot start equally far from everything.
    maze.spawns.player = { cx: 1, cz: 1 };
    maze.spawns.enemy = { cx: cols - 2, cz: rows - 2 };
    maze.lamps = placeLamps(maze, rng);
    return maze;
  }

  /**
   * Hand-drawn layout: '#' is wall, anything else is floor.
   * Markers: P = player spawn, E = enemy spawn, L = lamp.
   */
  static fromAscii(text, tileSize = 1) {
    const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
    const rows = lines.length;
    const cols = Math.max(...lines.map((line) => line.length));
    const maze = new Maze(cols, rows, new Uint8Array(cols * rows).fill(WALL), tileSize);

    lines.forEach((line, cz) => {
      [...line].forEach((ch, cx) => {
        if (ch === '#') return;
        maze.setTile(cx, cz, OPEN);
        if (ch === 'P') maze.spawns.player = { cx, cz };
        else if (ch === 'E') maze.spawns.enemy = { cx, cz };
        else if (ch === 'L') maze.lamps.push({ cx, cz });
      });
    });

    const open = maze.openCells();
    maze.spawns.player ??= open[0];
    maze.spawns.enemy ??= open[open.length - 1];
    return maze;
  }

  toAscii() {
    const marker = new Map();
    for (const { cx, cz } of this.lamps) marker.set(`${cx},${cz}`, 'L');
    if (this.spawns.enemy) marker.set(`${this.spawns.enemy.cx},${this.spawns.enemy.cz}`, 'E');
    if (this.spawns.player) marker.set(`${this.spawns.player.cx},${this.spawns.player.cz}`, 'P');

    const lines = [];
    for (let cz = 0; cz < this.rows; cz++) {
      let line = '';
      for (let cx = 0; cx < this.cols; cx++) {
        line += this.isWall(cx, cz) ? '#' : (marker.get(`${cx},${cz}`) ?? '.');
      }
      lines.push(line);
    }
    return lines.join('\n');
  }

  inBounds(cx, cz) {
    return cx >= 0 && cz >= 0 && cx < this.cols && cz < this.rows;
  }

  /** Anything outside the grid counts as wall. */
  isWall(cx, cz) {
    return !this.inBounds(cx, cz) || this.tiles[cz * this.cols + cx] === WALL;
  }

  isOpen(cx, cz) {
    return !this.isWall(cx, cz);
  }

  setTile(cx, cz, value) {
    this.tiles[cz * this.cols + cx] = value;
  }

  openNeighbourCount(cx, cz) {
    let count = 0;
    for (const [dx, dz] of DIRS) if (this.isOpen(cx + dx, cz + dz)) count++;
    return count;
  }

  openCells() {
    const cells = [];
    for (let cz = 0; cz < this.rows; cz++) {
      for (let cx = 0; cx < this.cols; cx++) {
        if (this.isOpen(cx, cz)) cells.push({ cx, cz });
      }
    }
    return cells;
  }

  cellAt(x, z) {
    return { cx: Math.floor(x / this.tileSize), cz: Math.floor(z / this.tileSize) };
  }

  cellCenter(cx, cz) {
    return { x: (cx + 0.5) * this.tileSize, z: (cz + 0.5) * this.tileSize };
  }

  /** Direction {dx, dz} from a tile into its first open neighbour, for facing a spawn down a corridor. */
  openDirection(cx, cz) {
    const dir = DIRS.find(([dx, dz]) => this.isOpen(cx + dx, cz + dz)) ?? DIRS[0];
    return { dx: dir[0], dz: dir[1] };
  }
}

function toOdd(n) {
  return n % 2 === 0 ? n + 1 : n;
}

// Recursive backtracker over odd tiles: rooms sit on odd coordinates, the walls between
// them on even ones. The result is a perfect maze (exactly one route between any two points).
function carve(maze, rng) {
  maze.setTile(1, 1, OPEN);
  const stack = [[1, 1]];
  while (stack.length) {
    const [cx, cz] = stack[stack.length - 1];
    const options = DIRS.filter(([dx, dz]) => {
      const nx = cx + dx * 2;
      const nz = cz + dz * 2;
      return nx > 0 && nz > 0 && nx < maze.cols - 1 && nz < maze.rows - 1 && maze.isWall(nx, nz);
    });
    if (!options.length) {
      stack.pop();
      continue;
    }
    const [dx, dz] = rng.pick(options);
    maze.setTile(cx + dx, cz + dz, OPEN);
    maze.setTile(cx + dx * 2, cz + dz * 2, OPEN);
    stack.push([cx + dx * 2, cz + dz * 2]);
  }
}

// Knock through walls at dead ends so the maze has loops. Without loops there is
// nowhere to run, flank or circle back, which a chase between rats needs.
function braidDeadEnds(maze, rng, chance) {
  const deadEnds = rng.shuffle(maze.openCells().filter(({ cx, cz }) => maze.openNeighbourCount(cx, cz) === 1));
  for (const { cx, cz } of deadEnds) {
    if (maze.openNeighbourCount(cx, cz) !== 1) continue; // an earlier knock already opened it
    if (rng.next() >= chance) continue;

    const options = DIRS.filter(([dx, dz]) => {
      const wx = cx + dx;
      const wz = cz + dz;
      const interior = wx > 0 && wz > 0 && wx < maze.cols - 1 && wz < maze.rows - 1;
      return interior && maze.isWall(wx, wz) && maze.isOpen(cx + dx * 2, cz + dz * 2);
    });
    if (!options.length) continue;

    // Joining two dead ends fixes both with one knock.
    const intoDeadEnd = options.filter(([dx, dz]) => maze.openNeighbourCount(cx + dx * 2, cz + dz * 2) === 1);
    const [dx, dz] = rng.pick(intoDeadEnd.length ? intoDeadEnd : options);
    maze.setTile(cx + dx, cz + dz, OPEN);
  }
}

// A few lamps spread apart: pools of light between long dark stretches.
function placeLamps(maze, rng) {
  const cells = rng.shuffle(maze.openCells());
  const count = Math.max(2, Math.min(8, Math.round(cells.length / 35)));

  for (let gap = Math.floor(Math.sqrt((maze.cols * maze.rows) / count)); gap >= 1; gap--) {
    const lamps = [];
    for (const cell of cells) {
      const farEnough = lamps.every((l) => Math.abs(l.cx - cell.cx) + Math.abs(l.cz - cell.cz) >= gap);
      if (farEnough) lamps.push(cell);
      if (lamps.length === count) return lamps;
    }
  }
  return cells.slice(0, count);
}
