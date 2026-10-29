import * as THREE from 'three';
import { EYE_HEIGHT } from '../config.js';

/**
 * Puts the camera at the rat's eyes. The camera stays perfectly steady while walking:
 * head-bob made the game hard on the eyes, so any walking motion belongs on the
 * first-person paw instead.
 */
export class FirstPersonView {
  constructor(camera) {
    this.camera = camera;

    // The rat's own dim light: you can see a few steps around you and no further.
    this.light = new THREE.PointLight(0xffdcb0, 2.8, 11, 2);
    this.light.position.set(0, 0.15, 0.2);
    camera.add(this.light);
  }

  /**
   * @param alpha how far we are between the last two simulation ticks (0..1)
   * @param yaw, pitch view angles straight from the mouse, so looking never lags a tick
   */
  update(rat, alpha, yaw, pitch) {
    this.camera.position.set(
      rat.prevX + (rat.x - rat.prevX) * alpha,
      EYE_HEIGHT,
      rat.prevZ + (rat.z - rat.prevZ) * alpha,
    );
    this.camera.rotation.set(pitch, yaw, 0, 'YXZ');
  }
}
