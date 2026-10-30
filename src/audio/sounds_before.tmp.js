// The game's sounds, synthesized with the Web Audio API so there are no audio files yet.
// Each one-shot is a function (ctx, out, when, volume, noise) that schedules a short burst
// of nodes into `out`; any of them can later be swapped for a recorded sample.

/** Two seconds of white noise, shared by every sound that needs hiss, scrape or air. */
export function makeNoise(ctx) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

const rand = (min, max) => min + Math.random() * (max - min);

// A gain that jumps up fast and dies away: the shape of most short sounds.
function envelope(ctx, out, when, peak, attack, decay) {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), when + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + attack + decay);
  gain.connect(out);
  return gain;
}

function noiseBurst(ctx, out, when, noise, { type, frequency, q = 1, peak, attack = 0.002, decay, rate = 1 }) {
  const source = ctx.createBufferSource();
  source.buffer = noise;
  source.playbackRate.value = rate;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = frequency;
  filter.Q.value = q;
  source.connect(filter).connect(envelope(ctx, out, when, peak, attack, decay));
  source.start(when, Math.random() * 1.5, attack + decay + 0.05);
}

function tone(ctx, out, when, { type = 'sine', from, to, peak, attack = 0.003, decay }) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, when);
  osc.frequency.exponentialRampToValueAtTime(to, when + attack + decay);
  osc.connect(envelope(ctx, out, when, peak, attack, decay));
  osc.start(when);
  osc.stop(when + attack + decay + 0.05);
}

/** A rat's step on stone: two quick claw clicks and a soft pad thud. */
export function footstep(ctx, out, when, volume, noise) {
  noiseBurst(ctx, out, when, noise, { type: 'bandpass', frequency: rand(2600, 4000), q: 2.2, peak: 0.9 * volume, decay: 0.04 });
  noiseBurst(ctx, out, when + rand(0.03, 0.05), noise, { type: 'bandpass', frequency: rand(2400, 3600), q: 2.2, peak: 0.5 * volume, decay: 0.035 });
  tone(ctx, out, when, { from: rand(120, 160), to: 55, peak: 0.55 * volume, decay: 0.09 });
}

/** The gun firing a lump of cheese: a puff of air and a falling pop. */
export function shot(ctx, out, when, volume, noise) {
  noiseBurst(ctx, out, when, noise, { type: 'lowpass', frequency: 1600, peak: 0.7 * volume, decay: 0.12 });
  tone(ctx, out, when, { from: 240, to: 70, peak: 0.6 * volume, decay: 0.13 });
}

/** Cheese hitting a wall: a wet, resonant squish. */
export function splat(ctx, out, when, volume, noise) {
  noiseBurst(ctx, out, when, noise, { type: 'lowpass', frequency: 900, q: 4, peak: 0.8 * volume, attack: 0.004, decay: 0.18, rate: 0.7 });
  tone(ctx, out, when + 0.01, { from: 180, to: 90, peak: 0.25 * volume, decay: 0.08 });
}

/** A piece of cheese sucked into the jar: a rising slurp-pop. */
export function collect(ctx, out, when, volume, noise) {
  tone(ctx, out, when, { from: rand(380, 460), to: rand(850, 1000), peak: 0.22 * volume, decay: 0.09 });
  noiseBurst(ctx, out, when, noise, { type: 'highpass', frequency: 2500, peak: 0.12 * volume, decay: 0.05 });
}

/** Pulling the trigger on an empty jar. */
export function dryFire(ctx, out, when, volume, noise) {
  tone(ctx, out, when, { type: 'square', from: 1700, to: 1500, peak: 0.12 * volume, attack: 0.001, decay: 0.015 });
  noiseBurst(ctx, out, when, noise, { type: 'highpass', frequency: 3000, peak: 0.25 * volume, attack: 0.001, decay: 0.03 });
}

/** The exit door grinding open, then thudding into place. */
export function door(ctx, out, when, volume, noise) {
  noiseBurst(ctx, out, when, noise, { type: 'lowpass', frequency: 160, q: 2, peak: 1.2 * volume, attack: 0.4, decay: 0.9, rate: 0.5 });
  noiseBurst(ctx, out, when, noise, { type: 'bandpass', frequency: 420, q: 6, peak: 0.25 * volume, attack: 0.3, decay: 0.9, rate: 0.6 });
  tone(ctx, out, when + 1.2, { from: 90, to: 45, peak: 0.8 * volume, decay: 0.3 });
}

/**
 * The vacuum's running sound: a motor hum, rushing air and a thin whine. `set(level)`
 * spins it up or down; 0 lets it wind down to silence, dropping in pitch as it goes.
 */
export function createVacuumVoice(ctx, out, noise) {
  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(out);

  const motor = ctx.createOscillator();
  motor.type = 'sawtooth';
  motor.frequency.value = 45;
  const motorFilter = ctx.createBiquadFilter();
  motorFilter.type = 'lowpass';
  motorFilter.frequency.value = 250;
  const motorGain = ctx.createGain();
  motorGain.gain.value = 0.35;
  motor.connect(motorFilter).connect(motorGain).connect(gain);

  const air = ctx.createBufferSource();
  air.buffer = noise;
  air.loop = true;
  const airFilter = ctx.createBiquadFilter();
  airFilter.type = 'bandpass';
  airFilter.Q.value = 1.2;
  airFilter.frequency.value = 400;
  const airSoften = ctx.createBiquadFilter(); // takes the harsh top off the hiss
  airSoften.type = 'lowpass';
  airSoften.frequency.value = 1500;
  const airGain = ctx.createGain();
  airGain.gain.value = 1.1;
  air.connect(airFilter).connect(airSoften).connect(airGain).connect(gain);

  const whine = ctx.createOscillator();
  whine.frequency.value = 500;
  const whineGain = ctx.createGain();
  whineGain.gain.value = 0.035;
  whine.connect(whineGain).connect(gain);

  motor.start();
  air.start();
  whine.start();

  let last = -1;
  return {
    /** @param level 0 (off) to 1 (full); follows the vacuum's loudness in the rules */
    set(level, when = ctx.currentTime) {
      if (Math.abs(level - last) < 0.01) return;
      last = level;
      gain.gain.setTargetAtTime(level * 0.25, when, level > 0 ? 0.08 : 0.18);
      motor.frequency.setTargetAtTime(45 + 75 * level, when, 0.25);
      motorFilter.frequency.setTargetAtTime(250 + 1000 * level, when, 0.25);
      airFilter.frequency.setTargetAtTime(400 + 1500 * level, when, 0.25);
      airSoften.frequency.setTargetAtTime(1500 + 2500 * level, when, 0.25);
      whine.frequency.setTargetAtTime(500 + 1400 * level, when, 0.3);
    },
    stop(when = ctx.currentTime) {
      motor.stop(when);
      air.stop(when);
      whine.stop(when);
    },
  };
}
