import './hud.css';
import cheeseIcon from '../assets/ui/hud-cheese.png';

/**
 * The HTML layer over the 3D view: start/pause/result screen, crosshair, cheese counters,
 * short messages and the debug line.
 */
export function createHud({ onPlay }) {
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
  const debug = $('debug');

  const startText = { title: title.textContent, status: status.textContent, button: playButton.textContent };
  let started = false;
  let result = null; // { title, text } once the round is over
  let toastTimer = null;

  $('carried-icon').src = cheeseIcon;
  playButton.addEventListener('click', onPlay);
  $('touch-note').hidden = !window.matchMedia('(hover: none) and (pointer: coarse)').matches;

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
      if (bump) {
        carried.classList.remove('bump');
        void carried.offsetWidth; // restart the animation
        carried.classList.add('bump');
      }
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

    setDebug(text) {
      debug.textContent = text;
    },
  };
}
