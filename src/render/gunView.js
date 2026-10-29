import * as THREE from 'three';
import { RULES } from '../config.js';
import { cheeseMaterial } from './cheeseView.js';

const JAR_FULL_AT = 40;   // carried cheese that fills the jar on top
const SCALE = 0.62;       // the model is built at a comfortable size, then shrunk to sit in view
const RECOIL_KICK = 1;    // added per shot, decays back to 0
const RECOIL_DECAY = 14;

const metal = (color) => new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });
const MATERIALS = {
  rust: metal(0x7a4a2a),
  steel: metal(0x707476),
  darkSteel: metal(0x3a3c3e),
  panel: metal(0x55603e),
  tape: metal(0xb9ad86),
  grip: metal(0x2b211b),
  glass: new THREE.MeshLambertMaterial({ color: 0xcfe6ee, transparent: true, opacity: 0.28, depthWrite: false }),
};

/**
 * PLACEHOLDER: Gunny's vacuum gun knocked together from scrap: a funnel nozzle, a rusty
 * pipe, a taped joint, a motor block and a glass jar on top that fills with the cheese
 * you carry. It will be replaced by the real model.
 *
 * Built nozzle-first: the mouth of the funnel is at (0, 0, 0) and the gun runs back
 * along +z toward the player.
 */
function buildScrapGun() {
  const gun = new THREE.Group();
  const add = (geometry, material, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    gun.add(mesh);
    return mesh;
  };
  const alongZ = Math.PI / 2; // cylinders stand along y; tip them over to run along z

  // Funnel nozzle, wide end forward, with a lip and fins that spin while sucking.
  add(new THREE.CylinderGeometry(0.045, 0.078, 0.11, 12, 1, true), MATERIALS.steel, 0, 0, 0.055, alongZ);
  add(new THREE.TorusGeometry(0.078, 0.009, 6, 16), MATERIALS.darkSteel, 0, 0, 0.002);
  const fins = new THREE.Group();
  fins.position.set(0, 0, 0.07);
  for (let i = 0; i < 4; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.05, 0.03), MATERIALS.darkSteel);
    const a = (i / 4) * Math.PI * 2;
    fin.position.set(Math.cos(a) * 0.07, Math.sin(a) * 0.07, 0);
    fin.rotation.z = a;
    fins.add(fin);
  }
  gun.add(fins);

  // Rusty barrel pipe with clamps and a taped joint.
  add(new THREE.CylinderGeometry(0.04, 0.042, 0.34, 10), MATERIALS.rust, 0, 0, 0.27, alongZ);
  add(new THREE.TorusGeometry(0.044, 0.008, 6, 14), MATERIALS.darkSteel, 0, 0, 0.17);
  add(new THREE.TorusGeometry(0.044, 0.008, 6, 14), MATERIALS.darkSteel, 0, 0, 0.38);
  add(new THREE.CylinderGeometry(0.046, 0.046, 0.045, 10), MATERIALS.tape, 0, 0, 0.27, alongZ, 0, 0.3);

  // Motor block at the back, a mismatched panel bolted on.
  add(new THREE.BoxGeometry(0.12, 0.11, 0.13), MATERIALS.panel, 0.005, -0.005, 0.5);
  add(new THREE.BoxGeometry(0.125, 0.04, 0.09), MATERIALS.steel, 0.005, 0.045, 0.5, 0, 0, 0.05);
  for (const [x, y] of [[0.066, 0.03], [0.066, -0.035], [-0.056, 0.03], [-0.056, -0.035]]) {
    add(new THREE.SphereGeometry(0.008, 6, 4), MATERIALS.darkSteel, x, y, 0.47);
  }

  // Grip, angled back.
  add(new THREE.BoxGeometry(0.04, 0.14, 0.055), MATERIALS.grip, 0, -0.1, 0.52, 0.35);

  // Glass jar on top, filled with cheese as you collect, with a hose down to the barrel.
  const jarY = 0.1;
  const jarZ = 0.27;
  add(new THREE.CylinderGeometry(0.04, 0.04, 0.012, 12), MATERIALS.darkSteel, 0, jarY - 0.05, jarZ);
  add(new THREE.CylinderGeometry(0.042, 0.042, 0.015, 12), MATERIALS.darkSteel, 0, jarY + 0.052, jarZ);
  const fill = add(new THREE.CylinderGeometry(0.033, 0.033, 1, 12), cheeseMaterial(), 0, jarY - 0.044, jarZ);
  add(new THREE.CylinderGeometry(0.038, 0.038, 0.095, 12, 1, true), MATERIALS.glass, 0, jarY, jarZ);
  add(new THREE.TorusGeometry(0.06, 0.009, 6, 10, Math.PI), MATERIALS.darkSteel, 0.035, 0.035, 0.27, 0, Math.PI / 2, 0);

  return { gun, fins, fill };
}

/**
 * The gun in first person, on the overlay layer (so it never pokes into walls).
 * Placed so its nozzle sits exactly where the rules say shots come from, with a little
 * sway while walking, a kick when firing, and a rattle while the vacuum runs.
 */
export function createGun(overlay) {
  const { gun, fins, fill } = buildScrapGun();
  gun.scale.setScalar(SCALE); // around the nozzle, which stays at the origin
  const root = new THREE.Group();
  root.add(gun);
  overlay.scene.add(root);

  const { right, down, forward } = RULES.muzzle;
  const base = new THREE.Vector3(right, -down, -forward);
  const muzzle = base.clone(); // where the nozzle is this frame, in view space
  // Angle the gun slightly inward so it points at the crosshair in the distance.
  const aimYaw = Math.atan2(right, 12);
  const aimPitch = Math.atan2(down, 12);

  let recoil = 0;
  let walk = 0;      // 0 standing, 1 walking, eased
  let phase = 0;
  let suckBlend = 0; // 0 off, 1 sucking, eased
  let jar = 0;

  return {
    /** Nozzle position in view space this frame, for effects that start at the gun. */
    muzzle,

    kick() {
      recoil = Math.min(1.5, recoil + RECOIL_KICK);
    },

    update(dt, time, { moving, sucking, carried }) {
      walk += ((moving ? 1 : 0) - walk) * Math.min(1, dt * 8);
      suckBlend += ((sucking ? 1 : 0) - suckBlend) * Math.min(1, dt * 10);
      recoil *= Math.exp(-dt * RECOIL_DECAY);
      phase += dt * (sucking ? 4.5 : 9) * walk; // half-speed steps while sucking
      jar += (Math.min(1, carried / JAR_FULL_AT) - jar) * Math.min(1, dt * 6);

      const swayX = Math.cos(phase) * 0.012 * walk + Math.sin(time * 1.3) * 0.002;
      const swayY = Math.abs(Math.sin(phase)) * 0.01 * walk + Math.sin(time * 1.9) * 0.002;
      const rattle = Math.sin(time * 70) * 0.0025 * suckBlend;

      root.position.set(
        base.x + swayX + rattle,
        base.y + swayY - rattle * 0.5,
        base.z + recoil * 0.06 + suckBlend * 0.015,
      );
      root.rotation.set(aimPitch + recoil * 0.12, aimYaw, swayX * 0.6);
      muzzle.copy(root.position);

      fins.rotation.z += dt * (1 + suckBlend * 25);
      fill.scale.y = Math.max(0.001, jar * 0.088);
      fill.position.y = 0.1 - 0.044 + fill.scale.y / 2;
    },
  };
}
