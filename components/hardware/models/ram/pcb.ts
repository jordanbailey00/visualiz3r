import { ExtrudeGeometry, MeshPhysicalMaterial, type BufferAttribute } from "three";
import { FONT_COND, FONT_SANS, octilinear, painted, rng, type Painter, type Surface } from "@/lib/three/painter";
import type { PcbSurfaces } from "@/lib/three/pcbPaint";
import { cached, circlePath, polygonShape } from "../../kit/geometry";
import type { SmdSize } from "../../kit/Passives";
import { DRAM, HALF_L, INDUCTORS, PCB, PINS, PMIC, RGB_MCU, SPD_HUB, edgeY, pinX } from "./layout";

export type Side = "front" | "back";
type Pt = [number, number];
type Rect = [x0: number, y0: number, x1: number, y1: number];

// ---------------------------------------------------------------------------
// Outline & geometry
// ---------------------------------------------------------------------------

/** Tooling holes beside the first and last contacts. */
export const TOOLING_HOLES: Pt[] = [
  [-65.05, 2.9],
  [65.05, 2.9],
];
const HOLE_R = 0.55;

/** Latch notch on the right end, bottom → top (mirrored for the left end). */
function sideNotch(n0: number, n1: number, inset: number): Pt[] {
  const L = HALF_L - inset;
  const xin = HALF_L - PCB.sideNotchDepth - inset;
  const r = 0.8;
  const y0 = n0 - inset;
  const y1 = n1 + inset;
  const pts: Pt[] = [[L, y0]];
  for (let i = 0; i <= 6; i++) {
    const a = -Math.PI / 2 - (i / 6) * (Math.PI / 2);
    pts.push([xin + r + r * Math.cos(a), y0 + r + r * Math.sin(a)]);
  }
  for (let i = 0; i <= 6; i++) {
    const a = Math.PI - (i / 6) * (Math.PI / 2);
    pts.push([xin + r + r * Math.cos(a), y1 - r + r * Math.sin(a)]);
  }
  pts.push([L, y1]);
  return pts;
}

/**
 * Board outline in the XY plane (front view), shrunk by `inset` so that an
 * extrusion bevelled by the same amount ends up exactly at the JEDEC outline.
 */
export function boardOutline(inset: number): Pt[] {
  const b = inset;
  const L = HALF_L - b;
  const H = PCB.height - b;
  const cb = 0.45;
  const ct = 0.9;
  const ey = (x: number) => edgeY(x) + b;
  const [t0, t1] = PCB.edgeTaper;
  const k = PCB.key;
  const hw = k.width / 2 + b;
  const ch = 0.25;
  const arcY = k.depth - k.width / 2;
  const pts: Pt[] = [];
  // Contact edge, left → right, with the polarisation key.
  pts.push([-L, ey(-HALF_L) + cb], [-L + cb, ey(-HALF_L)], [-t1, ey(-t1)], [-t0, ey(-t0)]);
  pts.push([k.x - hw - ch, b], [k.x - hw, b + ch], [k.x - hw, arcY]);
  for (let i = 1; i < 14; i++) {
    const a = Math.PI - (i / 14) * Math.PI;
    pts.push([k.x + hw * Math.cos(a), arcY + hw * Math.sin(a)]);
  }
  pts.push([k.x + hw, arcY], [k.x + hw, b + ch], [k.x + hw + ch, b]);
  pts.push([t0, ey(t0)], [t1, ey(t1)], [L - cb, ey(HALF_L)], [L, ey(HALF_L) + cb]);
  // Right end with the two latch notches, then the top edge.
  for (const [n0, n1] of PCB.sideNotches) pts.push(...sideNotch(n0, n1, b));
  pts.push([L, H - ct], [L - ct, H], [-L + ct, H], [-L, H - ct]);
  // Left end, top → bottom (mirror of the right end).
  for (const [n0, n1] of [...PCB.sideNotches].reverse()) {
    pts.push(...sideNotch(n0, n1, b).map(([x, y]): Pt => [-x, y]).reverse());
  }
  return pts;
}

