/**
 * "Computation sweep": after a forward pass each tensor flashes briefly in the
 * order it is computed, so the flow of data through the model is visible.
 */
const order = new Map<string, number>();
let count = 1;
let start = -1e9;
let duration = 3.2;

export function setPulseOrder(ids: string[]) {
  order.clear();
  ids.forEach((id, i) => order.set(id, i));
  count = Math.max(1, ids.length);
}

export function triggerSweep(seconds = 3.2) {
  duration = seconds;
  start = performance.now() / 1000;
}

/** Flash intensity (0…1) for a slab right now. */
export function slabPulse(id: string) {
  const i = order.get(id);
  if (i === undefined) return 0;
  const t = performance.now() / 1000 - start;
  if (t < 0 || t > duration + 0.6) return 0;
  const at = (i / count) * duration;
  const x = (t - at) / 0.18;
  return Math.exp(-x * x);
}

/** Progress of the current sweep, 0…1 (or −1 when idle). */
export function sweepProgress() {
  const t = performance.now() / 1000 - start;
  if (t < 0 || t > duration) return -1;
  return t / duration;
}
