import * as THREE from 'three';
import { cheeseMaterial } from './cheeseView.js';

const DISTANCE = 2;        // how far in front of the eye the arrow floats
const SCREEN_HEIGHT = 0.5; // centre of the arrow, as a share of the half-screen above the middle
const SIZE = 0.85;
const TILT = 0.95;         // radians the arrow is tipped toward you, so its direction reads clearly
const TURN_EASE = 10;      // how quickly it swings to a new heading
const POP_TIME = 0.45;     // seconds to grow in when the exit opens

/** An arrow made of cheese, extruded with a bevel so it reads as a solid block. */
function arrowGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.07, -0.26);
  shape.lineTo(0.07, -0.26);
  shape.lineTo(0.07, 0.04);
  shape.lineTo(0.17, 0.04);
  shape.lineTo(0, 0.28);
  shape.lineTo(-0.17, 0.04);
  shape.lineTo(-0.07, 0.04);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.08,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.015,
    bevelSegments: 2,
  });
  geometry.rotateX(-Math.PI / 2); // lie flat, tip pointing away from the viewer (-z)
  geometry.center();
  return geometry;
}

/**
 * The cheese compass: appears near the top of the view once the exit opens and points
 * at the door in a straight line, through walls, like a real compass. Finding the way
 * there is still up to you.
 */
export function createCompass(overlay) {
  const root = new THREE.Group();
  root.position.set(0, (overlay.viewHeightAt(DISTANCE) / 2) * SCREEN_HEIGHT, -DISTANCE);
  root.rotation.x = TILT;
  root.visible = false;

  const needle = new THREE.Mesh(arrowGeometry(), cheeseMaterial());
  root.add(needle);
  overlay.scene.add(root);

  let heading = 0;
  let shown = -1; // seconds since it appeared

  return {
    show() {
      root.visible = true;
      shown = 0;
    },

    hide() {
      root.visible = false;
      shown = -1;
    },

    /** Points the arrow from the eye at `target`; `yaw` is where the player is facing. */
    update(dt, eye, yaw, target) {
      if (!root.visible) return;
      shown += dt;
      const t = Math.min(1, shown / POP_TIME);
      root.scale.setScalar(SIZE * easeOutBack(t));

      // Yaw that would face the target, minus the yaw we face: 0 means straight ahead,
      // positive means turn left. The arrow's tip points ahead at heading 0.
      const towardTarget = Math.atan2(-(target.x - eye.x), -(target.z - eye.z));
      const wanted = wrapAngle(towardTarget - yaw);
      heading += wrapAngle(wanted - heading) * (1 - Math.exp(-dt * TURN_EASE));
      needle.rotation.y = heading;
    },
  };
}

function wrapAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function easeOutBack(t) {
  const c = 1.7;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}
