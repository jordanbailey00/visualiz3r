import { events, type RootState } from "@react-three/fiber";
import type { Intersection, Object3D } from "three";

function visibleDeep(o: Object3D | null) {
  for (let cur = o; cur; cur = cur.parent) if (!cur.visible) return false;
  return true;
}

/**
 * Pointer events that ignore anything hidden (three.js raycasting does not
 * check `visible`), so hidden or collapsed parts can't intercept clicks.
 */
export function visibleOnlyEvents(store: Parameters<typeof events>[0]) {
  const base = events(store);
  return {
    ...base,
    filter: (hits: Intersection[], _state: RootState) => hits.filter((h) => visibleDeep(h.object)),
  };
}
