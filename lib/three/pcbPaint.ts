import { FONT_SANS, octilinear, rng, type Painter, type Surface } from "./painter";

export type MaskColor = "green" | "black" | "blue" | "red" | "white" | "purple";

/** Surfaces for one solder-mask style. */
export interface PcbSurfaces {
  /** Solder mask over bare laminate. */
  mask: Surface;
  /** Solder mask over copper (traces, pours) — slightly lighter and raised. */
  copper: Surface;
  /** Exposed gold (ENIG) pads. */
  gold: Surface;
  /** Exposed tin/HASL pads. */
  tin: Surface;
  /** Silkscreen ink. */
  silk: Surface;
  /** Tented via: a tiny dimple under the mask. */
  via: Surface;
  /** Drilled hole (dark). */
  hole: Surface;
  /** Bare laminate (mask-free keep-outs). */
  laminate: Surface;
}

const MASKS: Record<MaskColor, { mask: string; copper: string; silk: string }> = {
  green: { mask: "#1d4b2c", copper: "#2f6a3a", silk: "#e8ece6" },
  black: { mask: "#111214", copper: "#1b1d20", silk: "#dcdcdc" },
  blue: { mask: "#132e66", copper: "#1d438c", silk: "#e9ecf2" },
  red: { mask: "#6b1414", copper: "#8a2020", silk: "#f0e8e8" },
  white: { mask: "#e9e9e4", copper: "#dcdcd2", silk: "#151515" },
  purple: { mask: "#3a1d5c", copper: "#4c2a74", silk: "#ece6f2" },
};

export function pcbSurfaces(mask: MaskColor): PcbSurfaces {
  const m = MASKS[mask];
  return {
    mask: { color: m.mask, rough: 0.42, metal: 0, height: 0.3 },
    copper: { color: m.copper, rough: 0.38, metal: 0.05, height: 0.55 },
    gold: { color: "#e8bd62", rough: 0.2, metal: 1, height: 0.62 },
    tin: { color: "#c4c8cc", rough: 0.3, metal: 1, height: 0.62 },
    silk: { color: m.silk, rough: 0.75, metal: 0, height: 0.68 },
    via: { color: m.copper, rough: 0.36, metal: 0.05, height: 0.42 },
    hole: { color: "#0b0b0b", rough: 0.9, metal: 0, height: 0 },
    laminate: { color: "#6f7448", rough: 0.7, metal: 0, height: 0.25 },
  };
}

/** A bundle of parallel traces routed octilinearly from one area to another. */
export function traceBus(
  p: Painter,
  s: PcbSurfaces,
  from: [number, number],
  to: [number, number],
  count: number,
  pitch: number,
  width: number,
  horizontalFirst?: boolean,
) {
  const [ax, ay] = from;
  const [bx, by] = to;
  const horiz = horizontalFirst ?? Math.abs(bx - ax) >= Math.abs(by - ay);
  for (let i = 0; i < count; i++) {
    const o = (i - (count - 1) / 2) * pitch;
    const pts = horiz
      ? octilinear(ax, ay + o, bx, by + o, true)
      : octilinear(ax + o, ay, bx + o, by, false);
    p.polyline(pts, width, s.copper);
  }
}

/** BGA land pattern: grid of copper/gold pads, optionally with a hollow centre. */
export function bgaLand(
  p: Painter,
  s: PcbSurfaces,
  cx: number,
  cy: number,
  cols: number,
  rows: number,
  pitch: number,
  padD: number,
  opts: { hollow?: number; surface?: Surface } = {},
) {
  const surf = opts.surface ?? s.gold;
  const x0 = cx - ((cols - 1) * pitch) / 2;
  const y0 = cy - ((rows - 1) * pitch) / 2;
  const hc = opts.hollow ?? 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      if (hc > 0) {
        const di = Math.abs(i - (cols - 1) / 2);
        const dj = Math.abs(j - (rows - 1) / 2);
        if (di < hc / 2 && dj < hc / 2) continue;
      }
      p.circle(x0 + i * pitch, y0 + j * pitch, padD / 2, surf);
    }
  }
}

/** Dog-bone via fan-out around a BGA: each pad gets a diagonal stub to a via. */
export function bgaFanout(
  p: Painter,
  s: PcbSurfaces,
  cx: number,
  cy: number,
  cols: number,
  rows: number,
  pitch: number,
) {
  const x0 = cx - ((cols - 1) * pitch) / 2;
  const y0 = cy - ((rows - 1) * pitch) / 2;
  for (let j = 0; j < rows - 1; j += 1) {
    for (let i = 0; i < cols - 1; i += 1) {
      if ((i + j) % 2) continue;
      const x = x0 + i * pitch + pitch / 2;
      const y = y0 + j * pitch + pitch / 2;
      p.circle(x, y, pitch * 0.22, s.via);
    }
  }
}

