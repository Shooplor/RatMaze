import * as THREE from 'three';
import { EYE_HEIGHT, STRAFE_TILT } from '../config.js';

const MAX_ROLL = THREE.MathUtils.degToRad(STRAFE_TILT);
const ROLL_EASE = 8; // how quickly the tilt follows movement; higher is snappier

/**
 * Puts the camera at the rat's eyes. There is no head-bob (it was hard on the eyes);
 * instead the view leans slightly while strafing, which reads as motion
 * without shaking the picture.
 */
export class FirstPersonView {
  constructor(camera) {
    this.camera = camera;
    this.roll = 0;

    // The rat's own dim light: you can see a few steps around you and no further.
    this.light = new THREE.PointLight(0xffdcb0, 2.8, 11, 2);
    this.light.position.set(0, 0.15, 0.2);
    camera.add(this.light);
  }

  /**
   * @param alpha how far we are between the last two simulation ticks (0..1)
   * @param cmd the player's current command: view angles straight from the mouse (so looking
   *   never lags a tick) and the strafe input, -1 for A, +1 for D
   */
  update(rat, alpha, cmd, dt) {
    this.camera.position.set(
      rat.prevX + (rat.x - rat.prevX) * alpha,
      EYE_HEIGHT,
      rat.prevZ + (rat.z - rat.prevZ) * alpha,
    );

    // A leans left (positive roll), D leans right; ease in and out so it never snaps.
    const target = -cmd.right * MAX_ROLL;
    this.roll += (target - this.roll) * (1 - Math.exp(-dt * ROLL_EASE));

    this.camera.rotation.set(cmd.pitch, cmd.yaw, this.roll, 'YXZ');
  }
}
