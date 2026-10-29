import * as THREE from 'three';
import { TILE, WALL_HEIGHT } from '../config.js';
import { loadTexture } from './textures.js';
import { cheeseMaterial } from './cheeseView.js';

const OPEN_TIME = 1.2;  // seconds for the door to slide up
const PANEL = 0.12;     // door and back wall thickness

/**
 * The exit: a door set into the outer wall with a small lit alcove behind it.
 * Closed, it is just a door you may notice while exploring. Once all the cheese is
 * gathered it slides up into the ceiling and light spills out.
 */
export function buildExit(maze) {
  const { cx, cz, dx, dz } = maze.exit;
  const centre = maze.cellCenter(cx, cz);
  const group = new THREE.Group();
  const facesAlongX = dx !== 0; // door spans the z direction when the exit points along x

  const panel = (material, offset) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(TILE, WALL_HEIGHT, PANEL), material);
    mesh.position.set(centre.x + dx * offset, WALL_HEIGHT / 2, centre.z + dz * offset);
    if (facesAlongX) mesh.rotation.y = Math.PI / 2;
    group.add(mesh);
    return mesh;
  };

  // The door sits where the corridor meets the outer wall; the back wall closes the alcove.
  const door = panel(new THREE.MeshLambertMaterial({ map: loadTexture('door.png') }), -(TILE - PANEL) / 2);
  panel(new THREE.MeshLambertMaterial({ map: loadTexture('wall.png') }), (TILE - PANEL) / 2);

  // A big cheese wheel waiting inside: the place to bring your cheese.
  const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.32, 20), cheeseMaterial());
  wheel.position.set(centre.x + dx * 0.25, 0.16, centre.z + dz * 0.25);
  group.add(wheel);

  const light = new THREE.PointLight(0xffd27a, 0, TILE * 2.6, 2);
  light.position.set(centre.x, WALL_HEIGHT * 0.75, centre.z);
  group.add(light);

  let opening = -1; // seconds since the door started opening

  return {
    group,
    position: centre,

    open() {
      if (opening < 0) opening = 0;
    },

    update(time, dt) {
      if (opening < 0) return;
      opening += dt;
      const t = Math.min(1, opening / OPEN_TIME);
      const eased = t * t * (3 - 2 * t);
      door.position.y = WALL_HEIGHT / 2 + eased * WALL_HEIGHT; // up into the ceiling
      light.intensity = 9 * eased * (0.95 + 0.05 * Math.sin(time * 9));
      wheel.rotation.y = time * 0.6;
    },

    dispose() {
      group.traverse((object) => {
        object.geometry?.dispose();
        object.material?.dispose();
        object.dispose?.();
      });
    },
  };
}
