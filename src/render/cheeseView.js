import * as THREE from 'three';
import { loadTexture } from './textures.js';
import { buildCheeseWedge } from '../models/cheeseWedge.js';

const BOB = 0.06;          // how far each resting piece floats up and down
const SPIN = 1.1;          // radians per second while resting
const PULLED_SPIN = 12;    // radians per second while being sucked in
const FOLLOW = 25;         // how tightly the visible piece follows the simulated one
const VANISH_TIME = 0.12;  // seconds a collected piece takes to shrink away

/** A cheese wedge: a slice of a wheel, rind on the curved side, painted with cheese-wedge.png. */
export function cheeseWedgeGeometry(radius, thickness) {
  const wedge = buildCheeseWedge({ radius, thickness });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(wedge.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(wedge.normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(wedge.uvs, 2));
  return geometry;
}

// Slightly self-lit, so cheese glints down a dark corridor before the light reaches it.
function glowing(map) {
  return new THREE.MeshLambertMaterial({ map, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.3 });
}

/** For the collectible wedges and cheese shots: the painted wedge texture. */
export function cheeseWedgeMaterial() {
  return glowing(loadTexture('cheese-wedge.png'));
}

/** For everything else made of cheese (compass arrow, wheel, jar): a tiling cheese surface. */
export function cheeseMaterial() {
  return glowing(loadTexture('cheese.png'));
}

/**
 * Every piece of cheese in one instanced mesh. Resting pieces bob and turn slowly;
 * pieces caught by a vacuum follow the simulation toward the gun, spinning and wobbling.
 */
export function buildCheese(pieces) {
  const mesh = new THREE.InstancedMesh(cheeseWedgeGeometry(), cheeseWedgeMaterial(), pieces.length);
  mesh.frustumCulled = false; // instances move every frame; culling would need constant recalculation

  const looks = pieces.map((p) => ({
    x: p.x,
    y: p.y,
    z: p.z,
    phase: (p.x * 7.31 + p.z * 3.17) % (Math.PI * 2), // so they don't all bob in step
    angle: 0,
    bob: 1,
    vanishing: -1, // seconds since collected, -1 while still there
    gone: false,
  }));

  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scale = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);

  return {
    group: mesh,

    update(time, dt) {
      const follow = 1 - Math.exp(-dt * FOLLOW);
      pieces.forEach((piece, i) => {
        const look = looks[i];
        if (look.gone) return;

        let size = 1;
        if (piece.taken) {
          if (look.vanishing < 0) look.vanishing = 0;
          look.vanishing += dt;
          size = 1 - look.vanishing / VANISH_TIME;
          if (size <= 0) {
            look.gone = true;
            mesh.setMatrixAt(i, hidden);
            return;
          }
        }

        look.x += (piece.x - look.x) * follow;
        look.y += (piece.y - look.y) * follow;
        look.z += (piece.z - look.z) * follow;
        look.bob += ((piece.pulled ? 0 : 1) - look.bob) * Math.min(1, dt * 6);
        look.angle += dt * (piece.pulled ? PULLED_SPIN : SPIN);
        const wobble = piece.pulled ? Math.sin(time * 40 + look.phase) * 0.35 : 0;

        position.set(look.x, look.y + Math.sin(time * 2 + look.phase) * BOB * look.bob, look.z);
        rotation.setFromEuler(euler.set(wobble, look.angle + look.phase, wobble * 0.5));
        scale.setScalar(size * (piece.pulled ? 0.85 : 1));
        mesh.setMatrixAt(i, matrix.compose(position, rotation, scale));
      });
      mesh.instanceMatrix.needsUpdate = true;
    },

    dispose() {
      mesh.geometry.dispose();
      mesh.material.dispose();
      mesh.dispose();
    },
  };
}
