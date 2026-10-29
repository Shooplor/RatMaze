import * as THREE from 'three';
import { CHEESE_HEIGHT } from '../config.js';
import { loadTexture } from './textures.js';

const BOB = 0.06;          // how far each piece floats up and down
const SPIN = 1.1;          // turns per second, in radians
const VANISH_TIME = 0.18;  // seconds a collected piece takes to shrink away

/** A cheese wedge: a slice of a wheel, rind on the curved side. */
export function cheeseWedgeGeometry(radius = 0.32, thickness = 0.18, angle = Math.PI * 0.3) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(radius, 0);
  shape.absarc(0, 0, radius, 0, angle, false);
  shape.lineTo(0, 0);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.015,
    bevelSegments: 1,
    curveSegments: 8,
  });
  geometry.rotateX(-Math.PI / 2); // lie flat, thickness pointing up
  geometry.center();
  return geometry;
}

/** Slightly self-lit, so cheese glints down a dark corridor before the light reaches it. */
export function cheeseMaterial() {
  const map = loadTexture('cheese.png');
  return new THREE.MeshLambertMaterial({
    map,
    emissive: 0xffffff,
    emissiveMap: map,
    emissiveIntensity: 0.3,
  });
}

/** Every floating piece of cheese in one instanced mesh. */
export function buildCheese(maze, tiles) {
  const mesh = new THREE.InstancedMesh(cheeseWedgeGeometry(), cheeseMaterial(), tiles.length);
  mesh.frustumCulled = false; // instances move every frame; culling would need constant recalculation

  const pieces = tiles.map(({ cx, cz }) => ({
    ...maze.cellCenter(cx, cz),
    phase: (cx * 7.31 + cz * 3.17) % (Math.PI * 2), // so they don't all bob in step
    vanishing: -1, // seconds since collected, -1 while still there
    gone: false,
  }));
  const byTile = new Map(tiles.map(({ cx, cz }, i) => [`${cx},${cz}`, i]));

  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const matrix = new THREE.Matrix4();
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);

  return {
    group: mesh,

    collect(collected) {
      for (const { cx, cz } of collected) {
        const i = byTile.get(`${cx},${cz}`);
        if (i !== undefined && pieces[i].vanishing < 0) pieces[i].vanishing = 0;
      }
    },

    update(time, dt) {
      pieces.forEach((piece, i) => {
        if (piece.gone) return;
        let size = 1;
        let lift = 0;
        if (piece.vanishing >= 0) {
          piece.vanishing += dt;
          const t = Math.min(1, piece.vanishing / VANISH_TIME);
          size = 1 - t;
          lift = t * 0.35;
          if (t >= 1) {
            piece.gone = true;
            mesh.setMatrixAt(i, hidden);
            return;
          }
        }
        position.set(piece.x, CHEESE_HEIGHT + Math.sin(time * 2 + piece.phase) * BOB + lift, piece.z);
        rotation.setFromAxisAngle(up, time * SPIN + piece.phase);
        scale.setScalar(size);
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
