import { OPEN } from './maze.js';
import { CheeseField } from './cheese.js';

/**
 * The rules of one round. Rats vacuum up cheese with their guns and can shoot it back
 * out as ammo. Once the maze is empty the exit door opens; the first rat through it
 * banks the cheese it carries and ends the round.
 *
 * Everything that happens is queued as an event ('footstep', 'collected', 'fired',
 * 'dryFire', 'shotHit', 'exitOpened', 'escaped') so the screen, the sounds and later the
 * network can react without knowing the rules.
 *
 * `rules` holds the numbers (see RULES in config.js): heights, vacuum reach and pull,
 * shot speed and cost, and where the gun's nozzle sits relative to the eye.
 */
export class Match {
  constructor(maze, rats, rules) {
    this.maze = maze;
    this.rats = rats;
    this.rules = rules;
    // No cheese where a rat starts: it would be taken before anyone sees it.
    this.cheese = new CheeseField(maze, {
      skip: rats.map((rat) => maze.cellAt(rat.x, rat.z)),
      height: rules.cheeseHeight,
    });
    this.shots = [];
    this.nextShotId = 1;
    this.state = 'collecting'; // then 'exitOpen', then 'over'
    this.time = 0;
    this.winner = null;
    this.events = [];
  }

  /** Call once per simulation tick, after the rats have moved. */
  update(dt) {
    if (this.state === 'over') return;
    this.time += dt;

    for (const piece of this.cheese.pieces) piece.pulled = false;
    for (const rat of this.rats) {
      this.footsteps(rat);
      if (rat.sucking) this.suck(rat, dt);
      this.shoot(rat, dt);
    }
    this.moveShots(dt);

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

  /** A rat joining after the start (the testing wanderer, later late joiners). */
  addRat(rat) {
    this.rats.push(rat);
  }

  removeRat(rat) {
    this.rats = this.rats.filter((r) => r !== rat);
  }

  /** How loud a rat's vacuum is: quiet when switched on, full after a few seconds held. */
  vacuumLoudness(rat) {
    if (!rat.sucking) return 0;
    const { vacuumStartLoudness: start, vacuumRampTime: ramp } = this.rules;
    const t = Math.min(1, rat.suckTime / ramp);
    return start + (1 - start) * t * t;
  }

  /** How loud a rat's footsteps are in its current stance. */
  stepLoudness(rat) {
    const r = this.rules;
    return rat.crouching ? r.crouchLoudness : rat.sneaking ? r.sneakLoudness : r.walkLoudness;
  }

  /** Testing shortcut: hands every piece left in the maze to one rat. */
  giveAllCheese(rat) {
    if (this.state !== 'collecting') return;
    for (const piece of this.cheese.takeAll()) {
      rat.carried++;
      this.events.push({ type: 'collected', rat, piece });
    }
  }

  drainEvents() {
    const events = this.events;
    this.events = [];
    return events;
  }

  // One footstep every stepLength walked. Silent steps (crouched) still count, so a rat
  // standing up mid-stride doesn't get a free step.
  footsteps(rat) {
    rat.stepProgress += Math.hypot(rat.x - rat.prevX, rat.z - rat.prevZ);
    if (rat.stepProgress < this.rules.stepLength) return;
    rat.stepProgress -= this.rules.stepLength;
    const loudness = this.stepLoudness(rat);
    if (loudness > 0) this.events.push({ type: 'footstep', rat, x: rat.x, z: rat.z, loudness });
  }

  // The vacuum: pulls cheese in a cone in front of the rat toward its gun's nozzle,
  // faster the closer it gets. Only cheese the rat can see; walls block the pull.
  suck(rat, dt) {
    const r = this.rules;
    const mouth = this.muzzle(rat);
    const aimX = -Math.sin(rat.yaw);
    const aimZ = -Math.cos(rat.yaw);
    const coneCos = Math.cos((r.suckAngle * Math.PI) / 180);

    for (const piece of this.cheese.pieces) {
      if (piece.taken) continue;
      const dx = piece.x - rat.x;
      const dz = piece.z - rat.z;
      const flat = Math.hypot(dx, dz);
      if (flat > r.suckRange) continue;
      const inCone = flat <= r.suckGrabRadius || (dx * aimX + dz * aimZ) / flat >= coneCos;
      if (!inCone || !this.maze.lineOfSight(rat.x, rat.z, piece.x, piece.z)) continue;

      const tx = mouth.x - piece.x;
      const ty = mouth.y - piece.y;
      const tz = mouth.z - piece.z;
      const dist = Math.hypot(tx, ty, tz);
      const closeness = 1 - Math.min(1, flat / r.suckRange);
      const speed = r.suckPullMin + (r.suckPullMax - r.suckPullMin) * closeness * closeness;
      const step = Math.min(dist, speed * dt);
      piece.x += (tx / dist) * step;
      piece.y += (ty / dist) * step;
      piece.z += (tz / dist) * step;
      piece.pulled = true;

      if (dist - step <= r.collectDistance) {
        this.cheese.take(piece);
        rat.carried++;
        this.events.push({ type: 'collected', rat, piece });
      }
    }
  }

  // Left click: one carried piece of cheese flies from the nozzle toward the crosshair.
  shoot(rat, dt) {
    const r = this.rules;
    rat.fireCooldown = Math.max(0, rat.fireCooldown - dt);
    if (!rat.firing || rat.fireCooldown > 0) return;
    rat.fireCooldown = r.shotCooldown;
    if (rat.carried < r.shotCost) {
      this.events.push({ type: 'dryFire', rat });
      return;
    }
    rat.carried -= r.shotCost;

    const from = this.muzzle(rat);
    const to = this.aimPoint(rat);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    const shot = {
      id: this.nextShotId++,
      owner: rat,
      ...from,
      prevX: from.x,
      prevY: from.y,
      prevZ: from.z,
      vx: (dx / len) * r.shotSpeed,
      vy: (dy / len) * r.shotSpeed,
      vz: (dz / len) * r.shotSpeed,
      age: 0,
    };
    this.shots.push(shot);
    this.events.push({ type: 'fired', rat, shot });
  }

  moveShots(dt) {
    const r = this.rules;
    this.shots = this.shots.filter((shot) => {
      shot.prevX = shot.x;
      shot.prevY = shot.y;
      shot.prevZ = shot.z;
      shot.vy -= r.shotGravity * dt;
      const x = shot.x + shot.vx * dt;
      const y = shot.y + shot.vy * dt;
      const z = shot.z + shot.vz * dt;
      shot.age += dt;
      const { cx, cz } = this.maze.cellAt(x, z);
      if (this.maze.isWall(cx, cz) || y <= 0 || y >= r.ceilingHeight || shot.age > r.shotLifetime) {
        this.events.push({ type: 'shotHit', shot, x: shot.x, y: shot.y, z: shot.z });
        return false;
      }
      shot.x = x;
      shot.y = y;
      shot.z = z;
      return true;
    });
  }

  eyeHeight(rat) {
    return rat.crouching ? this.rules.crouchEyeHeight : this.rules.eyeHeight;
  }

  /** Where the gun's nozzle is: in front of the eye, a little right and down. */
  muzzle(rat) {
    const { right, down, forward } = this.rules.muzzle;
    const { f, r, u } = viewBasis(rat.yaw, rat.pitch);
    return {
      x: rat.x + f.x * forward + r.x * right - u.x * down,
      y: this.eyeHeight(rat) + f.y * forward + r.y * right - u.y * down,
      z: rat.z + f.z * forward + r.z * right - u.z * down,
    };
  }

  /** The first wall, floor or ceiling straight ahead of the eye: what the crosshair is on. */
  aimPoint(rat) {
    const { f } = viewBasis(rat.yaw, rat.pitch);
    const STEP = 0.1;
    const MAX = 40;
    let x = rat.x;
    let y = this.eyeHeight(rat);
    let z = rat.z;
    for (let d = 0; d < MAX; d += STEP) {
      const { cx, cz } = this.maze.cellAt(x + f.x * STEP, z + f.z * STEP);
      const ny = y + f.y * STEP;
      if (this.maze.isWall(cx, cz) || ny <= 0 || ny >= this.rules.ceilingHeight) break;
      x += f.x * STEP;
      y = ny;
      z += f.z * STEP;
    }
    return { x, y, z };
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

// Forward, right and up directions of a view (yaw 0 faces -z, matching the camera).
function viewBasis(yaw, pitch) {
  const cp = Math.cos(pitch);
  const f = { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
  const r = { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) };
  const u = { x: r.y * f.z - r.z * f.y, y: r.z * f.x - r.x * f.z, z: r.x * f.y - r.y * f.x };
  return { f, r, u };
}