/**
 * The PCB as one bevelled extrusion with three material groups:
 * 0 = back face, 1 = front face, 2 = edges (bare FR-4 — the chamfered contact
 * edge shows the laminate). Face UVs map the board bounds to 0…1 so painter
 * canvases (mm, origin top-left as seen from that side) line up exactly.
 */
export function pcbGeometry() {
  return cached("ram-pcb", () => {
    const b = PCB.bevel;
    const shape = polygonShape(boardOutline(b));
    for (const [x, y] of TOOLING_HOLES) shape.holes.push(circlePath(x, y, HOLE_R + b));
    const depth = PCB.thickness - 2 * b;
    const g = new ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelThickness: b,
      bevelSize: b,
      bevelSegments: 1,
      curveSegments: 16,
    });
    g.translate(0, 0, -depth / 2);
    const lids = g.groups.find((gr) => gr.materialIndex === 0)!;
    const sides = g.groups.find((gr) => gr.materialIndex === 1)!;
    const pos = g.getAttribute("position") as BufferAttribute;
    const uv = g.getAttribute("uv") as BufferAttribute;
    for (let i = lids.start; i < lids.start + lids.count; i++) {
      const u = (pos.getX(i) + HALF_L) / PCB.length;
      const v = pos.getY(i) / PCB.height;
      uv.setXY(i, pos.getZ(i) > 0 ? u : 1 - u, v);
    }
    uv.needsUpdate = true;
    // ExtrudeGeometry writes the bottom lid (−Z, back) first, then the top lid.
    const half = lids.count / 2;
    g.clearGroups();
    g.addGroup(lids.start, half, 0);
    g.addGroup(lids.start + half, half, 1);
    g.addGroup(sides.start, sides.count, 2);
    return g;
  });
}

// ---------------------------------------------------------------------------
// Package & footprint data shared by painting and 3D
// ---------------------------------------------------------------------------

/** 82-ball FBGA map (package mm, +y = up the module): 2 × 3 columns, 14 rows. */
export const DRAM_BALLS: Pt[] = (() => {
  const out: Pt[] = [];
  const cols = [-3.2, -2.4, -1.6, 1.6, 2.4, 3.2];
  for (let r = 0; r < 14; r++) {
    for (const x of cols) {
      if (r === 13 && Math.abs(x) === 3.2) continue;
      out.push([x, (r - 6.5) * 0.8]);
    }
  }
  return out;
})();

/** SMD passives in world module coordinates: [X, Y, rotationDeg]. */
export type BoardItem = [X: number, Y: number, rot?: number];

export type PassiveGroup = "decoupling" | "pmic" | "resistors";

export interface PassiveSet {
  side: Side;
  group: PassiveGroup;
  size: SmdSize;
  kind: "cap" | "res";
  items: BoardItem[];
}

function colOf(x: number, y0: number, y1: number, n: number, rot = 0): BoardItem[] {
  const out: BoardItem[] = [];
  for (let i = 0; i < n; i++) out.push([x, y0 + ((y1 - y0) * i) / Math.max(1, n - 1), rot]);
  return out;
}

/**
 * Every SMD passive on the module: a column of decoupling capacitors beside
 * each DRAM (VDD, VDDQ and VPP), a 240 Ω ZQ calibration resistor per chip, the
 * PMIC's input/output capacitors and bulk capacitors behind it.
 */
