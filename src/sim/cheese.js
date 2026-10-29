/**
 * The cheese spread through the maze: one piece on every open tile, Pac-Man style.
 * Nothing else marks where rats have been: an empty corridor means someone already
 * passed through, floating cheese means nobody has.
 */
export class CheeseField {
  constructor(maze, { skip = [] } = {}) {
    this.maze = maze;
    this.present = new Uint8Array(maze.cols * maze.rows);
    const skipped = new Set(skip.map(({ cx, cz }) => cz * maze.cols + cx));
    for (const { cx, cz } of maze.openCells()) {
      const i = cz * maze.cols + cx;
      if (!skipped.has(i)) this.present[i] = 1;
    }
    this.total = this.present.reduce((sum, v) => sum + v, 0);
    this.remaining = this.total;
  }

  has(cx, cz) {
    return this.maze.inBounds(cx, cz) && this.present[cz * this.maze.cols + cx] === 1;
  }

  /** Takes every piece whose tile centre is within `reach` of (x, z). Returns the tiles taken. */
  collectNear(x, z, reach) {
    const t = this.maze.tileSize;
    const taken = [];
    for (let cz = Math.floor((z - reach) / t); cz <= Math.floor((z + reach) / t); cz++) {
      for (let cx = Math.floor((x - reach) / t); cx <= Math.floor((x + reach) / t); cx++) {
        if (!this.has(cx, cz)) continue;
        const centre = this.maze.cellCenter(cx, cz);
        if (Math.hypot(centre.x - x, centre.z - z) <= reach) taken.push(this.take(cx, cz));
      }
    }
    return taken;
  }

  /** Takes every piece left. */
  takeAll() {
    return this.remainingTiles().map(({ cx, cz }) => this.take(cx, cz));
  }

  remainingTiles() {
    const tiles = [];
    for (let i = 0; i < this.present.length; i++) {
      if (this.present[i]) tiles.push({ cx: i % this.maze.cols, cz: Math.floor(i / this.maze.cols) });
    }
    return tiles;
  }

  take(cx, cz) {
    this.present[cz * this.maze.cols + cx] = 0;
    this.remaining--;
    return { cx, cz };
  }
}
