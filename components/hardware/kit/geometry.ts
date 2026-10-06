import {
  BufferAttribute,
  BufferGeometry,
  ExtrudeGeometry,
  Path,
  Shape,
  ShapeGeometry,
  type Vector2,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const cache = new Map<string, BufferGeometry>();

/** Memoise geometry by key (geometries are shared between identical parts). */
export function cached<T extends BufferGeometry>(key: string, make: () => T): T {
  let g = cache.get(key);
  if (!g) {
    g = make();
    cache.set(key, g);
  }
  return g as T;
}

/**
 * Merge geometries even when some are indexed (BoxGeometry, CylinderGeometry…)
 * and some are not (roundedBox): three's mergeGeometries returns null for such
 * mixes. Attributes missing from any input are dropped.
 */
export function mergeAll(geos: BufferGeometry[]): BufferGeometry {
  const mixed = geos.some((g) => g.index) && geos.some((g) => !g.index);
  let list = mixed ? geos.map((g) => (g.index ? g.toNonIndexed() : g)) : geos;
  const names = Object.keys(list[0].attributes).filter((n) => list.every((g) => g.getAttribute(n)));
  list = list.map((g) => {
    const extra = Object.keys(g.attributes).filter((n) => !names.includes(n));
    if (extra.length === 0) return g;
    const c = g.clone();
    for (const n of extra) c.deleteAttribute(n);
    return c;
  });
  const merged = mergeGeometries(list);
  if (!merged) throw new Error("mergeAll: incompatible geometries");
  return merged;
}

/** Box with rounded edges — catches highlights like real moulded parts. Non-indexed: merge with `mergeAll`. */
export function roundedBox(w: number, h: number, d: number, r: number, segments = 2) {
  const rr = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  return cached(`rbox:${w}:${h}:${d}:${rr}:${segments}`, () =>
    new RoundedBoxGeometry(w, h, d, segments, Math.max(rr, 1e-4)),
  );
}

/** Rectangle with rounded corners as a Shape (x, y in mm). */
export function roundedRectShape(x: number, y: number, w: number, h: number, r: number) {
  const s = new Shape();
  const rr = Math.min(r, w / 2, h / 2);
  s.moveTo(x + rr, y);
  s.lineTo(x + w - rr, y);
  s.quadraticCurveTo(x + w, y, x + w, y + rr);
  s.lineTo(x + w, y + h - rr);
  s.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  s.lineTo(x + rr, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - rr);
  s.lineTo(x, y + rr);
  s.quadraticCurveTo(x, y, x + rr, y);
  return s;
}

export function circlePath(cx: number, cy: number, r: number) {
  const p = new Path();
  p.absarc(cx, cy, r, 0, Math.PI * 2, true);
  return p;
}

/** Polygon shape from points (x, y). */
export function polygonShape(points: [number, number][]) {
  const s = new Shape();
  s.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) s.lineTo(points[i][0], points[i][1]);
  s.closePath();
  return s;
}

export interface FlatBounds {
  minX: number;
  minY: number;
  w: number;
  h: number;
}

/**
 * A flat face built from a Shape lying in the XZ plane (shape y → world z),
 * facing +Y (or −Y when `bottom`). UVs map the bounds to 0…1 so a painter
 * canvas (origin top-left, y down = +z) lines up with board coordinates.
 */
export function flatFace(shape: Shape, bounds: FlatBounds, bottom = false, curveSegments = 8) {
  const g = new ShapeGeometry(shape, curveSegments);
  const pos = g.getAttribute("position") as BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    out[i * 3] = x;
    out[i * 3 + 1] = 0;
    out[i * 3 + 2] = y;
    const u = (x - bounds.minX) / bounds.w;
    uv[i * 2] = bottom ? 1 - u : u;
    uv[i * 2 + 1] = 1 - (y - bounds.minY) / bounds.h;
  }
  g.setAttribute("position", new BufferAttribute(out, 3));
  g.setAttribute("uv", new BufferAttribute(uv, 2));
  // ShapeGeometry winds counter-clockwise in XY; after mapping y→z the face
  // points −Y, so flip the winding for the top face.
  const idx = g.getIndex();
  if (idx && !bottom) {
    const a = idx.array as Uint16Array | Uint32Array;
    for (let i = 0; i < a.length; i += 3) {
      const t = a[i + 1];
      a[i + 1] = a[i + 2];
      a[i + 2] = t;
    }
    idx.needsUpdate = true;
  }
  g.computeVertexNormals();
  return g;
}

/**
 * Only the side walls of an extruded shape (top/bottom faces are built
 * separately with `flatFace`). Lies in XZ, spanning y ∈ [-depth, 0].
 */
export function extrudedWalls(shape: Shape, depth: number, curveSegments = 8) {
  const g = new ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments });
  // Group 0 = lids, group 1 = walls. Keep the walls only (a single-material
  // mesh ignores groups, so restrict the draw range instead).
  const walls = g.groups.find((gr) => gr.materialIndex === 1);
  if (walls) {
    g.clearGroups();
    g.setDrawRange(walls.start, walls.count);
  }
  // Rotate so shape y → +z and extrusion goes downwards.
  g.rotateX(Math.PI / 2);
  return g;
}

/** Bounds of a list of 2D points. */
export function boundsOf(points: Vector2[] | [number, number][]): FlatBounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    const x = Array.isArray(p) ? p[0] : p.x;
    const y = Array.isArray(p) ? p[1] : p.y;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, w: maxX - minX, h: maxY - minY };
}