export const PASSIVES: PassiveSet[] = (() => {
  const out: PassiveSet[] = [];
  for (const side of ["front", "back"] as Side[]) {
    const c0402: BoardItem[] = [];
    const c0201: BoardItem[] = [];
    const zq: BoardItem[] = [];
    DRAM.xs.forEach((x, i) => {
      c0402.push(...colOf(x - DRAM.w / 2 - 1.05, DRAM.y - 3.4, DRAM.y + 3.0, 5, 90));
      c0201.push([x - 2.6, DRAM.y + DRAM.h / 2 + 0.9, 0], [x + 2.6, DRAM.y + DRAM.h / 2 + 0.9, 0]);
      c0201.push([x + DRAM.w / 2 + 0.8, DRAM.y - 3.8, 90], [x + DRAM.w / 2 + 0.8, DRAM.y + 4.1, 90]);
      zq.push([x + DRAM.w / 2 + 0.8, DRAM.y + 1.0 + (i % 2) * 0.5, 90]);
    });
    out.push({ side, group: "decoupling", size: "0402", kind: "cap", items: c0402 });
    out.push({ side, group: "decoupling", size: "0201", kind: "cap", items: c0201 });
    out.push({ side, group: "resistors", size: "0201", kind: "res", items: zq });
  }
  // PMIC: 5 V input bulk capacitors and output capacitors on each rail.
  out.push({ side: "front", group: "pmic", size: "0805", kind: "cap", items: [[4.6, 11.9, 90], [6.9, 11.9, 90], [5.6, 15.4, 0]] });
  out.push({
    side: "front",
    group: "pmic",
    size: "0603",
    kind: "cap",
    items: [[-12.4, 17.3, 0], [-12.4, 15.6, 0], [-12.4, 13.9, 0], [-4.8, 9.6, 90], [-3.0, 9.6, 90], [0.4, 20.0, 0], [5.6, 18.4, 90], [-5.2, 19.3, 0]],
  });
  out.push({ side: "front", group: "pmic", size: "0402", kind: "cap", items: [[1.4, 12.1, 90], [0.4, 17.3, 0], [-0.9, 10.9, 0], [-14.6, 9.4, 90], [-10.7, 10.1, 90]] });
  // Small parts around the SPD hub and RGB controller.
  out.push({ side: "front", group: "decoupling", size: "0402", kind: "cap", items: [[5.6, 25.4, 90], [9.7, 23.7, 0], [9.9, 27.1, 90]] });
  out.push({ side: "front", group: "resistors", size: "0402", kind: "res", items: [[-10.6, 8.2, 0], [1.6, 9.8, 0], [3.5, 9.8, 0], [7.6, 22.9, 0]] });
  out.push({ side: "front", group: "resistors", size: "0201", kind: "res", items: [[-14.5, 11.3, 90], [-14.5, 7.6, 90], [5.4, 27.2, 0]] });
  // Back: bulk capacitors for VDD / VDDQ / VPP behind the PMIC.
  out.push({ side: "back", group: "decoupling", size: "0805", kind: "cap", items: [-6.0, -3.6, -1.2, 1.2, 3.6, 6.0].map((x): BoardItem => [x, 12.4, 90]) });
  out.push({ side: "back", group: "decoupling", size: "0603", kind: "cap", items: [-5.0, -2.0, 1.0, 4.0].map((x): BoardItem => [x, 16.6, 0]) });
  out.push({ side: "back", group: "decoupling", size: "0402", kind: "cap", items: [...colOf(-8.4, 8.6, 18.6, 6, 90), ...colOf(8.4, 8.6, 18.6, 6, 90)] });
  out.push({ side: "back", group: "resistors", size: "0402", kind: "res", items: [[-2.2, 21.0, 0], [2.2, 21.0, 0]] });
  return out;
})();

const SMD_SIZE: Record<SmdSize, [number, number]> = {
  "0201": [0.6, 0.3],
  "0402": [1.0, 0.5],
  "0603": [1.6, 0.8],
  "0805": [2.0, 1.25],
  "1206": [3.2, 1.6],
};

// ---------------------------------------------------------------------------
// Painting
// ---------------------------------------------------------------------------

/** Satin black solder mask with copper that shows through as faint relief. */
const S: PcbSurfaces = {
  mask: { color: "#131417", rough: 0.46, metal: 0, height: 0.3 },
  copper: { color: "#272a30", rough: 0.36, metal: 0.05, height: 0.6 },
  gold: { color: "#e2b862", rough: 0.22, metal: 1, height: 0.62 },
  tin: { color: "#c9ccd0", rough: 0.3, metal: 1, height: 0.6 },
  silk: { color: "#d9dad6", rough: 0.78, metal: 0, height: 0.7 },
  via: { color: "#24272c", rough: 0.36, metal: 0.04, height: 0.44 },
  hole: { color: "#0b0b0b", rough: 0.9, metal: 0, height: 0 },
  laminate: { color: "#2d2c22", rough: 0.62, metal: 0, height: 0.26 },
};
const VIA_RING: Surface = { color: "#2f3238", rough: 0.32, metal: 0.06, height: 0.64 };
const LASER: Surface = { color: "#b06a3e", rough: 0.4, metal: 0.8, height: 0.42 };

