const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * TESTING ONLY: drives a rat that wanders the corridors at random, so there is another
 * rat to hear before the real rival exists. It walks from tile centre to tile centre and
 * at each junction picks a new way, avoiding turning back unless it hits a dead end.
 * It produces the same commands as the keyboard, like every rat controller.
 */
export class WanderBrain {
  constructor(maze, rat, random = Math.random) {
    this.maze = maze;
    this.rat = rat;
    this.random = random;
    this.target = null;
    this.heading = null; // [dx, dz] of the last move
  }

  command() {
    const { rat } = this;
    if (!this.target || Math.hypot(this.target.x - rat.x, this.target.z - rat.z) < 0.12) {
      this.pickNextTile();
    }
    return {
      forward: 1,
      right: 0,
      yaw: Math.atan2(-(this.target.x - rat.x), -(this.target.z - rat.z)),
      pitch: 0,
    };
  }

  pickNextTile() {
    const { maze, rat } = this;
    const { cx, cz } = maze.cellAt(rat.x, rat.z);
    const exit = maze.exit;
    const open = DIRS.filter(([dx, dz]) => {
      const isExit = exit && cx + dx === exit.cx && cz + dz === exit.cz;
      return maze.isOpen(cx + dx, cz + dz) && !isExit;
    });
    const back = this.heading && open.find(([dx, dz]) => dx === -this.heading[0] && dz === -this.heading[1]);
    const choices = open.length > 1 && back ? open.filter((d) => d !== back) : open;
    const [dx, dz] = choices[Math.floor(this.random() * choices.length)] ?? [0, 0];
    this.heading = [dx, dz];
    this.target = maze.cellCenter(cx + dx, cz + dz);
  }
}
