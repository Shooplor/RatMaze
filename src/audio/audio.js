import * as sounds from './sounds.js';

export const DEFAULT_VOLUME = 0.4;
const MUFFLED_CUTOFF = 650; // Hz: what's left of a sound that comes round a corner

/**
 * The game's audio: one AudioContext, a master volume, and 3D positioning so sounds
 * from other rats come from where they are. Browsers only allow sound after the player
 * clicks something, so nothing exists until unlock() is called from a click.
 */
export function createAudio() {
  let ctx = null;
  let master = null;
  let noise = null;
  let vacuum = null;
  let muted = false;
  let volume = DEFAULT_VOLUME;

  const applyVolume = () => {
    if (master) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.05);
  };

  // Where a sound goes: straight to the speakers (your own sounds), or through a 3D
  // panner at its position, quieter with distance and muffled with no line of sight.
  function route(volume, position, inSight) {
    const gain = ctx.createGain();
    gain.gain.value = volume;
    const nodes = [gain];
    // Free the nodes once the sound is long over (the longest, the door, is under 2 s).
    setTimeout(() => nodes.forEach((node) => node.disconnect()), 4000);
    if (!position) {
      gain.connect(master);
      return gain;
    }
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.rolloffFactor = 0; // distance is already in `volume`, worked out along the corridors
    setPosition(panner, position);
    nodes.push(panner);
    let last = gain;
    if (!inSight) {
      const muffle = ctx.createBiquadFilter();
      muffle.type = 'lowpass';
      muffle.frequency.value = MUFFLED_CUTOFF;
      nodes.push(muffle);
      last = last.connect(muffle);
    }
    last.connect(panner).connect(master);
    return gain;
  }

  return {
    get ready() {
      return ctx !== null;
    },

    /** Call from a click or key press: creates or wakes the audio. */
    unlock() {
      if (!ctx) {
        const AudioContext = window.AudioContext ?? window.webkitAudioContext;
        if (!AudioContext) return;
        ctx = new AudioContext();
        master = ctx.createGain();
        master.gain.value = muted ? 0 : volume;
        master.connect(ctx.destination);
        noise = sounds.makeNoise(ctx);
        vacuum = sounds.createVacuumVoice(ctx, master, noise);
      }
      if (ctx.state === 'suspended') ctx.resume();
    },

    get muted() {
      return muted;
    },

    setMuted(value) {
      muted = value;
      applyVolume();
    },

    get volume() {
      return volume;
    },

    /** Overall volume, 0 to 1. */
    setVolume(value) {
      volume = Math.round(Math.max(0, Math.min(1, value)) * 10) / 10;
      applyVolume();
    },

    /** Moves the ears to the camera. */
    setListener(position, forward) {
      if (!ctx) return;
      const l = ctx.listener;
      if (l.positionX) {
        l.positionX.value = position.x;
        l.positionY.value = position.y;
        l.positionZ.value = position.z;
        l.forwardX.value = forward.x;
        l.forwardY.value = forward.y;
        l.forwardZ.value = forward.z;
        l.upX.value = 0;
        l.upY.value = 1;
        l.upZ.value = 0;
      } else {
        l.setPosition(position.x, position.y, position.z);
        l.setOrientation(forward.x, forward.y, forward.z, 0, 1, 0);
      }
    },

    /**
     * Plays a one-shot sound by name ('footstep', 'shot', 'splat', 'collect', 'dryFire', 'door').
     * Without `position` it plays as your own sound; with one it comes from that spot.
     */
    play(name, { volume = 1, position = null, inSight = true } = {}) {
      if (!ctx || volume <= 0.001) return;
      sounds[name](ctx, route(volume, position, inSight), ctx.currentTime, 1, noise);
    },

    /** Shuts the audio down for good. */
    close() {
      ctx?.close();
      ctx = null;
      vacuum = null;
    },

    /** Your own vacuum: 0 off, up to 1 at full power. */
    setVacuum(level) {
      vacuum?.set(level);
    },
  };
}

function setPosition(panner, { x, y, z }) {
  if (panner.positionX) {
    panner.positionX.value = x;
    panner.positionY.value = y;
    panner.positionZ.value = z;
  } else {
    panner.setPosition(x, y, z);
  }
}
