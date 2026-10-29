import { MOUSE_SENSITIVITY } from '../config.js';

const MAX_PITCH = Math.PI / 2 - 0.01;

// Physical key positions (event.code), so WASD sits in the same place on any keyboard layout.
const FORWARD = ['KeyW', 'ArrowUp'];
const BACK = ['KeyS', 'ArrowDown'];
const LEFT = ['KeyA', 'ArrowLeft'];
const RIGHT = ['KeyD', 'ArrowRight'];
const SUCK = ['KeyE'];  // keyboard alternatives to the mouse buttons
const FIRE = ['KeyF'];

/**
 * Turns keyboard and mouse into the rat command the simulation understands.
 * The AI (and later the network) produce the same command, so the Rat can't tell them apart.
 *
 * Normally the mouse is captured (pointer lock) like any FPS: left button shoots, right
 * button runs the vacuum. Where a page isn't allowed to capture the mouse, such as some
 * embedded previews, it falls back to drag-to-look, and E and F take over the buttons.
 */
export class KeyboardMouseController {
  constructor(element) {
    this.element = element;
    this.keys = new Set();
    this.buttons = new Set(); // mouse buttons held: 0 left, 2 right
    this.yaw = 0;
    this.pitch = 0;
    this.active = false;      // taking input: mouse captured, or drag-to-look running
    this.dragToLook = false;
    this.everLocked = false;
    this.onActiveChange = () => {};

    document.addEventListener('keydown', (e) => {
      // With a captured mouse the browser handles Esc itself and releases it.
      if (e.code === 'Escape' && this.dragToLook) this.setActive(false);
      else if (this.active) this.keys.add(e.code);
    });
    document.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.buttons.clear();
    });

    // In drag-to-look the buttons are for looking, so they don't shoot or suck.
    document.addEventListener('mousedown', (e) => {
      if (this.active && !this.dragToLook) this.buttons.add(e.button);
    });
    document.addEventListener('mouseup', (e) => this.buttons.delete(e.button));
    document.addEventListener('contextmenu', (e) => {
      if (this.active) e.preventDefault(); // right button is the vacuum, not a menu
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.active || (this.dragToLook && e.buttons === 0)) return;
      // Some browsers report a huge jump right after locking; skip those.
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.yaw -= e.movementX * MOUSE_SENSITIVITY;
      this.pitch -= e.movementY * MOUSE_SENSITIVITY;
      this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch));
    });

    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.element;
      if (locked) this.everLocked = true;
      if (locked || !this.dragToLook) this.setActive(locked);
    });
  }

  /** Starts taking input. Browsers only allow capturing the mouse right after a click. */
  async requestLock() {
    if (this.dragToLook) {
      this.setActive(true);
      return;
    }
    try {
      // Raw mouse movement, without the operating system's pointer acceleration.
      await this.element.requestPointerLock?.({ unadjustedMovement: true });
    } catch {
      try {
        await this.element.requestPointerLock();
      } catch {
        // Handled below. After Esc, browsers also refuse a re-lock for about a second.
      }
    }
    // Never managed to capture the mouse here: look by dragging instead.
    setTimeout(() => {
      if (!this.everLocked && !this.active) {
        this.dragToLook = true;
        this.setActive(true);
      }
    }, 400);
  }

  /** Stops taking input and gives the mouse back, e.g. when a round ends. */
  release() {
    if (document.pointerLockElement === this.element) document.exitPointerLock();
    this.setActive(false);
  }

  setActive(active) {
    if (this.active === active) return;
    this.active = active;
    if (!active) {
      this.keys.clear();
      this.buttons.clear();
    }
    this.onActiveChange(active);
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
      suck: this.buttons.has(2) || held(SUCK) === 1,
      fire: this.buttons.has(0) || held(FIRE) === 1,
    };
  }
}
