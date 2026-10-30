import './hud.css';
import cheeseIcon from '../assets/ui/hud-cheese.png';

/**
 * The HTML layer over the 3D view: start/pause/result screen, crosshair, cheese counters,
 * short messages and the debug line.
 */
export function createHud({ onPlay, signal }) {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const status = $('overlay-status');
  const playButton = $('play-button');
  const hud = $('hud');
  const hint = $('hint');
  const objective = $('objective');
  const mazeCheese = $('maze-cheese');
  const objectiveLabel = $('objective-label');
  const carried = $('carried');
  const carriedCount = $('carried-count');
  const toast = $('toast');
  const stanceLabel = $('stance-label');
  const noiseBars = [...$('noise-meter').children];
  const debug = $('debug');

  const startText = { title: title.textContent, status: status.textContent, button: playButton.textContent };
  let started = false;
  let result = null; // { title, text } once the round is over
  let toastTimer = null;

  $('carried-icon').src = cheeseIcon;
  playButton.addEventListener('click', onPlay, { signal });
  // Start from the start screen, even if an earlier copy of the game left the page mid-round.
  overlay.hidden = false;
  hud.hidden = true;
  $('touch-note').hidden = !window.matchMedia('(hover: none) and (pointer: coarse)').matches;

  function restartAnimation(element, className) {
    element.classList.remove(className);
    void element.offsetWidth; // force a reflow so the animation plays again
    element.classList.add(className);
  }

  function renderOverlay() {
    if (result) {
      title.textContent = result.title;
      status.textContent = result.text;
      playButton.textContent = 'Play again';
    } else if (started) {
      title.textContent = startText.title;
      status.textContent = 'Paused';
      playButton.textContent = 'Resume';
    } else {
      title.textContent = startText.title;
      status.textContent = startText.status;
      playButton.textContent = startText.button;
    }
  }

  return {
    setPlaying(playing, { dragToLook = false } = {}) {
      if (playing) started = true;
      overlay.hidden = playing;
      hud.hidden = !playing;
      hint.hidden = !dragToLook;
      if (!playing) renderOverlay();
    },

    /** The end-of-round screen, or null to clear it for a new round. */
    setResult(value) {
      result = value;
      renderOverlay();
    },

    setMazeCheese(remaining) {
      mazeCheese.textContent = remaining;
    },

    showExitOpen(open) {
      objective.classList.toggle('exit-open', open);
      mazeCheese.hidden = open;
      objectiveLabel.textContent = open ? 'The exit is open. Follow the cheese arrow.' : 'cheese left in the maze';
    },

    setCarried(count, { bump = false } = {}) {
      carriedCount.textContent = count;
      if (bump) restartAnimation(carried, 'bump');
    },

    /** Shakes the counter red: tried to shoot with no cheese. */
    flashEmpty() {
      restartAnimation(carried, 'empty');
    },

    toast(text, seconds = 4) {
      toast.textContent = text;
      toast.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        toast.hidden = true;
      }, seconds * 1000);
    },

    clearToast() {
      clearTimeout(toastTimer);
      toast.hidden = true;
    },

    /** Your stance, how loud you are right now (0 silent to 1 full), and the crouched look. */
    setStance(name, noise, crouched) {
      stanceLabel.textContent = name;
      hud.classList.toggle('crouched', crouched);
      const lit = Math.round(Math.min(1, noise) * noiseBars.length);
      noiseBars.forEach((bar, i) => bar.classList.toggle('on', i < lit));
    },

    setDebug(text) {
      debug.textContent = text;
    },
  };
}
