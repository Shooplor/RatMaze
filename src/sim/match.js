import { OPEN } from './maze.js';
import { CheeseField } from './cheese.js';

/**
 * The rules of one round. Rats gather cheese; once the maze is empty the exit door opens;
 * the first rat through the door banks the cheese it carries and ends the round.
 *
 * Everything that happens is queued as an event ('collected', 'exitOpened', 'escaped')
 * so the screen, the sounds and later the network can react without knowing the rules.
 */
export class Match {
  constructor(maze, rats, { reach }) {
    this.maze = maze;
    this.rats = rats;
    this.reach = reach;
    // No cheese where a rat starts: it would be taken before anyone sees it.
    this.cheese = new CheeseField(maze, { skip: rats.map((rat) => maze.cellAt(rat.x, rat.z)) });
    this.state = 'collecting'; // then 'exitOpen', then 'over'
    this.time = 0;
    this.winner = null;
    this.events = [];
  }

  /** Call once per simulation tick, after the rats have moved. */
  update(dt) {
    if (this.state === 'over') return;
    this.time += dt;

    for (const rat of this.rats) {
      const tiles = this.cheese.collectNear(rat.x, rat.z, this.reach);
      if (tiles.length) this.give(rat, tiles);
    }

    if (this.state === 'collecting' && this.cheese.remaining === 0) this.openExit();

    if (this.state === 'exitOpen') {
      const rat = this.rats.find((r) => this.isInExit(r));
      if (rat) {
        rat.delivered += rat.carried;
        rat.carried = 0;
        this.state = 'over';
        this.winner = rat;
        this.events.push({ type: 'escaped', rat });
      }
    }
  }

  /** Testing shortcut: hands every piece left in the maze to one rat. */
  giveAllCheese(rat) {
    if (this.state !== 'collecting') return;
    this.give(rat, this.cheese.takeAll());
  }

  drainEvents() {
    const events = this.events;
    this.events = [];
    return events;
  }

  give(rat, tiles) {
    rat.carried += tiles.length;
    this.events.push({ type: 'collected', rat, tiles });
  }

  openExit() {
    const { exit } = this.maze;
    if (!exit) return;
    this.maze.setTile(exit.cx, exit.cz, OPEN);
    this.state = 'exitOpen';
    this.events.push({ type: 'exitOpened' });
  }

  isInExit(rat) {
    const { cx, cz } = this.maze.cellAt(rat.x, rat.z);
    return cx === this.maze.exit.cx && cz === this.maze.exit.cz;
  }
}
