import * as THREE from 'three';
import { cheeseWedgeGeometry } from './cheeseView.js';
import { loadTexture } from './textures.js';
import { glowSprite, glowTexture, TOXIC_GOLD, TOXIC_GREEN } from './glow.js';

const CRUMBS_PER_SPLAT = 10;
const CRUMB_LIFE = 0.7;
const GRAVITY = 9;

const DRIPS = 240;          // glowing specks that fall off shots in flight
const DRIP_RATE = 45;       // per second, per shot
const DRIP_LIFE = 0.45;
const SPLAT_DRIPS = 16;

const SHOT_LIGHT = 3.2;     // the golden light a shot casts on the walls as it flies
const SHOT_LIGHT_RANGE = 4.5;
const LIGHT_FADE = 8;       // how fast it dies after the shot splats

/**
 * Cheese shots in flight and what they leave behind. Each shot is a lump of cheese coated
 * in glowing toxic gold: a halo around it, specks dripping off it, and light that moves
 * along the walls with it. On impact it bursts into crumbs and sparks.
 */
export function createShots(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const shotGeometry = cheeseWedgeGeometry(0.16, 0.1);
  const wedgeMap = loadTexture('cheese-wedge.png');
  const shotMaterial = new THREE.MeshLambertMaterial({
    map: wedgeMap,
    emissive: TOXIC_GOLD,
    emissiveMap: wedgeMap,
    emissiveIntensity: 1.1,
  });
  const crumbGeometry = new THREE.BoxGeometry(0.045, 0.035, 0.045);
  const crumbMaterial = new THREE.MeshLambertMaterial({
    map: loadTexture('cheese.png'),
    emissive: TOXIC_GOLD,
    emissiveIntensity: 0.6,
  });
  const flying = new Map(); // shot id -> { mesh, halo, dripDebt }
  let crumbs = [];

  // Drips: one Points cloud, each speck fading to black (which adds nothing) as it dies.
  const dripPositions = new Float32Array(DRIPS * 3);
  const dripColors = new Float32Array(DRIPS * 3);
  const drips = Array.from({ length: DRIPS }, () => ({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }));
  const dripGeometry = new THREE.BufferGeometry();
  dripGeometry.setAttribute('position', new THREE.BufferAttribute(dripPositions, 3));
  dripGeometry.setAttribute('color', new THREE.BufferAttribute(dripColors, 3));
  const dripCloud = new THREE.Points(
    dripGeometry,
    new THREE.PointsMaterial({
      map: glowTexture(),
      size: 0.09,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  dripCloud.frustumCulled = false;
  group.add(dripCloud);
  const gold = new THREE.Color(TOXIC_GOLD);
  const green = new THREE.Color(TOXIC_GREEN);
  let nextDrip = 0;

  const drip = (x, y, z, spread, vx = 0, vy = 0, vz = 0) => {
    const d = drips[nextDrip];
    nextDrip = (nextDrip + 1) % DRIPS;
    Object.assign(d, {
      life: DRIP_LIFE * (0.6 + Math.random() * 0.4),
      x, y, z,
      vx: vx + (Math.random() - 0.5) * spread,
      vy: vy + (Math.random() - 0.2) * spread,
      vz: vz + (Math.random() - 0.5) * spread,
      green: Math.random() < 0.35,
    });
  };

  // Two lights that ride with the newest shots. The number of lights never changes, so
  // firing never makes three.js rebuild its shaders (which would stutter).
  const lights = [0, 1].map(() => {
    const light = new THREE.PointLight(TOXIC_GOLD, 0, SHOT_LIGHT_RANGE, 2);
    group.add(light);
    return { light, shotId: null };
  });

  return {
    /** Matches the meshes to the shots in the simulation. `alpha` blends between ticks. */
    sync(shots, alpha, time, dt) {
      const live = new Set(shots.map((shot) => shot.id));
      for (const shot of shots) {
        let look = flying.get(shot.id);
        if (!look) {
          const mesh = new THREE.Mesh(shotGeometry, shotMaterial);
          const halo = glowSprite(TOXIC_GOLD, 0.9);
          halo.scale.setScalar(0.55);
          mesh.add(halo);
          group.add(mesh);
          look = { mesh, halo, dripDebt: 0 };
          flying.set(shot.id, look);
          // A light that isn't following a shot, or else the one on the older shot.
          const free = lights.find((l) => !live.has(l.shotId))
            ?? lights.reduce((a, b) => (a.shotId < b.shotId ? a : b));
          free.shotId = shot.id;
        }
        const { mesh, halo } = look;
        mesh.position.set(
          shot.prevX + (shot.x - shot.prevX) * alpha,
          shot.prevY + (shot.y - shot.prevY) * alpha,
          shot.prevZ + (shot.z - shot.prevZ) * alpha,
        );
        mesh.rotation.set(time * 13 + shot.id, time * 9, 0);
        halo.scale.setScalar(0.5 + 0.08 * Math.sin(time * 30 + shot.id));

        look.dripDebt += dt * DRIP_RATE;
        while (look.dripDebt >= 1) {
          look.dripDebt -= 1;
          drip(mesh.position.x, mesh.position.y, mesh.position.z, 0.6, shot.vx * 0.05, shot.vy * 0.05, shot.vz * 0.05);
        }
      }
      for (const [id, look] of flying) {
        if (!live.has(id)) {
          group.remove(look.mesh);
          look.halo.material.dispose();
          flying.delete(id);
        }
      }
      for (const l of lights) {
        const look = flying.get(l.shotId);
        if (look) {
          l.light.position.copy(look.mesh.position);
          l.light.intensity = SHOT_LIGHT;
        }
      }
    },

    /** A shot hit something: crumbs, a burst of sparks, and its light flares and fades there. */
    splat(x, y, z, shotId) {
      for (let i = 0; i < CRUMBS_PER_SPLAT; i++) {
        const mesh = new THREE.Mesh(crumbGeometry, crumbMaterial);
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
      for (let i = 0; i < SPLAT_DRIPS; i++) drip(x, y, z, 3.5);
      const light = lights.find((l) => l.shotId === shotId);
      if (light) {
        light.shotId = null; // stays where the shot landed and fades
        light.light.position.set(x, y, z);
        light.light.intensity = SHOT_LIGHT * 1.6;
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

      drips.forEach((d, i) => {
        if (d.life > 0) {
          d.life -= dt;
          d.vy -= 4 * dt;
          d.x += d.vx * dt;
          d.y = Math.max(0.01, d.y + d.vy * dt);
          d.z += d.vz * dt;
        }
        const fade = Math.max(0, d.life / DRIP_LIFE);
        const c = d.green ? green : gold;
        dripPositions.set([d.x, d.y, d.z], i * 3);
        dripColors.set([c.r * fade, c.g * fade, c.b * fade], i * 3);
      });
      dripGeometry.attributes.position.needsUpdate = true;
      dripGeometry.attributes.color.needsUpdate = true;

      for (const l of lights) {
        if (l.shotId === null || !flying.has(l.shotId)) l.light.intensity *= Math.exp(-dt * LIGHT_FADE);
      }
    },

    clear() {
      for (const look of flying.values()) group.remove(look.mesh);
      flying.clear();
      for (const c of crumbs) group.remove(c.mesh);
      crumbs = [];
      drips.forEach((d) => (d.life = 0));
      for (const l of lights) {
        l.shotId = null;
        l.light.intensity = 0;
      }
    },
  };
}
