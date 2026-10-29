import { MOUSE_SENSITIVITY } from '../config.js';

const MAX_PITCH = Math.PI / 2 - 0.01;

// Physical key positions (event.code), so WASD sits in the same place on any keyboard layout.
const FORWARD = ['KeyW', 'ArrowUp'];
const BACK = ['KeyS', 'ArrowDown'];
const LEFT = ['KeyA', 'ArrowLeft'];
const RIGHT = ['KeyD', 'ArrowRight'];

/**
 * Turns keyboard and mouse into the rat command the simulation understands.
 * The AI (and later the network) produce the same command, so the Rat can't tell them apart.
 */
export class KeyboardMouseController {
  constructor(element) {
    this.element = element;
    this.keys = new Set();
    this.yaw = 0;
    this.pitch = 0;
    this.locked = false;
    this.onLockChange = () => {};

    document.addEventListener('keydown', (e) => {
      if (this.locked) this.keys.add(e.code);
    });
    document.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // Some browsers report a huge jump right after locking; skip those.
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.yaw -= e.movementX * MOUSE_SENSITIVITY;
      this.pitch -= e.movementY * MOUSE_SENSITIVITY;
      this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch));
    });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.element;
      if (!this.locked) this.keys.clear();
      this.onLockChange(this.locked);
    });
  }

  /** Captures the mouse. Browsers only allow this right after a click. */
  async requestLock() {
    try {
      // Raw mouse movement, without the operating system's pointer acceleration.
      await this.element.requestPointerLock({ unadjustedMovement: true });
    } catch {
      try {
        await this.element.requestPointerLock();
      } catch {
        // Browsers refuse a re-lock for about a second after Esc; the next click works.
      }
    }
  }

  setView(yaw, pitch = 0) {
    this.yaw = yaw;
    this.pitch = pitch;
  }

  getCommand() {
    const held = (codes) => (codes.some((c) => this.keys.has(c)) ? 1 : 0);
    return {
      forward: held(FORWARD) - held(BACK),
      right: held(RIGHT) - held(LEFT),
      yaw: this.yaw,
      pitch: this.pitch,
    };
  }
}
