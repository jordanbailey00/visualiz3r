import { createStarfield } from './starfield.js';

/** Mount the original Supernova background. Call dispose() when leaving the page. */
export function mountSupernova({ document = globalThis.document, window = globalThis.window } = {}) {
  const field = createStarfield({ document, window });
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let enabled = true;
  let disposed = false;

  function sync() {
    if (!disposed) field.setMotion(enabled && !document.hidden && !motion.matches);
  }
  function pause() { field.setMotion(false); }

  motion.addEventListener('change', sync);
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('pagehide', pause);
  window.addEventListener('pageshow', sync);
  sync();

  return {
    setMotion(value) {
      enabled = Boolean(value);
      sync();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      motion.removeEventListener('change', sync);
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('pagehide', pause);
      window.removeEventListener('pageshow', sync);
      field.dispose();
    },
  };
}

export { createStarfield };