/** Randomly scattered tented vias inside a rectangle. */
export function viaField(
  p: Painter,
  s: PcbSurfaces,
  x: number,
  y: number,
  w: number,
  h: number,
  count: number,
  seed: number,
  r = 0.25,
) {
  const rand = rng(seed);
  for (let i = 0; i < count; i++) {
    const vx = x + rand() * w;
    const vy = y + rand() * h;
    p.circle(vx, vy, r * 1.6, s.copper);
    p.circle(vx, vy, r * 0.75, s.via);
  }
}

/** A row of stitching vias along a polyline (ground fences, edge stitching). */
export function stitchRow(
  p: Painter,
  s: PcbSurfaces,
  pts: [number, number][],
  spacing: number,
  r = 0.25,
) {
  for (let k = 0; k < pts.length - 1; k++) {
    const [ax, ay] = pts[k];
    const [bx, by] = pts[k + 1];
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.floor(len / spacing));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t;
      p.circle(x, y, r * 1.5, s.copper);
      p.circle(x, y, r * 0.7, s.via);
    }
  }
}

/** Two-terminal SMD footprint (pads + optional silk outline). */
export function smdPads(
  p: Painter,
  s: PcbSurfaces,
  x: number,
  y: number,
  len: number,
  wid: number,
  rotDeg = 0,
  surface: Surface = s.tin,
) {
  const padL = len * 0.32;
  const rot = (rotDeg * Math.PI) / 180;
  const ux = Math.cos(rot);
  const uy = Math.sin(rot);
  for (const sign of [-1, 1]) {
    const px = x + ux * sign * (len / 2 - padL / 2);
    const py = y + uy * sign * (len / 2 - padL / 2);
    p.shape((ctx) => {
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(rot);
      ctx.rect(-padL / 2, -wid / 2, padL, wid);
      ctx.restore();
    }, surface);
  }
}

/** Silkscreen reference designator. */
export function silk(
  p: Painter,
  s: PcbSurfaces,
  text: string,
  x: number,
  y: number,
  size = 0.9,
  rotate = 0,
  align: CanvasTextAlign = "center",
) {
  p.text(text, x, y, size, s.silk, { align, baseline: "middle", rotate, weight: 700, font: FONT_SANS });
}

/** Silkscreen outline of a component footprint, with a pin-1 tick. */
export function silkOutline(
  p: Painter,
  s: PcbSurfaces,
  x: number,
  y: number,
  w: number,
  h: number,
  line = 0.15,
  pin1 = true,
) {
  p.strokeRect(x, y, w, h, line, s.silk);
  if (pin1) p.circle(x - line * 3, y - line * 3, line * 1.6, s.silk);
}

/**
 * Meandering "random routing" — gives large board areas a believable texture
 * of signal traces with 45° bends between scattered points.
 */
export function randomTraces(
  p: Painter,
  s: PcbSurfaces,
  x: number,
  y: number,
  w: number,
  h: number,
  count: number,
  seed: number,
  width = 0.12,
) {
  const rand = rng(seed);
  for (let i = 0; i < count; i++) {
    const ax = x + rand() * w;
    const ay = y + rand() * h;
    const len = 3 + rand() * Math.min(w, h) * 0.5;
    const ang = Math.floor(rand() * 8) * (Math.PI / 4);
    const bx = Math.min(x + w, Math.max(x, ax + Math.cos(ang) * len));
    const by = Math.min(y + h, Math.max(y, ay + Math.sin(ang) * len));
    const pts = octilinear(ax, ay, bx, by, rand() > 0.5);
    const lanes = 1 + Math.floor(rand() * 4);
    for (let k = 0; k < lanes; k++) {
      const o = k * width * 3;
      p.polyline(
        pts.map(([px, py]) => [px + o, py + o] as [number, number]),
        width,
        s.copper,
      );
    }
    p.circle(ax, ay, width * 2.2, s.copper);
    p.circle(ax, ay, width * 1.1, s.via);
    p.circle(bx, by, width * 2.2, s.copper);
    p.circle(bx, by, width * 1.1, s.via);
  }
}

/** Copper pour (plane) under the mask with a clearance border. */
export function pour(p: Painter, s: PcbSurfaces, pts: [number, number][]) {
  p.polygon(pts, s.copper);
}

/** Mounting hole with an exposed plated ring. */
export function mountingRing(p: Painter, s: PcbSurfaces, x: number, y: number, holeR: number, ringW: number, surface?: Surface) {
  p.circle(x, y, holeR + ringW, surface ?? s.gold);
  p.circle(x, y, holeR, s.hole);
}
