"use client";

import { useMemo } from "react";
import {
  ExtrudeGeometry,
  LatheGeometry,
  MeshPhysicalMaterial,
  Path,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
  Vector2,
  type Material,
  type MeshPhysicalMaterialParameters,
} from "three";
import { painted, type PaintedMaps, type Painter, type Surface } from "@/lib/three/painter";
import { boundsOf, cached, extrudedWalls, flatFace, type FlatBounds } from "../../kit/geometry";

type Pt = [number, number];

// ---------------------------------------------------------------------------
// 2D outlines
// ---------------------------------------------------------------------------

/**
 * Replace every corner of a polygon by a circular fillet of the given radius
 * (convex and concave corners alike). Returns the sampled outline.
 */
export function roundedPolygon(pts: Pt[], radii: number | number[], segments = 6): Pt[] {
  const n = pts.length;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const P = pts[i];
    const A = pts[(i - 1 + n) % n];
    const B = pts[(i + 1) % n];
    const r = Array.isArray(radii) ? radii[i] : radii;
    const ul = Math.hypot(A[0] - P[0], A[1] - P[1]);
    const vl = Math.hypot(B[0] - P[0], B[1] - P[1]);
    if (!r || ul < 1e-6 || vl < 1e-6) {
      out.push(P);
      continue;
    }
    const u: Pt = [(A[0] - P[0]) / ul, (A[1] - P[1]) / ul];
    const v: Pt = [(B[0] - P[0]) / vl, (B[1] - P[1]) / vl];
    const theta = Math.acos(Math.min(1, Math.max(-1, u[0] * v[0] + u[1] * v[1])));
    if (theta < 1e-3 || Math.PI - theta < 1e-3) {
      out.push(P);
      continue;
    }
    // Tangent distance, clamped so neighbouring fillets never overlap.
    const t = Math.min(r / Math.tan(theta / 2), ul / 2, vl / 2);
    const rr = t * Math.tan(theta / 2);
    const bl = Math.hypot(u[0] + v[0], u[1] + v[1]);
    const dc = rr / Math.sin(theta / 2);
    const C: Pt = [P[0] + ((u[0] + v[0]) / bl) * dc, P[1] + ((u[1] + v[1]) / bl) * dc];
    const a1 = Math.atan2(P[1] + u[1] * t - C[1], P[0] + u[0] * t - C[0]);
    const a2 = Math.atan2(P[1] + v[1] * t - C[1], P[0] + v[0] * t - C[0]);
    let da = a2 - a1;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    for (let k = 0; k <= segments; k++) {
      const a = a1 + (da * k) / segments;
      out.push([C[0] + rr * Math.cos(a), C[1] + rr * Math.sin(a)]);
    }
  }
  return out;
}

export interface NotchSpec {
  /** Notch centres along each side (same on all four sides). */
  centers: number[];
  width: number;
  depth: number;
  /** Fillet where the notch meets the edge, and at its inner corners. */
  outerR: number;
  innerR: number;
}

/**
 * A rounded square (half-size `half`) with rectangular cut-outs on all four
 * sides — the outline of the heat spreader. Shape y maps to world z.
 */
export function notchedSquarePoints(half: number, cornerR: number, notch?: NotchSpec, segments = 5): Pt[] {
  const side: Pt[] = [];
  const radii: number[] = [];
  side.push([-half, -half]);
  radii.push(cornerR);
  if (notch) {
    for (const c of [...notch.centers].sort((a, b) => a - b)) {
      const x0 = c - notch.width / 2;
      const x1 = c + notch.width / 2;
      const y = -half + notch.depth;
      side.push([x0, -half], [x0, y], [x1, y], [x1, -half]);
      radii.push(notch.outerR, notch.innerR, notch.innerR, notch.outerR);
    }
  }
  // Rotate the first side by 90° steps to build the other three.
  const pts: Pt[] = [];
  const allR: number[] = [];
  for (let k = 0; k < 4; k++) {
    for (let i = 0; i < side.length; i++) {
      let [x, y] = side[i];
      for (let j = 0; j < k; j++) [x, y] = [-y, x];
      pts.push([x, y]);
      allR.push(radii[i]);
    }
  }
  return roundedPolygon(pts, allR, segments);
}

export function shapeFrom(pts: Pt[], holes: Pt[][] = []) {
  const s = new Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  s.closePath();
  for (const h of holes) s.holes.push(pathFrom(h));
  return s;
}

export function pathFrom(pts: Pt[]) {
  const p = new Path();
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
  p.closePath();
  return p;
}

