import * as THREE from 'three';

// The toxic golden glow of Gunny's cheese ammo, shared by the gun's jar and the shots.
export const TOXIC_GOLD = 0xffbe2e;
export const TOXIC_GREEN = 0xe2ff5a; // a sickly tint for bubbles and drips

let texture = null;

/** A soft round spot of light, for halos, sparks and drips (drawn additively). */
export function glowTexture() {
  if (texture) return texture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  texture = new THREE.CanvasTexture(canvas);
  return texture;
}

/** A glowing sprite: always faces the camera, adds light rather than covering what's behind. */
export function glowSprite(color, opacity = 1) {
  return new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(),
      color,
      opacity,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
}
