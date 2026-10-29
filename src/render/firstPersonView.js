import * as THREE from 'three';
import { EYE_HEIGHT } from '../config.js';

const STEP_LENGTH = 0.9;  // world units per footstep
const BOB_UP = 0.045;
const BOB_SIDE = 0.025;

/** Puts the camera at the rat's eyes, with a light head-bob while walking. */
export class FirstPersonView {
  constructor(camera) {
    this.camera = camera;
    this.phase = 0;
    this.amount = 0;
    this.last = null;

    // The rat's own dim light: you can see a few steps around you and no further.
    this.light = new THREE.PointLight(0xffdcb0, 2.8, 11, 2);
    this.light.position.set(0, 0.15, 0.2);
    camera.add(this.light);
  }

  /**
   * @param alpha how far we are between the last two simulation ticks (0..1)
   * @param yaw, pitch view angles straight from the mouse, so looking never lags a tick
   */
  update(rat, alpha, yaw, pitch, dt) {
    const x = rat.prevX + (rat.x - rat.prevX) * alpha;
    const z = rat.prevZ + (rat.z - rat.prevZ) * alpha;

    const moved = this.last ? Math.hypot(x - this.last.x, z - this.last.z) : 0;
    this.last = { x, z };
    const speed = dt > 0 ? moved / dt : 0;
    // Ease the bob in and out so stopping doesn't snap the camera.
    this.amount += (Math.min(1, speed / rat.speed) - this.amount) * Math.min(1, dt * 10);
    this.phase += (moved / STEP_LENGTH) * Math.PI;

    const up = Math.abs(Math.sin(this.phase)) * BOB_UP * this.amount;
    const side = Math.cos(this.phase) * BOB_SIDE * this.amount;
    this.camera.position.set(
      x + Math.cos(yaw) * side,
      EYE_HEIGHT + up - BOB_UP * 0.5 * this.amount,
      z - Math.sin(yaw) * side,
    );
    this.camera.rotation.set(pitch, yaw, 0, 'YXZ');
  }
}