/** Axis-aligned rounded rectangle as points, centred on (cx, cy). */
export function roundedRectPoints(cx: number, cy: number, w: number, h: number, r: number, segments = 5): Pt[] {
  return roundedPolygon(
    [
      [cx - w / 2, cy - h / 2],
      [cx + w / 2, cy - h / 2],
      [cx + w / 2, cy + h / 2],
      [cx - w / 2, cy + h / 2],
    ],
    r,
    segments,
  );
}

export function circlePoints(cx: number, cy: number, r: number, n = 24): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (-i / n) * Math.PI * 2;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 3D helpers
// ---------------------------------------------------------------------------

/**
 * Extrude a shape lying in XZ (shape y → +z) to span exactly y0…y1, with an
 * optional bevel that rounds the edges without growing the footprint.
 */
export function extrudeY(shape: Shape, y0: number, y1: number, bevel = 0, curveSegments = 6) {
  const b = Math.min(bevel, (y1 - y0) / 2.2);
  const depth = y1 - y0 - 2 * b;
  const g = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelOffset: -b,
    bevelSegments: 2,
    curveSegments,
  });
  g.rotateX(Math.PI / 2);
  g.translate(0, y1 - b, 0);
  return g;
}

/** A decal plane facing +Y (top) or −Y (bottom); canvas top → −Z. */
export function decalPlane(w: number, d: number, bottom = false) {
  return cached(`cpu-decal:${w}:${d}:${bottom}`, () => {
    const g = new PlaneGeometry(w, d);
    g.rotateX(bottom ? Math.PI / 2 : -Math.PI / 2);
    return g;
  });
}

/** Time spent painting each texture (ms), for checking the load budget in development. */
const paintLog: Record<string, number> = {};
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  (window as unknown as { __cpuPaint: typeof paintLog }).__cpuPaint = paintLog;
}

/** `painted` (cached canvas painting) with timing in development. */
export function paintOnce(
  key: string,
  w: number,
  h: number,
  ppm: number,
  base: Surface,
  paint: (p: Painter) => void,
  opts?: { anisotropy?: number },
): PaintedMaps {
  return painted(key, w, h, ppm, base, (p) => timedPaint(key, () => paint(p)), opts);
}

/** Run a painting callback and record how long it took. */
export function timedPaint(key: string, fn: () => void) {
  const t0 = performance.now();
  fn();
  paintLog[key] = Math.round((performance.now() - t0) * 10) / 10;
}

const paintedMats = new Map<string, MeshPhysicalMaterial>();

/** PBR material from painted maps (cached by key). */
export function paintedMaterial(key: string, maps: PaintedMaps, extra: MeshPhysicalMaterialParameters = {}) {
  let m = paintedMats.get(key);
  if (!m) {
    m = new MeshPhysicalMaterial({
      map: maps.map,
      roughnessMap: maps.rmMap,
      metalnessMap: maps.rmMap,
      bumpMap: maps.bumpMap,
      bumpScale: 0.35,
      roughness: 1,
      metalness: 1,
      ...extra,
    });
    m.name = key;
    paintedMats.set(key, m);
  }
  return m;
}

/** Painter transform so canvas coordinates equal shape coordinates (top face). */
export function alignTop(ctxs: CanvasRenderingContext2D[], b: FlatBounds) {
  for (const c of ctxs) c.translate(-b.minX, -b.minY);
}

/** Painter transform for a bottom face seen from below (mirrored in x). */
export function alignBottom(ctxs: CanvasRenderingContext2D[], b: FlatBounds) {
  for (const c of ctxs) {
    c.translate(b.w, 0);
    c.scale(-1, 1);
    c.translate(-b.minX, -b.minY);
  }
}

export function shapeBounds(shape: Shape): FlatBounds {
  return boundsOf(shape.getPoints(8));
}

/**
 * A flat plate cut from a shape: separately textured top and bottom faces
 * plus side walls (like the kit Board, but with free materials). Spans y0…y1.
 */
export function Slab({
  shape,
  y0,
  y1,
  top,
  bottom,
  side,
  castShadow = true,
}: {
  shape: Shape;
  y0: number;
  y1: number;
  top: Material;
  bottom?: Material;
  side: Material;
  castShadow?: boolean;
}) {
  const geo = useMemo(() => {
    const b = shapeBounds(shape);
    return {
      top: flatFace(shape, b, false),
      bottom: flatFace(shape, b, true),
      walls: extrudedWalls(shape, y1 - y0),
    };
  }, [shape, y0, y1]);
  return (
    <group>
      <mesh geometry={geo.top} material={top} position-y={y1} castShadow={castShadow} receiveShadow />
      {bottom && <mesh geometry={geo.bottom} material={bottom} position-y={y0} receiveShadow />}
      <mesh geometry={geo.walls} material={side} position-y={y1} castShadow={castShadow} receiveShadow />
    </group>
  );
}

