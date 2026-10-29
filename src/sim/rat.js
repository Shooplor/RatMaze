import { moveCircle } from './collision.js';

const MAX_PITCH = Math.PI / 2 - 0.01;

/**
 * A rat in the maze. The player and the bot are both Rats: the keyboard, the AI brain
 * and later the network all drive one by sending the same command each tick:
 *   { forward, right }  movement, each -1..1, relative to where the rat faces
 *   { yaw, pitch }      absolute view angles in radians
 */
export class Rat {
  constructor({ x, z, yaw = 0, radius, speed }) {
    this.x = x;
    this.z = z;
    this.prevX = x; // position one tick ago, so rendering can blend between ticks
    this.prevZ = z;
    this.yaw = yaw;
    this.pitch = 0;
    this.radius = radius;
    this.speed = speed;
  }

  applyCommand(cmd, dt, maze) {
    this.prevX = this.x;
    this.prevZ = this.z;
    this.yaw = cmd.yaw;
    this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, cmd.pitch));

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
    const step = this.speed * dt;
    const dx = (-sin * forward + cos * right) * step;
    const dz = (-cos * forward - sin * right) * step;
    ({ x: this.x, z: this.z } = moveCircle(maze, this.x, this.z, this.radius, dx, dz));
  }
}

/** Yaw that faces along a grid direction. */
export function yawFor(dx, dz) {
  return Math.atan2(-dx, -dz);
}