/** Footprints that scattered vias and traces keep clear of (world coords). */
function keepOuts(side: Side): Rect[] {
  const r: Rect[] = DRAM.xs.map((x): Rect => [x - DRAM.w / 2 - 1.6, DRAM.y - DRAM.h / 2 - 0.5, x + DRAM.w / 2 + 1.3, DRAM.y + DRAM.h / 2 + 1.4]);
  r.push([-HALF_L, 0, HALF_L, 5.4]);
  r.push([-HALF_L, 20.0, HALF_L, 23.6]);
  if (side === "front") {
    r.push([-15.4, 6.8, 8.6, 20.9]);
    r.push([4.2, 23.1, 11.2, 28.6]);
    r.push([-48, 26.6, 2, 30.6]);
    r.push([10.6, 26.2, 15.6, 30.4]);
  } else {
    r.push([-9.5, 7.6, 9.5, 21.8]);
    r.push([-46, 26.6, 46, 30.6]);
  }
  r.push([-60, 23.9, -55.5, 26.1]);
  return r;
}

function inside(rects: Rect[], x: number, y: number, m = 0) {
  return rects.some(([x0, y0, x1, y1]) => x > x0 - m && x < x1 + m && y > y0 - m && y < y1 + m);
}

/**
 * Paints one face. All coordinates below are world module coordinates (X along
 * the module, Y up); `P` maps them to the canvas as seen from that side.
 */
