import test from 'node:test';
import assert from 'node:assert/strict';
import { Maze } from '../src/sim/maze.js';
import { Match } from '../src/sim/match.js';
import { Rat, yawFor } from '../src/sim/rat.js';

const T = 2;
const R = 0.3;
const RULES = {
  eyeHeight: 1.5,
  ceilingHeight: 2,
  cheeseHeight: 0.9,
  suckRange: 4.5,
  suckAngle: 30,
  suckGrabRadius: 1,
  suckPullMin: 2.5,
  suckPullMax: 11,
  suckSpeedFactor: 0.5,
  collectDistance: 0.45,
  shotSpeed: 26,
  shotGravity: 3,
  shotCooldown: 0.25,
  shotCost: 1,
  shotLifetime: 3,
  muzzle: { right: 0.2, down: 0.2, forward: 0.8 },
  crouchEyeHeight: 1,
  stepLength: 0.85,
  walkLoudness: 1,
  sneakLoudness: 0.3,
  crouchLoudness: 0,
  vacuumStartLoudness: 0.2,
  vacuumRampTime: 3,
  hearingRange: 16,
};
const EAST = yawFor(1, 0);
const NORTH = yawFor(0, -1);

function setup(layout = `
  #####D#
  #P....#
  #######
`) {
  const maze = Maze.fromAscii(layout, T);
  const start = maze.cellCenter(maze.spawns.player.cx, maze.spawns.player.cz);
  const rat = new Rat({ x: start.x, z: start.z, radius: R, speed: 4, suckSpeedFactor: RULES.suckSpeedFactor });
  const match = new Match(maze, [rat], RULES);
  return { maze, rat, match };
}

function run(rat, match, maze, cmd, seconds) {
  for (let t = 0; t < seconds; t += 1 / 60) {
    rat.applyCommand({ forward: 0, right: 0, yaw: rat.yaw, pitch: 0, ...cmd }, 1 / 60, maze);
    match.update(1 / 60);
  }
}

const types = (match) => match.drainEvents().map((e) => e.type);

test('cheese sits on every open tile except where the rat starts', () => {
  const { match } = setup();
  assert.equal(match.cheese.total, 4);
  assert.ok(match.cheese.pieces.every((p) => p.x !== 1.5 * T));
});

test('walking through cheese without the vacuum takes nothing', () => {
  const { maze, rat, match } = setup();
  run(rat, match, maze, { forward: 1, yaw: EAST }, 3);
  assert.equal(rat.carried, 0);
  assert.equal(match.cheese.remaining, 4);
});

test('the vacuum pulls cheese in front of you into the gun', () => {
  const { maze, rat, match } = setup();
  // Standing still at the west end, aiming east: the next two tiles (2 and 4 units away) are in reach.
  run(rat, match, maze, { suck: true, yaw: EAST }, 1.5);
  assert.equal(rat.carried, 2);
  assert.equal(match.cheese.remaining, 2);
  assert.deepEqual([...new Set(types(match))], ['collected']);
});

test('the vacuum does not pull cheese behind you or through walls', () => {
  const { maze, rat, match } = setup();
  run(rat, match, maze, { suck: true, yaw: yawFor(-1, 0) }, 2); // aiming west, cheese is east
  assert.equal(rat.carried, 0);

  // Two parallel corridors: cheese on the other side of a wall stays put.
  const two = setup(`
    #######
    #P....#
    #######
    #.....#
    #######
  `);
  run(two.rat, two.match, two.maze, { suck: true, yaw: yawFor(0, 1) }, 2); // aiming south at the wall
  assert.equal(two.rat.carried, 0);
});

test('a piece pulled part way stays where it was left', () => {
  const { maze, rat, match } = setup();
  const far = match.cheese.pieces.find((p) => p.x === 4.5 * T); // 6 units away: out of reach
  rat.x = rat.prevX = 2.5 * T; // now the 4.5 piece is 4 units away, at the edge of reach
  run(rat, match, maze, { suck: true, yaw: EAST }, 0.1);
  const moved = far.x;
  assert.ok(moved < 4.5 * T, 'it was pulled toward the gun');
  run(rat, match, maze, { yaw: EAST }, 0.5);
  assert.equal(far.x, moved, 'and stops when the vacuum stops');
  assert.equal(far.taken, false);
});

test('sucking halves walking speed', () => {
  const a = setup();
  const b = setup();
  run(a.rat, a.match, a.maze, { forward: 1, yaw: EAST }, 0.5);
  run(b.rat, b.match, b.maze, { forward: 1, suck: true, yaw: EAST }, 0.5);
  const start = 1.5 * T;
  assert.ok(Math.abs((b.rat.x - start) * 2 - (a.rat.x - start)) < 0.05);
});

