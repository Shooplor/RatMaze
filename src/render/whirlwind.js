import * as THREE from 'three';

const LENGTH = 3.6;      // how far the visible whirlwind reaches ahead of the nozzle
const NEAR_RADIUS = 0.06;
const FAR_RADIUS = 0.95;
const STREAKS = 90;
const FADE_IN = 8;       // how fast it appears and disappears (per second)

// Spiral streaks running down the inside of a cone toward the nozzle. Additive, so they
// glow faintly against the dark maze; walls still hide them because they are depth-tested.
const swirlMaterial = () =>
  new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, strength: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float time;
      uniform float strength;
      varying vec2 vUv; // x: around the cone, y: 0 at the nozzle, 1 at the far end
      void main() {
        float swirl = sin(vUv.x * 18.85 + vUv.y * 14.0 + time * 11.0); // 3 arms, moving inward
        float streaks = smoothstep(0.35, 1.0, swirl);
        float fade = smoothstep(0.0, 0.12, vUv.y) * (1.0 - smoothstep(0.5, 1.0, vUv.y));
        gl_FragColor = vec4(0.86, 0.9, 1.0, streaks * fade * strength * 0.4);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });

// Where a speck is at progress t (1 far out, 0 at the nozzle) and spin angle.
function spiralPoint(t, angle, spread, out, i) {
  const radius = NEAR_RADIUS + (FAR_RADIUS - NEAR_RADIUS) * t * spread;
  out[i] = Math.cos(angle) * radius;
  out[i + 1] = Math.sin(angle) * radius;
  out[i + 2] = -LENGTH * 0.8 * t;
}

/**
 * The vacuum's whirlwind: a swirling cone of air and dust spiralling into the nozzle
 * while the right button is held. It hangs off the camera at the nozzle's position.
 */
export function createWhirlwind(camera) {
  const group = new THREE.Group();
  group.visible = false;
  camera.add(group);

  // Cone from the nozzle (near, narrow) out ahead (far, wide), along the camera's -z.
  const coneGeometry = new THREE.CylinderGeometry(FAR_RADIUS, NEAR_RADIUS, LENGTH, 24, 1, true);
  coneGeometry.rotateX(-Math.PI / 2);
  coneGeometry.translate(0, 0, -LENGTH / 2);
  const swirl = swirlMaterial();
  group.add(new THREE.Mesh(coneGeometry, swirl));

  // Wind streaks spiralling inward, faster as they get close. Each is a short line from
  // where the speck is to where it just was, bright at the head and fading at the tail.
  const specks = Array.from({ length: STREAKS }, () => ({
    t: Math.random(),
    angle: Math.random() * Math.PI * 2,
    spread: 0.35 + Math.random() * 0.65,
  }));
  const positions = new Float32Array(STREAKS * 6);
  const colors = new Float32Array(STREAKS * 6);
  for (let i = 0; i < STREAKS; i++) colors.set([0.9, 0.94, 1, 0, 0, 0], i * 6);
  const streakGeometry = new THREE.BufferGeometry();
  streakGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  streakGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const streaks = new THREE.LineSegments(
    streakGeometry,
    new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  streaks.frustumCulled = false;
  group.add(streaks);

  let strength = 0;

  return {
    /** @param muzzle nozzle position in view space (from the gun) */
    update(dt, time, active, muzzle) {
      strength += ((active ? 1 : 0) - strength) * Math.min(1, dt * FADE_IN);
      group.visible = strength > 0.01;
      if (!group.visible) return;

      group.position.copy(muzzle);
      swirl.uniforms.time.value = time;
      swirl.uniforms.strength.value = strength;
      streaks.material.opacity = strength * 0.8;

      specks.forEach((s, i) => {
        s.t -= dt * (0.9 + 1.6 * (1 - s.t));
        s.angle += dt * (3 + 9 * (1 - s.t));
        if (s.t <= 0.02) {
          s.t = 0.8 + Math.random() * 0.2;
          s.angle = Math.random() * Math.PI * 2;
        }
        spiralPoint(s.t, s.angle, s.spread, positions, i * 6);
        spiralPoint(Math.min(1, s.t + 0.07), s.angle - 0.45, s.spread, positions, i * 6 + 3);
      });
      streakGeometry.attributes.position.needsUpdate = true;
    },
  };
}