// ---------------------------------------------------------------------------
// LGA land grid
// ---------------------------------------------------------------------------

export const LGA = { px: 0.81, pz: 0.94, cols: 46, rows: 39, count: 1718, padD: 0.6 };

let lgaCache: Pt[] | null = null;

/**
 * Exactly 1718 land positions (package-local x, z) on a staggered
 * 0.81 × 0.94 mm grid. Corners are chamfered, more at the pin-1 corner
 * (front-left), which is how the count is trimmed to 1718.
 */
export function lgaPoints(): Pt[] {
  if (lgaCache) return lgaCache;
  const { px, pz, cols, rows } = LGA;
  const all: Pt[] = [];
  for (let r = 0; r < rows; r++) {
    const odd = r % 2 === 1;
    const n = odd ? cols - 1 : cols;
    const x0 = -((cols - 1) * px) / 2 + (odd ? px / 2 : 0);
    const z = -((rows - 1) * pz) / 2 + r * pz;
    for (let i = 0; i < n; i++) all.push([x0 + i * px, z]);
  }
  const hx = ((cols - 1) * px) / 2;
  const hz = ((rows - 1) * pz) / 2;
  const score = ([x, z]: Pt) => Math.abs(x) / hx + Math.abs(z) / hz + (x < 0 && z > 0 ? 0.035 : 0);
  const order = all.map((p, i) => ({ p, i, s: score(p) })).sort((a, b) => b.s - a.s || a.i - b.i);
  const drop = new Set(order.slice(0, all.length - LGA.count).map((o) => o.i));
  lgaCache = all.filter((_, i) => !drop.has(i));
  return lgaCache;
}

// ---------------------------------------------------------------------------
// Screws
// ---------------------------------------------------------------------------

const recessMat = new MeshPhysicalMaterial({
  color: "#08090a",
  roughness: 0.85,
  metalness: 0.3,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
});

/**
 * Pan head with a flat crown (so the drive recess sits flush on it). The
 * lathe profile runs bottom → top: LatheGeometry winds its faces outward
 * only in that direction.
 */
function panHead(d: number, h: number) {
  return cached(`cpu-panhead:${d}:${h}`, () => {
    const r = d / 2;
    const top: Vector2[] = [new Vector2(0, h), new Vector2(r * 0.66, h)];
    for (let i = 1; i <= 6; i++) {
      const a = (i / 6) * (Math.PI / 2);
      top.push(new Vector2(r * 0.66 + r * 0.34 * Math.sin(a), h - h * 0.55 * (1 - Math.cos(a))));
    }
    const pts = [new Vector2(0, 0), new Vector2(r, 0), ...top.reverse()];
    return new LatheGeometry(pts, 32);
  });
}

/** Flat drive recess: a Phillips cross or a six-lobe star, as a dark inlay. */
function recess(d: number, drive: "phillips" | "torx") {
  return cached(`cpu-recess:${d}:${drive}`, () => {
    const pts: Pt[] = [];
    const R = d * 0.24;
    if (drive === "phillips") {
      const w = d * 0.07;
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2;
        const c = Math.cos(a);
        const s = Math.sin(a);
        // Inner corner before the arm, then the two corners of its tip
        // (counter-clockwise, so the four arms trace one closed outline).
        const arm: Pt[] = [
          [w, -w],
          [R, -w * 0.6],
          [R, w * 0.6],
        ];
        for (const [x, y] of arm) pts.push([x * c - y * s, x * s + y * c]);
      }
    } else {
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        const r = R * (0.78 + 0.22 * Math.cos(a * 6));
        pts.push([r * Math.cos(a), r * Math.sin(a)]);
      }
    }
    const g = new ShapeGeometry(shapeFrom(pts));
    g.rotateX(-Math.PI / 2);
    return g;
  });
}

/** A screw head seated on y = 0 of its parent. */
export function PanScrew({
  position,
  diameter,
  height,
  drive,
  material,
}: {
  position: [number, number, number];
  diameter: number;
  height: number;
  drive: "phillips" | "torx";
  material: Material;
}) {
  return (
    <group position={position}>
      <mesh geometry={panHead(diameter, height)} material={material} castShadow receiveShadow />
      <mesh geometry={recess(diameter, drive)} material={recessMat} position-y={height + 0.004} />
    </group>
  );
}
