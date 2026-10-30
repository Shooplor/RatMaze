import { moveCircle } from './collision.js';

const MAX_PITCH = Math.PI / 2 - 0.01;

/**
 * A rat in the maze. The player and the bot are both Rats: the keyboard, the AI brain
 * and later the network all drive one by sending the same command each tick:
 *   { forward, right }  movement, each -1..1, relative to where the rat faces
 *   { yaw, pitch }      absolute view angles in radians
 *   { suck, fire }      vacuum held, trigger held
 *   { sneak, crouch }   Shift held (quiet steps), crouched (silent steps)
 */
export class Rat {
  constructor({
    x, z, yaw = 0, radius, speed,
    suckSpeedFactor = 0.5, sneakSpeedFactor = 0.55, crouchSpeedFactor = 0.45,
  }) {
    this.x = x;
    this.z = z;
    this.prevX = x; // position one tick ago, so rendering can blend between ticks
    this.prevZ = z;
    this.yaw = yaw;
    this.pitch = 0;
    this.radius = radius;
    this.speed = speed;
    this.suckSpeedFactor = suckSpeedFactor;
    this.sneakSpeedFactor = sneakSpeedFactor;
    this.crouchSpeedFactor = crouchSpeedFactor;
    this.sucking = false;
    this.suckTime = 0; // seconds the vacuum has been running without a break
    this.firing = false;
    this.fireCooldown = 0;
    this.sneaking = false;
    this.crouching = false;
    this.stepProgress = 0; // distance walked since the last footstep
    this.carried = 0;   // cheese in the gun's jar: ammo, and what gets banked at the exit
    this.delivered = 0; // cheese banked at the exit: the score
  }

  applyCommand(cmd, dt, maze) {
    this.prevX = this.x;
    this.prevZ = this.z;
    this.yaw = cmd.yaw;
    this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, cmd.pitch));
    this.sucking = Boolean(cmd.suck);
    this.suckTime = this.sucking ? this.suckTime + dt : 0;
    this.firing = Boolean(cmd.fire);
    this.crouching = Boolean(cmd.crouch);
    this.sneaking = Boolean(cmd.sneak) && !this.crouching;

    let forward = cmd.forward;
    let right = cmd.right;
    const len = Math.hypot(forward, right);
    if (len > 1) {
      forward /= len; // diagonal movement is no faster than straight
      right /= len;
    }

    // Yaw 0 faces -z, matching the three.js camera.
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const step = this.speed * this.speedFactor() * dt;
    const dx = (-sin * forward + cos * right) * step;
    const dz = (-cos * forward - sin * right) * step;
    ({ x: this.x, z: this.z } = moveCircle(maze, this.x, this.z, this.radius, dx, dz));
  }

  speedFactor() {
    const stance = this.crouching ? this.crouchSpeedFactor : this.sneaking ? this.sneakSpeedFactor : 1;
    return stance * (this.sucking ? this.suckSpeedFactor : 1);
  }
}

/** Yaw that faces along a grid direction. */
export function yawFor(dx, dz) {
  return Math.atan2(-dx, -dz);
}
