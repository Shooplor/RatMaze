/**
 * The cheese in the maze: one floating piece on every open tile to start, Pac-Man style.
 * Nothing else marks where rats have been: an empty corridor means someone already
 * cleared it, floating cheese means nobody has.
 *
 * A vacuum gun can drag pieces out of place, so each piece keeps its own position.
 */
export class CheeseField {
  constructor(maze, { skip = [], height = 0 } = {}) {
    const skipped = new Set(skip.map(({ cx, cz }) => `${cx},${cz}`));
    this.pieces = maze
      .openCells()
      .filter(({ cx, cz }) => !skipped.has(`${cx},${cz}`))
      .map(({ cx, cz }, id) => ({ id, ...maze.cellCenter(cx, cz), y: height, taken: false, pulled: false }));
    this.total = this.pieces.length;
    this.remaining = this.total;
  }

  take(piece) {
    piece.taken = true;
    piece.pulled = false;
    this.remaining--;
  }

  /** Takes every piece left. */
  takeAll() {
    const left = this.pieces.filter((piece) => !piece.taken);
    left.forEach((piece) => this.take(piece));
    return left;
  }
}