test('shooting costs one cheese per shot, at most four shots a second', () => {
  const { maze, rat, match } = setup();
  rat.carried = 10;
  run(rat, match, maze, { fire: true, yaw: EAST }, 1);
  assert.equal(rat.carried, 6);
  assert.equal(types(match).filter((t) => t === 'fired').length, 4);
});

test('with no cheese the gun only clicks', () => {
  const { maze, rat, match } = setup();
  run(rat, match, maze, { fire: true, yaw: EAST }, 0.1);
  assert.equal(match.shots.length, 0);
  assert.deepEqual(types(match), ['dryFire']);
});

test('a shot flies toward the crosshair and splats on the wall', () => {
  const { maze, rat, match } = setup();
  rat.carried = 1;
  run(rat, match, maze, { fire: true, yaw: EAST }, 1 / 60);
  const [shot] = match.shots;
  assert.ok(shot.vx > 20, 'heading east');
  run(rat, match, maze, { yaw: EAST }, 1);
  assert.equal(match.shots.length, 0);
  const hit = match.drainEvents().find((e) => e.type === 'shotHit');
  assert.ok(hit.x > 5.5 * T && hit.x <= 6 * T, `splat near the east wall, at x = ${hit.x}`);
});

test('the exit opens once the maze is empty, and the first rat through wins', () => {
  const { maze, rat, match } = setup();
  rat.x = rat.prevX = 5.5 * T; // under the door
  run(rat, match, maze, { forward: 1, yaw: NORTH }, 1);
  assert.ok(rat.z >= 1 * T + R - 1e-9, 'the closed door blocks');

  match.giveAllCheese(rat);
  match.update(1 / 60);
  assert.equal(match.state, 'exitOpen');
  assert.ok(maze.isOpen(5, 0));

  run(rat, match, maze, { forward: 1, yaw: NORTH }, 1);
  assert.equal(match.state, 'over');
  assert.equal(match.winner, rat);
  assert.equal(rat.delivered, 4);
  assert.equal(rat.carried, 0);
  const rules = types(match).filter((t) => t !== 'collected' && t !== 'footstep');
  assert.deepEqual(rules, ['exitOpened', 'escaped']);
});

test('walking makes a footstep every step length; sneaking is quieter and slower; crouching is silent', () => {
  const steps = (stance) => {
    const { maze, rat, match } = setup();
    run(rat, match, maze, { forward: 1, yaw: EAST, ...stance }, 1);
    const events = match.drainEvents().filter((e) => e.type === 'footstep');
    return { count: events.length, loudness: events[0]?.loudness, walked: rat.x - 1.5 * T };
  };
  const walk = steps({});
  const sneak = steps({ sneak: true });
  const crouch = steps({ crouch: true });

  assert.equal(walk.count, Math.floor(walk.walked / 0.85));
  assert.equal(walk.loudness, 1);
  assert.equal(sneak.loudness, 0.3);
  assert.ok(sneak.walked < walk.walked * 0.6, 'sneaking is slower');
  assert.equal(crouch.count, 0, 'crouched steps make no sound');
  assert.ok(crouch.walked < sneak.walked, 'crouching is slowest');
});

test('standing still makes no footsteps', () => {
  const { maze, rat, match } = setup();
  run(rat, match, maze, { yaw: EAST }, 2);
  assert.equal(match.drainEvents().filter((e) => e.type === 'footstep').length, 0);
});

test('the vacuum starts quiet and reaches full noise after the ramp time', () => {
  const { maze, rat, match } = setup();
  assert.equal(match.vacuumLoudness(rat), 0);
  run(rat, match, maze, { suck: true, yaw: yawFor(-1, 0) }, 0.1);
  const early = match.vacuumLoudness(rat);
  run(rat, match, maze, { suck: true, yaw: yawFor(-1, 0) }, 1.4);
  const middle = match.vacuumLoudness(rat);
  run(rat, match, maze, { suck: true, yaw: yawFor(-1, 0) }, 2);
  const late = match.vacuumLoudness(rat);
  assert.ok(early < 0.25 && early >= 0.2, `early ${early}`);
  assert.ok(middle > early && middle < late, `middle ${middle}`);
  assert.equal(late, 1);

  run(rat, match, maze, { yaw: yawFor(-1, 0) }, 1 / 60); // let go
  assert.equal(match.vacuumLoudness(rat), 0);
  run(rat, match, maze, { suck: true, yaw: yawFor(-1, 0) }, 0.1);
  assert.ok(match.vacuumLoudness(rat) < 0.25, 'starts quiet again');
});

test('crouching lowers the gun, so shots start lower', () => {
  const { rat, match } = setup();
  const standing = match.muzzle(rat).y;
  rat.crouching = true;
  assert.ok(match.muzzle(rat).y < standing - 0.4);
});
