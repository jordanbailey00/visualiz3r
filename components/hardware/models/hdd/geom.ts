import {
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  LatheGeometry,
  Matrix4,
  Path,
  Quaternion,
  Shape,
  Vector2,
  Vector3,
} from "three";
import { mergeGeometries, toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Geometry helpers for the hard-drive model. Everything is in millimetres;
 * shapes are drawn in the XZ plane with shape-y mapped to world +Z (the same
 * convention as the kit's `flatFace`).
 */

export type Pt = [number, number];

/** Smooth across shallow angles (curves, bevels), keep 90° edges crisp. */
export const CREASE = (40 * Math.PI) / 180;

/** Closed polygon → Shape. */
export function shapeOf(pts: Pt[], holes: Pt[][] = []) {
  const s = new Shape(pts.map(([x, y]) => new Vector2(x, y)));
  for (const h of holes) s.holes.push(new Path(h.map(([x, y]) => new Vector2(x, y))));
  return s;
}

/** Points along a circular arc (inclusive), angles in radians. */
export function arcPts(cx: number, cy: number, r: number, a0: number, a1: number, steps: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

export function circlePts(cx: number, cy: number, r: number, steps = 48): Pt[] {
  return arcPts(cx, cy, r, 0, Math.PI * 2, steps).slice(0, -1);
}

/** Rounded rectangle as a counter-clockwise point loop. */
export function roundedRectPts(x0: number, y0: number, x1: number, y1: number, r: number, seg = 6): Pt[] {
  const h = Math.PI / 2;
  return [
    ...arcPts(x1 - r, y0 + r, r, -h, 0, seg),
    ...arcPts(x1 - r, y1 - r, r, 0, h, seg),
    ...arcPts(x0 + r, y1 - r, r, h, 2 * h, seg),
    ...arcPts(x0 + r, y0 + r, r, 2 * h, 3 * h, seg),
  ];
}

/**
 * Round the corners of a polygon with fillets of radius `r` (clamped to fit).
 * Works for convex and concave corners.
 */
export function filletPts(pts: Pt[], r: number, seg = 5): Pt[] {
  const out: Pt[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const ax = p0[0] - p1[0];
    const ay = p0[1] - p1[1];
    const bx = p2[0] - p1[0];
    const by = p2[1] - p1[1];
    const la = Math.hypot(ax, ay);
    const lb = Math.hypot(bx, by);
    const cos = (ax * bx + ay * by) / (la * lb);
    const ang = Math.acos(Math.max(-1, Math.min(1, cos)));
    if (ang > Math.PI - 1e-3 || la < 1e-6 || lb < 1e-6) {
      out.push(p1);
      continue;
    }
    const t = Math.min(r / Math.tan(ang / 2), la * 0.45, lb * 0.45);
    const s: Pt = [p1[0] + (ax / la) * t, p1[1] + (ay / la) * t];
    const e: Pt = [p1[0] + (bx / lb) * t, p1[1] + (by / lb) * t];
    for (let k = 0; k <= seg; k++) {
      const u = k / seg;
      // quadratic Bézier through the corner approximates the arc closely
      const x = (1 - u) * (1 - u) * s[0] + 2 * (1 - u) * u * p1[0] + u * u * e[0];
      const y = (1 - u) * (1 - u) * s[1] + 2 * (1 - u) * u * p1[1] + u * u * e[1];
      out.push([x, y]);
    }
  }
  return out;
}

/** Signed area (positive = counter-clockwise). */
export function areaOf(pts: Pt[]) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

/**
 * Offset a closed polygon by `d` (positive = outward for counter-clockwise
 * loops) by moving each vertex along its averaged edge normal. Good enough for
 * smooth convex-ish outlines (coil windings, frames).
 */
export function offsetPts(pts: Pt[], d: number): Pt[] {
  const n = pts.length;
  const ccw = areaOf(pts) > 0 ? 1 : -1;
  return pts.map((p, i) => {
    const a = pts[(i - 1 + n) % n];
    const b = pts[(i + 1) % n];
    const e1x = p[0] - a[0];
    const e1y = p[1] - a[1];
    const e2x = b[0] - p[0];
    const e2y = b[1] - p[1];
    const l1 = Math.hypot(e1x, e1y) || 1;
    const l2 = Math.hypot(e2x, e2y) || 1;
    // outward normal of a CCW edge (dx, dy) is (dy, −dx)
    const n1x = (e1y / l1) * ccw;
    const n1y = (-e1x / l1) * ccw;
    const n2x = (e2y / l2) * ccw;
    const n2y = (-e2x / l2) * ccw;
    let nx = n1x + n2x;
    let ny = n1y + n2y;
    const ln = Math.hypot(nx, ny) || 1;
    nx /= ln;
    ny /= ln;
    const cosHalf = Math.max(0.35, nx * n1x + ny * n1y);
    return [p[0] + (nx * d) / cosHalf, p[1] + (ny * d) / cosHalf];
  });
}

/**
 * Extrude a shape lying in XZ (shape y → +z) from y0 up to y1, optionally with
 * rounded top and bottom edges that stay inside the outline. Normals are
 * creased so curved walls look smooth and square edges stay sharp.
 */
export function slab(shape: Shape, y0: number, y1: number, bevel = 0, curveSegments = 24, bevelSegments = 2) {
  const h = y1 - y0;
  const b = Math.max(0, Math.min(bevel, h / 2 - 1e-3));
  const g = new ExtrudeGeometry(shape, {
    depth: h - 2 * b,
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelOffset: -b,
    bevelSegments,
    curveSegments,
  });
  g.rotateX(Math.PI / 2);
  g.translate(0, y0 + h - b, 0);
  return crease(g);
}

/** Extrude a profile drawn in the XY plane along +Z from z0 to z1. */
export function extrudeZ(shape: Shape, z0: number, z1: number, bevel = 0) {
  const d = z1 - z0;
  const b = Math.max(0, Math.min(bevel, d / 2 - 1e-3));
  const g = new ExtrudeGeometry(shape, {
    depth: d - 2 * b,
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelOffset: -b,
    bevelSegments: 2,
    curveSegments: 16,
  });
  g.translate(0, 0, z0 + b);
  return crease(g);
}

/** Lathe (revolve about +Y) with crisp profile corners. `pts` are [radius, y]. */
export function lathe(pts: Pt[], segments = 64, phiStart = 0, phiLength = Math.PI * 2) {
  const g = new LatheGeometry(
    pts.map(([r, y]) => new Vector2(r, y)),
    segments,
    phiStart,
    phiLength,
  );
  return crease(g);
}

/** Non-indexed geometry with normals smoothed only across shallow edges. */
export function crease(g: BufferGeometry, angle = CREASE) {
  const out = toCreasedNormals(g, angle);
  g.dispose();
  return out;
}

/** Strip a geometry down to position/normal/uv (non-indexed) so it can be merged. */
export function plain(g: BufferGeometry) {
  const ng = g.index ? g.toNonIndexed() : g;
  for (const name of Object.keys(ng.attributes)) {
    if (name !== "position" && name !== "normal" && name !== "uv") ng.deleteAttribute(name);
  }
  if (!ng.getAttribute("normal")) ng.computeVertexNormals();
  if (!ng.getAttribute("uv")) {
    ng.setAttribute("uv", new Float32BufferAttribute(new Float32Array(ng.getAttribute("position").count * 2), 2));
  }
  return ng;
}

/** Merge geometries of any kind (indexed or not, with or without UVs). */
export function merge(list: BufferGeometry[]) {
  const g = mergeGeometries(list.map(plain));
  if (!g) throw new Error("hdd: mergeGeometries failed");
  return g;
}

/**
 * Box-projected UVs in millimetres / `tile`: each triangle takes the two axes
 * perpendicular to its dominant normal, so a tiling texture (cast metal grain)
 * wraps any merged shape without stretching.
 */
export function boxUV(g: BufferGeometry, tile: number) {
  const ng = g.index ? g.toNonIndexed() : g;
  const pos = ng.getAttribute("position") as BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    const n = b.clone().sub(a).cross(c.clone().sub(a));
    const ax = Math.abs(n.x);
    const ay = Math.abs(n.y);
    const az = Math.abs(n.z);
    for (let k = 0; k < 3; k++) {
      const v = k === 0 ? a : k === 1 ? b : c;
      let u = 0;
      let w = 0;
      if (ay >= ax && ay >= az) {
        u = v.x;
        w = v.z;
      } else if (ax >= az) {
        u = v.z;
        w = v.y;
      } else {
        u = v.x;
        w = v.y;
      }
      uv[(i + k) * 2] = u / tile;
      uv[(i + k) * 2 + 1] = w / tile;
    }
  }
  ng.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  return ng;
}

/**
 * Flat annulus in the XZ plane at height y with polar UVs: u runs around the
 * circle (0…1) and v from 1 at the rim to 0 at the hole, so a painter canvas
 * maps with x = angle and y = distance in from the rim.
 */
export function polarAnnulus(ri: number, ro: number, y: number, up: boolean, segs = 256, rings = 24) {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= rings; j++) {
    const r = ro - ((ro - ri) * j) / rings;
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
      nor.push(0, up ? 1 : -1, 0);
      uv.push(i / segs, 1 - j / rings);
    }
  }
  const row = segs + 1;
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < segs; i++) {
      const a = j * row + i;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      // Outer ring → inner ring with angle increasing toward +z: wind so the face points ±Y.
      if (up) idx.push(a, c, b, b, c, d);
      else idx.push(a, b, c, b, d, c);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Mirror a geometry across the XZ plane (y → −y), fixing the triangle winding. */
export function mirrorY(g: BufferGeometry) {
  const ng = plain(g.clone());
  ng.applyMatrix4(new Matrix4().makeScale(1, -1, 1));
  const p = ng.getAttribute("position").array as Float32Array;
  const n = ng.getAttribute("normal").array as Float32Array;
  const u = ng.getAttribute("uv").array as Float32Array;
  const swap = (arr: Float32Array, stride: number, i: number) => {
    for (let k = 0; k < stride; k++) {
      const t = arr[(i + 1) * stride + k];
      arr[(i + 1) * stride + k] = arr[(i + 2) * stride + k];
      arr[(i + 2) * stride + k] = t;
    }
  };
  for (let i = 0; i < p.length / 3; i += 3) {
    swap(p, 3, i);
    swap(n, 3, i);
    swap(u, 2, i);
  }
  return ng;
}

const up = new Vector3(0, 1, 0);

/** A thin rod between two points (for callout lines, pins, wires). */
export function beam(a: [number, number, number], b: [number, number, number], r: number, sides = 8) {
  const va = new Vector3(...a);
  const vb = new Vector3(...b);
  const len = va.distanceTo(vb);
  const g = new CylinderGeometry(r, r, len, sides, 1, false);
  const q = new Quaternion().setFromUnitVectors(up, vb.clone().sub(va).normalize());
  g.applyQuaternion(q);
  const mid = va.add(vb).multiplyScalar(0.5);
  g.translate(mid.x, mid.y, mid.z);
  return g;
}

/** Apply a transform to a clone (convenience for building merged parts). */
export function placed(g: BufferGeometry, m: Matrix4) {
  const c = g.clone();
  c.applyMatrix4(m);
  return c;
}
