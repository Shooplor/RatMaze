import './hud.css';

/** The HTML layer over the 3D view: start/pause screen, crosshair, hints and debug line. */
export function createHud({ onPlay }) {
  const overlay = document.getElementById('overlay');
  const status = document.getElementById('overlay-status');
  const playButton = document.getElementById('play-button');
  const hud = document.getElementById('hud');
  const hint = document.getElementById('hint');
  const debug = document.getElementById('debug');
  let started = false;

  playButton.addEventListener('click', onPlay);
  document.getElementById('touch-note').hidden = !window.matchMedia('(hover: none) and (pointer: coarse)').matches;

  return {
    setPlaying(playing, { dragToLook = false } = {}) {
      if (playing) started = true;
      overlay.hidden = playing;
      hud.hidden = !playing;
      hint.hidden = !dragToLook;
      if (started && !playing) {
        status.textContent = 'Paused';
        playButton.textContent = 'Resume';
      }
    },
    setDebug(text) {
      debug.textContent = text;
    },
  };
}
