import * as THREE from 'three';

/**
 * PLACEHOLDER: another rat as seen in the maze, standing upright: a dark body, a head
 * with big ears, a pink tail and two faintly glowing eyes you'll catch in the dark.
 * The real model (Gunny's world model) replaces this.
 */
export function createRatView(scene) {
  const fur = new THREE.MeshLambertMaterial({ color: 0x4a403a });
  const pink = new THREE.MeshLambertMaterial({ color: 0xc98f8a });
  const eye = new THREE.MeshBasicMaterial({ color: 0xff5a3c });

  const root = new THREE.Group();
  const body = new THREE.Group(); // bobs while walking
  root.add(body);

  const part = (geometry, material, x, y, z, parent = body) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };

  part(new THREE.CapsuleGeometry(0.27, 0.55, 4, 10), fur, 0, 0.75, 0);
  const head = part(new THREE.SphereGeometry(0.22, 12, 10), fur, 0, 1.38, -0.04);
  head.scale.set(1, 0.95, 1.15);
  part(new THREE.ConeGeometry(0.1, 0.22, 10), fur, 0, 1.34, -0.3).rotation.x = -Math.PI / 2; // snout
  part(new THREE.SphereGeometry(0.035, 8, 6), pink, 0, 1.34, -0.41); // nose
  for (const side of [-1, 1]) {
    const ear = part(new THREE.SphereGeometry(0.12, 10, 8), pink, side * 0.17, 1.6, 0);
    ear.scale.set(1, 1, 0.3);
    part(new THREE.SphereGeometry(0.03, 6, 4), eye, side * 0.09, 1.43, -0.22);
  }
  const tail = new THREE.Mesh(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0.45, 0.22),
        new THREE.Vector3(0, 0.2, 0.55),
        new THREE.Vector3(0.15, 0.08, 0.9),
        new THREE.Vector3(0.05, 0.05, 1.2),
      ]),
      12,
      0.035,
      5,
    ),
    pink,
  );
  root.add(tail);
  scene.add(root);

  let phase = 0;
  return {
    /** Places the model at the rat, blending between ticks, facing where it's heading. */
    update(rat, alpha, dt) {
      const x = rat.prevX + (rat.x - rat.prevX) * alpha;
      const z = rat.prevZ + (rat.z - rat.prevZ) * alpha;
      const moving = rat.x !== rat.prevX || rat.z !== rat.prevZ;
      phase += moving ? dt * 11 : 0;
      root.position.set(x, 0, z);
      root.rotation.y = rat.yaw;
      body.position.y = moving ? Math.abs(Math.sin(phase)) * 0.05 : 0;
      body.rotation.z = moving ? Math.sin(phase) * 0.06 : 0;
      tail.rotation.y = Math.sin(phase * 0.5) * 0.3;
    },

    dispose() {
      scene.remove(root);
      root.traverse((object) => object.geometry?.dispose());
      [fur, pink, eye].forEach((m) => m.dispose());
    },
  };
}
