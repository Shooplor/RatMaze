import * as THREE from 'three';
import { FOV } from '../config.js';

/**
 * A second 3D scene drawn on top of the maze: things that belong to the player's view
 * rather than the world (the cheese compass now, the paw and the cheese gun later).
 * It has its own camera and lights and is drawn after the maze with depth cleared,
 * so nothing in it ever pokes into a wall.
 */
export function createOverlay() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 20);
  scene.add(new THREE.AmbientLight(0xffffff, 1.4));
  const sun = new THREE.DirectionalLight(0xfff2d0, 2.2);
  sun.position.set(0.6, 1, 1);
  scene.add(sun);

  return {
    scene,
    camera,
    /** Height of the visible area at a given distance in front of the camera. */
    viewHeightAt(distance) {
      return 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    },
    resize(aspect) {
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    },
  };
}
