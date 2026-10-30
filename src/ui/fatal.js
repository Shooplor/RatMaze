// When something breaks, say so on screen instead of leaving a black page. This only uses
// the start/pause overlay, which is plain HTML, so it works even if the game never started.

let shown = false;

export function showProblem(title, text) {
  const overlay = document.getElementById('overlay');
  if (!overlay) return;
  shown = true;
  if (document.pointerLockElement) document.exitPointerLock();
  document.getElementById('hud')?.setAttribute('hidden', '');
  overlay.hidden = false;
  document.getElementById('overlay-title').textContent = title;
  document.getElementById('overlay-status').textContent = text;
  document.getElementById('play-button').hidden = true;
}

export function clearProblem() {
  if (!shown) return;
  shown = false;
  document.getElementById('play-button').hidden = false;
}

/** Shows any uncaught error, with its message, so it can be reported. The first problem stays. */
export function reportErrors(signal) {
  const show = (message) => {
    if (!shown) showProblem('Something went wrong', `${message} Reload the page to try again.`);
  };
  window.addEventListener('error', (e) => show(e.message ?? String(e.error)), { signal });
  window.addEventListener('unhandledrejection', (e) => show(String(e.reason?.message ?? e.reason)), { signal });
}