function paintSide(p: Painter, side: Side) {
  const sx = side === "front" ? 1 : -1;
  const cx = (X: number) => HALF_L + sx * X;
  const cy = (Y: number) => PCB.height - Y;
  const P = (X: number, Y: number): Pt => [cx(X), cy(Y)];
  const rect = (x0: number, y0: number, x1: number, y1: number, s: Surface) => {
    const a = cx(x0);
    const b = cx(x1);
    p.rect(Math.min(a, b), cy(Math.max(y0, y1)), Math.abs(b - a), Math.abs(y1 - y0), s);
  };
  const line = (pts: Pt[], w: number, s: Surface = S.copper) => p.polyline(pts.map(([x, y]) => P(x, y)), w, s);
  const dot = (x: number, y: number, r: number, s: Surface) => p.circle(cx(x), cy(y), r, s);
  const via = (x: number, y: number, r = 0.15) => {
    dot(x, y, r * 1.85, VIA_RING);
    dot(x, y, r, S.via);
  };
  const text = (str: string, x: number, y: number, size: number, opts: Parameters<Painter["text"]>[5] = {}) =>
    p.text(str, cx(x), cy(y), size, S.silk, { baseline: "middle", font: FONT_SANS, weight: 700, ...opts });
  const rand = rng(side === "front" ? 51 : 77);
  const avoid = keepOuts(side);

  // --- Planes and pours (copper under the mask) ---------------------------
  if (side === "front") {
    p.polygon([P(-15.6, 7.2), P(-6.8, 7.2), P(-6.8, 11.2), P(-0.2, 11.2), P(-0.2, 7.2), P(8.8, 7.2), P(8.8, 20.6), P(-15.6, 20.6)], S.copper);
  } else {
    p.polygon([P(-9.6, 7.4), P(9.6, 7.4), P(9.6, 21.7), P(-9.6, 21.7)], S.copper);
  }
  // Clearance channels that split the pours into rails.
  rect(-6.9, 7.2, -6.6, 20.6, S.mask);
  rect(-15.6, 13.6, -6.9, 13.9, S.mask);

  // --- Edge connector: bare laminate, gold pads, necks and finger vias ----
  rect(-HALF_L, 0, HALF_L, 3.3, S.laminate);
  for (let i = 0; i < 144; i++) {
    const x = pinX(i);
    const y0 = edgeY(x) + PINS.padGap;
    rect(x - PINS.padW / 2, y0, x + PINS.padW / 2, PINS.padTop, S.gold);
    rect(x - 0.13, PINS.padTop, x + 0.13, 3.35, S.gold);
    const vy = i % 2 ? 4.95 : 4.25;
    line([[x, 3.3], [x, vy]], 0.2);
    via(x, vy, 0.14);
  }

  // --- DRAM land patterns and their byte lanes ----------------------------
  DRAM.xs.forEach((dx, c) => {
    // 82 solder lands with dog-bone vias between them.
    for (const [bx, by] of DRAM_BALLS) dot(dx + bx, DRAM.y + by, 0.19, S.tin);
    for (const [bx, by] of DRAM_BALLS) {
      if (Math.abs(bx) > 3) continue;
      const vx = dx + bx + Math.sign(bx) * 0.4;
      const vy = DRAM.y + by + 0.4;
      line([[dx + bx, DRAM.y + by], [vx, vy]], 0.1);
      via(vx, vy, 0.1);
    }
    // Silkscreen: corner brackets, pin-1 mark and reference designator.
    const x0 = dx - DRAM.w / 2 - 0.35;
    const x1 = dx + DRAM.w / 2 + 0.35;
    const y0 = DRAM.y - DRAM.h / 2 - 0.35;
    const y1 = DRAM.y + DRAM.h / 2 + 0.35;
    const k = 1.2;
    for (const [ax, ay, bxx, byy] of [
      [x0, y0, 1, 1],
      [x1, y0, -1, 1],
      [x0, y1, 1, -1],
      [x1, y1, -1, -1],
    ]) {
      line([[ax + bxx * k, ay], [ax, ay], [ax, ay + byy * k]], 0.13, S.silk);
    }
    dot(x0 - 0.45, y0 + 0.5, 0.2, S.silk);
    const ref = side === "front" ? c + 1 : c + 9;
    text(`U${ref}`, dx, DRAM.y + DRAM.h / 2 + 1.55, 0.95, { align: "center" });

    // DQ lane: the contacts beneath the chip fan out, in order, to its lower
    // ball rows; some take length-matching serpentines on the way.
    const lane = Array.from({ length: 144 }, (_, i) => i).filter((i) => Math.abs(pinX(i) - dx) < 4.9);
    const sig = lane.filter((_, k) => k % 4 !== 3); // every fourth contact is ground
    const cols = [-3.2, -2.4, -1.6, 1.6, 2.4, 3.2];
    sig.forEach((i, k) => {
      const px = pinX(i);
      const vy = i % 2 ? 4.95 : 4.25;
      const col = cols[Math.min(5, Math.floor((k * 6) / sig.length))];
      const tx = dx + col + (k % 2 ? 0.2 : -0.2);
      const ty = DRAM.y - 5.2 + (k % 2) * 0.8;
      const pts: Pt[] = [[px, vy], [px, 5.5]];
      if (k % 3 === 1) {
        for (let s = 0; s < 3; s++) {
          const yy = 5.65 + s * 0.3;
          pts.push([px, yy], [px + 0.3, yy], [px + 0.3, yy + 0.15], [px, yy + 0.15]);
        }
      }
      const last = pts[pts.length - 1];
      pts.push(...octilinear(last[0], last[1] + 0.12, tx, ty, false));
      line(pts, 0.11);
    });
  });

  // --- Command/address fly-by bus above the chips ---------------------------
  const busY = 20.7;
  for (let t = 0; t < 14; t++) {
    const y = busY + t * 0.19;
    const xEnd = t % 3 === 0 ? 62.6 : 61.2;
    line([[-xEnd, y], [-17.5 + (t % 4) * 0.25, y]], 0.09);
    line([[17.5 - (t % 4) * 0.25, y], [xEnd, y]], 0.09);
  }
  // The bus dives through vias around the centre and is driven from inner layers.
  for (let t = 0; t < 14; t++) {
    via(-17.3 + (t % 4) * 0.25, busY + t * 0.19, 0.08);
    via(17.3 - (t % 4) * 0.25, busY + t * 0.19, 0.08);
  }
  for (const dx of DRAM.xs) {
    for (let t = 0; t < 10; t++) {
      const x = dx - 2.7 + t * 0.6;
      const y = busY + (t % 7) * 0.19;
      line([[x, y], [x, DRAM.y + DRAM.h / 2 + 0.2]], 0.08);
      via(x, y, 0.07);
    }
  }
  // Return-path stitching vias along the bus.
  for (let x = -62; x <= 62; x += 1.3) {
    if (Math.abs(x) < 18) continue;
    via(x, busY - 0.45, 0.1);
    via(x + 0.65, busY + 14 * 0.19 + 0.3, 0.1);
  }

  // --- Power: via arrays feeding each chip's supply balls -----------------
  for (const dx of DRAM.xs) {
    for (let j = 0; j < 4; j++) {
      for (const sgn of [-1, 1]) {
        via(dx + sgn * (DRAM.w / 2 + 0.15), DRAM.y - 4.4 + j * 2.6, 0.12);
      }
    }
  }

  // --- Side-specific components -----------------------------------------
  if (side === "front") {
    // PMIC: QFN land pattern with a thermal pad and its via array.
    const s = PMIC.size;
    rect(PMIC.x - 1.0, PMIC.y - 1.0, PMIC.x + 1.0, PMIC.y + 1.0, S.tin);
    for (let i = 0; i < 6; i++) {
      const o = -1.25 + i * 0.5;
      rect(PMIC.x + o - 0.12, PMIC.y + s / 2 - 0.45, PMIC.x + o + 0.12, PMIC.y + s / 2 + 0.05, S.tin);
      rect(PMIC.x + o - 0.12, PMIC.y - s / 2 - 0.05, PMIC.x + o + 0.12, PMIC.y - s / 2 + 0.45, S.tin);
      rect(PMIC.x + s / 2 - 0.45, PMIC.y + o - 0.12, PMIC.x + s / 2 + 0.05, PMIC.y + o + 0.12, S.tin);
      rect(PMIC.x - s / 2 - 0.05, PMIC.y + o - 0.12, PMIC.x - s / 2 + 0.45, PMIC.y + o + 0.12, S.tin);
    }
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) via(PMIC.x - 0.6 + i * 0.6, PMIC.y - 0.6 + j * 0.6, 0.1);
    line([[PMIC.x - s / 2 - 0.6, PMIC.y + s / 2 + 0.6], [PMIC.x - s / 2 - 0.6, PMIC.y - s / 2 - 0.6], [PMIC.x + s / 2 + 0.6, PMIC.y - s / 2 - 0.6]], 0.12, S.silk);
    dot(PMIC.x - s / 2 - 0.9, PMIC.y + s / 2 + 0.9, 0.18, S.silk);
    text("U17", PMIC.x, PMIC.y + s / 2 + 1.25, 0.8, { align: "center" });
    // Inductor terminals.
    INDUCTORS.forEach((l, i) => {
      rect(l.x - l.w / 2 - 0.1, l.y - l.h / 2 + 0.15, l.x - l.w / 2 + 0.55, l.y + l.h / 2 - 0.15, S.tin);
      rect(l.x + l.w / 2 - 0.55, l.y - l.h / 2 + 0.15, l.x + l.w / 2 + 0.1, l.y + l.h / 2 - 0.15, S.tin);
      text(`L${i + 1}`, l.x - l.w / 2 - 0.9, l.y, 0.7, { align: "center", rotate: -90 * sx });
    });
    // SPD hub (DFN-8) and the RGB controller (QFN).
    for (let i = 0; i < 4; i++) {
      const o = -0.75 + i * 0.5;
      rect(SPD_HUB.x - 1.05, SPD_HUB.y + o - 0.12, SPD_HUB.x - 0.6, SPD_HUB.y + o + 0.12, S.tin);
      rect(SPD_HUB.x + 0.6, SPD_HUB.y + o - 0.12, SPD_HUB.x + 1.05, SPD_HUB.y + o + 0.12, S.tin);
    }
    rect(SPD_HUB.x - 0.4, SPD_HUB.y - 0.7, SPD_HUB.x + 0.4, SPD_HUB.y + 0.7, S.tin);
    text("U18", SPD_HUB.x, SPD_HUB.y - 1.75, 0.75, { align: "center" });
    text("U19", RGB_MCU.x, RGB_MCU.y + 2.35, 0.75, { align: "center" });
    rect(RGB_MCU.x - 0.8, RGB_MCU.y - 0.8, RGB_MCU.x + 0.8, RGB_MCU.y + 0.8, S.tin);
    // Sideband (I3C) bus from the centre contacts to the hub, PMIC and RGB controller.
    line([[pinX(70), 4.95], [pinX(70), 6.3], [-11.2, 6.3], [SPD_HUB.x + 1.05, SPD_HUB.y - 0.25]], 0.1);
    line([[pinX(72), 4.95], [pinX(72), 6.6], [-10.9, 6.6], [SPD_HUB.x + 1.05, SPD_HUB.y + 0.25]], 0.1);
    line([[SPD_HUB.x + 1.05, SPD_HUB.y + 0.75], [-10.2, 11.0], [-10.2, 19.9], [6.1, 19.9], [6.1, 24.0], [RGB_MCU.x - 1.5, RGB_MCU.y - 0.75]], 0.1);
    // VIN_BULK (5 V) entry: wide traces from the centre contacts to the input caps.
    line([[pinX(76), 4.25], [pinX(76), 7.0], [5.7, 9.2], [5.7, 11.0]], 0.45);
    line([[pinX(78), 4.25], [pinX(78), 7.2]], 0.45);
    // Laser-etched data-matrix code for traceability.
    const dmx = 12.6;
    const dmy = 28.0;
    const n = 12;
    const cell = 0.22;
    rect(dmx - 0.1, dmy - 0.1, dmx + n * cell + 0.1, dmy + n * cell + 0.1, LASER);
    const dr = rng(9);
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const edge = i === 0 || j === 0;
        const clock = (i === n - 1 && j % 2 === 0) || (j === n - 1 && i % 2 === 0);
        if (edge || clock || (!(i === n - 1 || j === n - 1) && dr() > 0.5)) {
          rect(dmx + i * cell, dmy + j * cell, dmx + (i + 1) * cell, dmy + (j + 1) * cell, { color: "#3c2618", rough: 0.7, metal: 0.2, height: 0.4 });
        }
      }
    // Test points (VIN, VDD, GND) near the left end.
    for (let i = 0; i < 3; i++) dot(-58.6 + i * 1.0, 25.0, 0.32, i === 1 ? S.tin : S.gold);
    // Board identity.
    p.text("DDR5 UDIMM  2Rx8  RC-B1", cx(-47), cy(29.6), 1.25, S.silk, { font: FONT_SANS, weight: 800, letterSpacing: 0.12, baseline: "middle" });
    p.text("REV 1.0   94V-0   E-472219   2509", cx(-47), cy(27.7), 0.85, S.silk, { font: FONT_COND, weight: 600, baseline: "middle" });
  } else {
    p.text("PC5  2R x8  32GB  NON-ECC", cx(-44), cy(29.6), 1.2, S.silk, { font: FONT_SANS, weight: 800, letterSpacing: 0.12, baseline: "middle" });
    p.text("ASSY 7A-0219   LOT 2509-118   MADE IN TAIWAN", cx(-44), cy(27.7), 0.85, S.silk, { font: FONT_COND, weight: 600, baseline: "middle" });
    for (let i = 0; i < 6; i++) via(-7.2 + i * 2.9, 20.4, 0.16);
  }

  // Pads for every passive we place (visible when parts lift off).
  for (const set of PASSIVES) {
    if (set.side !== side) continue;
    const [l, w] = SMD_SIZE[set.size];
    for (const [x, y, r = 0] of set.items) {
      const vertical = Math.round(r / 90) % 2 === 1;
      const pl = l * 0.34;
      for (const sg of [-1, 1]) {
        const ox = vertical ? 0 : sg * (l / 2 - pl / 2);
        const oy = vertical ? sg * (l / 2 - pl / 2) : 0;
        const hw = vertical ? w / 2 : pl / 2;
        const hh = vertical ? pl / 2 : w / 2;
        rect(x + ox - hw - 0.04, y + oy - hh - 0.04, x + ox + hw + 0.04, y + oy + hh + 0.04, S.tin);
      }
    }
  }

  // --- Scattered vias and short routing in the open areas -----------------
  let n = 0;
  let guard = 0;
  while (n < 900 && guard++ < 20000) {
    const x = -HALF_L + 2 + rand() * (PCB.length - 4);
    const y = 5.7 + rand() * (PCB.height - 6.9);
    if (inside(avoid, x, y, 0.4)) continue;
    if (Math.abs(x) > HALF_L - PCB.sideNotchDepth - 1 && y > 7 && y < 18.6) continue;
    via(x, y, 0.13);
    n++;
  }
  for (let i = 0; i < 70; i++) {
    const x = -HALF_L + 3 + rand() * (PCB.length - 6);
    const y = 23.9 + rand() * 5.6;
    if (inside(avoid, x, y, 0.6)) continue;
    const len = 2 + rand() * 7;
    const pts = octilinear(x, y, x + (rand() > 0.5 ? len : -len), y + (rand() - 0.5) * 2.4, true);
    if (pts.some(([px, py]) => inside(avoid, px, py, 0.4) || Math.abs(px) > HALF_L - 2.5 || py > PCB.height - 1.2)) continue;
    line(pts, 0.1);
    via(pts[0][0], pts[0][1], 0.1);
    via(pts[pts.length - 1][0], pts[pts.length - 1][1], 0.1);
  }
  // Regular stitching rows along the top edge.
  for (let x = -HALF_L + 2.4; x < HALF_L - 2.2; x += 1.15) {
    if (side === "front" && x > -48.5 && x < 2.5) continue;
    if (side === "back" && x > -46.5 && x < 46.5) continue;
    via(x, PCB.height - 1.3, 0.12);
  }

  // --- Fiducials, tooling holes, pin numbers ---------------------------------
  for (const [x, y] of [
    [-63.8, 29.4],
    [63.8, 29.4],
  ] as Pt[]) {
    dot(x, y, 1.0, S.laminate);
    dot(x, y, 0.5, S.gold);
  }
  for (const [x, y] of TOOLING_HOLES) dot(x, y, HOLE_R + 0.25, S.laminate);
  const first = side === "front" ? "1" : "145";
  const last = side === "front" ? "144" : "288";
  text(first, pinX(0), 6.0, 0.85, { align: "center" });
  text(last, pinX(143), 6.0, 0.85, { align: "center" });
}

let pcbMats: [MeshPhysicalMaterial, MeshPhysicalMaterial] | null = null;

/** Painted front and back materials of the module PCB. */
export function pcbMaterials() {
  if (pcbMats) return pcbMats;
  const mat = (side: Side) => {
    const maps = painted(`ram-pcb:${side}`, PCB.length, PCB.height, 24, S.mask, (p) => paintSide(p, side));
    return new MeshPhysicalMaterial({
      map: maps.map,
      roughnessMap: maps.rmMap,
      metalnessMap: maps.rmMap,
      bumpMap: maps.bumpMap,
      bumpScale: 0.45,
      roughness: 1,
      metalness: 1,
      clearcoat: 0.3,
      clearcoatRoughness: 0.42,
    });
  };
  pcbMats = [mat("back"), mat("front")];
  return pcbMats;
}

/** World (X, Y) on a face → SmdField local (x, z) inside a <Face>. */
export function faceItems(side: Side, items: BoardItem[]): [number, number, number][] {
  const sx = side === "front" ? 1 : -1;
  return items.map(([x, y, r = 0]) => [sx * x, -y, r]);
}
