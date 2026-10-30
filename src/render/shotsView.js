import * as THREE from 'three';
import { cheeseMaterial, cheeseWedgeGeometry, cheeseWedgeMaterial } from './cheeseView.js';

const CRUMBS_PER_SPLAT = 10;
const CRUMB_LIFE = 0.7;
const GRAVITY = 9;

/** Cheese shots in flight, and the crumbs they burst into when they hit something. */
export function createShots(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const shotGeometry = cheeseWedgeGeometry(0.16, 0.1);
  const crumbGeometry = new THREE.BoxGeometry(0.045, 0.035, 0.045);
  const shotMaterial = cheeseWedgeMaterial();
  const material = cheeseMaterial(); // crumbs
  const flying = new Map(); // shot id -> mesh
  let crumbs = [];

  return {
    /** Matches the meshes to the shots in the simulation. `alpha` blends between ticks. */
    sync(shots, alpha, time) {
      const live = new Set();
      for (const shot of shots) {
        live.add(shot.id);
        let mesh = flying.get(shot.id);
        if (!mesh) {
          mesh = new THREE.Mesh(shotGeometry, shotMaterial);
          flying.set(shot.id, mesh);
          group.add(mesh);
        }
        mesh.position.set(
          shot.prevX + (shot.x - shot.prevX) * alpha,
          shot.prevY + (shot.y - shot.prevY) * alpha,
          shot.prevZ + (shot.z - shot.prevZ) * alpha,
        );
        mesh.rotation.set(time * 13 + shot.id, time * 9, 0);
      }
      for (const [id, mesh] of flying) {
        if (!live.has(id)) {
          group.remove(mesh);
          flying.delete(id);
        }
      }
    },

    splat(x, y, z) {
      for (let i = 0; i < CRUMBS_PER_SPLAT; i++) {
        const mesh = new THREE.Mesh(crumbGeometry, material);
        mesh.position.set(x, y, z);
        group.add(mesh);
        crumbs.push({
          mesh,
          vx: (Math.random() - 0.5) * 4,
          vy: Math.random() * 3,
          vz: (Math.random() - 0.5) * 4,
          spin: (Math.random() - 0.5) * 20,
          age: 0,
        });
      }
    },

    update(dt) {
      crumbs = crumbs.filter((c) => {
        c.age += dt;
        if (c.age >= CRUMB_LIFE) {
          group.remove(c.mesh);
          return false;
        }
        c.vy -= GRAVITY * dt;
        c.mesh.position.x += c.vx * dt;
        c.mesh.position.y = Math.max(0.02, c.mesh.position.y + c.vy * dt);
        c.mesh.position.z += c.vz * dt;
        c.mesh.rotation.x += c.spin * dt;
        c.mesh.scale.setScalar(1 - c.age / CRUMB_LIFE);
        return true;
      });
    },

    clear() {
      for (const mesh of flying.values()) group.remove(mesh);
      flying.clear();
      for (const c of crumbs) group.remove(c.mesh);
      crumbs = [];
    },
  };
}
