import { FONT_SANS, rng, type Painter, type Surface } from "@/lib/three/painter";

/**
 * Floorplans of the dies, in die millimetres with the origin at the top-left
 * corner of the circuit side (x right, y down = toward +Z in the world).
 *
 * The same layout drives three things: the die shot painted on each real
 * die, the magnified labelled floorplan, and the raised 3D blocks on it, so
 * the magnified view lines up exactly with the chip it grows out of.
 */

export interface FpRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Compute die (CCD): 8 cores in two columns around a shared L3. */
export const CCD = { w: 10.7, h: 6.6 };
/** One core slot: logic block + private L2, 1.38 mm tall. */
export const CORE = { logicW: 2.3, l2W: 1.05, gap: 0.05, h: 1.38 };

export interface CoreSlot {
  index: number;
  /** Right-hand column: L2 on the left (toward the L3), logic on the right. */
  right: boolean;
  logic: FpRect;
  l2: FpRect;
  /** Logic + L2 together. */
  all: FpRect;
}

export interface CcdLayout {
  cores: CoreSlot[];
  l3: FpRect;
  fabric: FpRect;
  control: FpRect[];
}

export const CCD_LAYOUT: CcdLayout = (() => {
  const m = 0.12;
  const rowPitch = 1.43;
  const cores: CoreSlot[] = [];
  for (let i = 0; i < 8; i++) {
    const right = i >= 4;
    const y = m + (i % 4) * rowPitch;
    const x0 = right ? 7.18 : m;
    const logic = right
      ? { x: x0 + CORE.l2W + CORE.gap, y, w: CORE.logicW, h: CORE.h }
      : { x: x0, y, w: CORE.logicW, h: CORE.h };
    const l2 = right ? { x: x0, y, w: CORE.l2W, h: CORE.h } : { x: x0 + CORE.logicW + CORE.gap, y, w: CORE.l2W, h: CORE.h };
    cores.push({ index: i, right, logic, l2, all: { x: x0, y, w: CORE.logicW + CORE.gap + CORE.l2W, h: CORE.h } });
  }
  const bottom = m + 3 * rowPitch + CORE.h + 0.08;
  return {
    cores,
    l3: { x: 3.6, y: m, w: 3.5, h: 3 * rowPitch + CORE.h },
    fabric: { x: 3.6, y: bottom, w: 3.5, h: CCD.h - m - bottom },
    control: [
      { x: m, y: bottom, w: 3.4, h: CCD.h - m - bottom },
      { x: 7.18, y: bottom, w: 3.4, h: CCD.h - m - bottom },
    ],
  };
})();

export type UnitId = "l1i" | "fetch" | "decode" | "l1d" | "lsu" | "int" | "fp";
type PaintKind = "sram" | "logic" | "datapath" | "decode";

export interface CoreUnit {
  id: UnitId;
  /** Position inside the logic block, measured from the L2 side. */
  u: number;
  v: number;
  w: number;
  h: number;
  kind: PaintKind;
  hue: number;
  label: string;
  sub: string;
}

/** Pipeline units of one core (front end on top, execution below). */
export const CORE_UNITS: CoreUnit[] = [
  { id: "l1i", u: 0, v: 0, w: 0.44, h: 0.56, kind: "sram", hue: 212, label: "L1i", sub: "32 KB" },
  { id: "fetch", u: 0.48, v: 0, w: 0.72, h: 0.56, kind: "logic", hue: 26, label: "BRANCH PRED.", sub: "+ FETCH" },
  { id: "decode", u: 1.24, v: 0, w: 1.06, h: 0.56, kind: "decode", hue: 48, label: "DECODE", sub: "+ OP CACHE" },
  { id: "l1d", u: 0, v: 0.6, w: 0.44, h: 0.78, kind: "sram", hue: 196, label: "L1d", sub: "32 KB" },
  { id: "lsu", u: 0.48, v: 0.6, w: 0.5, h: 0.78, kind: "logic", hue: 146, label: "LOAD /", sub: "STORE" },
  { id: "int", u: 1.02, v: 0.6, w: 0.6, h: 0.78, kind: "datapath", hue: 205, label: "INTEGER", sub: "4 ALU · 3 AGU" },
  { id: "fp", u: 1.66, v: 0.6, w: 0.64, h: 0.78, kind: "datapath", hue: 292, label: "FP / SIMD", sub: "VECTOR · FMA" },
];

/** Unit rectangle in die coordinates for a logic block (mirrored on the left column). */
export function unitRect(logic: FpRect, unit: CoreUnit, mirror: boolean): FpRect {
  const x = mirror ? logic.x + logic.w - unit.u - unit.w : logic.x + unit.u;
  return { x, y: logic.y + unit.v, w: unit.w, h: unit.h };
}

/** The magnified core plate: L2 band on the left, then the logic units. */
export const CORE_PLATE = { w: CORE.l2W + CORE.gap + CORE.logicW, h: CORE.h };
export const CORE_PLATE_L2: FpRect = { x: 0, y: 0, w: CORE.l2W, h: CORE.h };
export const CORE_PLATE_LOGIC: FpRect = { x: CORE.l2W + CORE.gap, y: 0, w: CORE.logicW, h: CORE.h };

/** I/O die, 9.3 mm (x) × 12.5 mm (z), CCD links on its left edge. */
export const IOD = { w: 9.3, h: 12.5 };

// ---------------------------------------------------------------------------
// Surface patterns
// ---------------------------------------------------------------------------

const hsl = (h: number, s: number, l: number) => `hsl(${h} ${s}% ${l}%)`;
export const flat = (color: string, rough = 0.2, metal = 0.55, height = 0.5): Surface => ({ color, rough, metal, height });

/** SRAM array: fine bit-cell rows split into sub-arrays by decoders. */
function sram(p: Painter, r: FpRect, hue: number, k: number) {
  p.rect(r.x, r.y, r.w, r.h, flat(hsl(hue, 40, 19)));
  const pitch = 0.034 * k;
  for (let y = r.y; y < r.y + r.h - pitch * 0.5; y += pitch) {
    p.rect(r.x, y, r.w, pitch * 0.5, flat(hsl(hue + 8, 46, 27)));
  }
  const cols = Math.max(1, Math.round(r.w / (0.42 * k)));
  for (let i = 1; i < cols; i++) {
    p.rect(r.x + (r.w * i) / cols - 0.018 * k, r.y, 0.036 * k, r.h, flat(hsl(hue - 30, 30, 12)));
  }
  const rows = Math.max(1, Math.round(r.h / (0.5 * k)));
  for (let j = 1; j < rows; j++) {
    p.rect(r.x, r.y + (r.h * j) / rows - 0.022 * k, r.w, 0.044 * k, flat(hsl(hue - 20, 28, 14)));
  }
}

/** Standard-cell logic: noisy patches of slightly different colour. */
function logic(p: Painter, r: FpRect, hue: number, seed: number, k: number) {
  const rand = rng(seed);
  p.rect(r.x, r.y, r.w, r.h, flat(hsl(hue, 30, 18)));
  const n = Math.round((r.w * r.h) / (0.011 * k * k));
  for (let i = 0; i < n; i++) {
    const w = (0.035 + rand() * 0.15) * k;
    const h = (0.025 + rand() * 0.07) * k;
    const x = r.x + rand() * Math.max(0, r.w - w);
    const y = r.y + rand() * Math.max(0, r.h - h);
    p.rect(x, y, Math.min(w, r.w), Math.min(h, r.h), flat(hsl(hue + (rand() - 0.5) * 46, 26 + rand() * 18, 14 + rand() * 17)));
  }
  // Faint standard-cell rows.
  const row = 0.03 * k;
  for (let y = r.y; y < r.y + r.h; y += row * 2) {
    p.rect(r.x, y, r.w, row * 0.3, { color: "rgba(255,255,255,0.045)", rough: 0.2, metal: 0.55 });
  }
}

/** Bit-sliced datapath (ALUs, FP pipes): regular vertical slices and register-file bands. */
function datapath(p: Painter, r: FpRect, hue: number, seed: number, k: number) {
  const rand = rng(seed);
  p.rect(r.x, r.y, r.w, r.h, flat(hsl(hue, 30, 17)));
  const bands = 3 + Math.floor(rand() * 2);
  let y = r.y;
  for (let b = 0; b < bands; b++) {
    const h = b === bands - 1 ? r.y + r.h - y : (r.h / bands) * (0.7 + rand() * 0.6);
    const isRf = b % 2 === 1;
    const pitch = (isRf ? 0.03 : 0.055) * k;
    const l = isRf ? 30 : 24;
    for (let x = r.x; x < r.x + r.w - pitch * 0.4; x += pitch) {
      p.rect(x, y + 0.01 * k, pitch * 0.48, Math.max(0, h - 0.02 * k), flat(hsl(hue + (rand() - 0.5) * 18, 34, l + rand() * 6)));
    }
    y += h;
    if (y >= r.y + r.h) break;
  }
}

/** Off-die link / memory PHY: repeated lanes of analog drivers and pads. */
function phy(p: Painter, r: FpRect, seed: number, k: number) {
  const rand = rng(seed);
  p.rect(r.x, r.y, r.w, r.h, flat("#1b1a17"));
  const vertical = r.h > r.w;
  const len = vertical ? r.h : r.w;
  const n = Math.max(2, Math.round(len / (0.16 * k)));
  for (let i = 0; i < n; i++) {
    const t0 = (len * i) / n + 0.015 * k;
    const t1 = len / n - 0.03 * k;
    const c = flat(hsl(36 + rand() * 12, 50, 30 + rand() * 10), 0.22, 0.85);
    if (vertical) {
      p.rect(r.x + r.w * 0.08, r.y + t0, r.w * 0.55, t1, c);
      p.rect(r.x + r.w * 0.7, r.y + t0, r.w * 0.22, t1 * 0.7, flat("#3a3830", 0.3, 0.7));
    } else {
      p.rect(r.x + t0, r.y + r.h * 0.08, t1, r.h * 0.55, c);
      p.rect(r.x + t0, r.y + r.h * 0.7, t1 * 0.7, r.h * 0.22, flat("#3a3830", 0.3, 0.7));
    }
  }
}

/** Analog / mixed-signal: a few irregular blocks (PLLs, sensors, regulators). */
function analog(p: Painter, r: FpRect, hue: number, seed: number) {
  const rand = rng(seed);
  p.rect(r.x, r.y, r.w, r.h, flat(hsl(hue, 22, 16)));
  for (let i = 0; i < 9; i++) {
    const w = r.w * (0.08 + rand() * 0.22);
    const h = r.h * (0.25 + rand() * 0.6);
    p.rect(r.x + rand() * (r.w - w), r.y + rand() * (r.h - h), w, h, flat(hsl(hue + rand() * 40, 26, 22 + rand() * 12)));
  }
}

function paintUnit(p: Painter, r: FpRect, unit: CoreUnit, seed: number, k: number) {
  switch (unit.kind) {
    case "sram":
      sram(p, r, unit.hue, k);
      break;
    case "logic":
      logic(p, r, unit.hue, seed, k);
      break;
    case "datapath":
      datapath(p, r, unit.hue, seed, k);
      break;
    case "decode": {
      // Decoders on the left, the op cache (an SRAM) on the right.
      const split = r.w * 0.55;
      logic(p, { ...r, w: split - 0.02 * k }, unit.hue, seed, k);
      sram(p, { x: r.x + split, y: r.y, w: r.w - split, h: r.h }, unit.hue + 10, k * 0.8);
      break;
    }
  }
}

/** All units of one core's logic block. */
function paintCoreLogic(p: Painter, logicRect: FpRect, mirror: boolean, seed: number, k: number) {
  p.rect(logicRect.x, logicRect.y, logicRect.w, logicRect.h, flat("#14161b"));
  CORE_UNITS.forEach((u, i) => paintUnit(p, unitRect(logicRect, u, mirror), u, seed * 31 + i, k));
}

/** C4 solder bumps on the circuit side (only on the real dies). */
function bumps(p: Painter, w: number, h: number, pitch: number) {
  const s: Surface = { color: "rgba(206,212,222,0.3)", rough: 0.3, metal: 0.95, height: 0.75 };
  for (let y = pitch * 0.75; y < h - pitch * 0.5; y += pitch) {
    for (let x = pitch * 0.75; x < w - pitch * 0.5; x += pitch) p.circle(x, y, pitch * 0.15, s);
  }
}

function sealRing(p: Painter, w: number, h: number) {
  p.strokeRect(0.035, 0.035, w - 0.07, h - 0.07, 0.04, flat("#9c8d63", 0.25, 0.9));
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

const WHITE: Surface = { color: "#ffffff", rough: 0.5, metal: 0, height: 0.55 };

/**
 * A readable label: one or two centred lines on a dark rounded backing.
 * Sizes are in the painter's units (die millimetres).
 */
export function labelBox(
  p: Painter,
  cx: number,
  cy: number,
  title: string,
  sub: string | undefined,
  size: number,
  accent: string,
) {
  const subSize = size * 0.64;
  const font = (s: number, wgt: number) => `${wgt} ${s}px ${FONT_SANS}`;
  p.c.save();
  p.c.font = font(size, 800);
  const w1 = p.c.measureText(title).width;
  p.c.font = font(subSize, 600);
  const w2 = sub ? p.c.measureText(sub).width : 0;
  p.c.restore();
  const w = Math.max(w1, w2) + size * 0.9;
  const h = size * (sub ? 2.05 : 1.3);
  const backing: Surface = { color: "rgba(7,9,13,0.74)", rough: 0.7, metal: 0 };
  p.roundRect(cx - w / 2, cy - h / 2, w, h, size * 0.28, backing);
  p.rect(cx - w / 2, cy - h / 2, size * 0.16, h, { color: accent, rough: 0.6, metal: 0 });
  const ty = sub ? cy - size * 0.42 : cy;
  p.text(title, cx, ty, size, WHITE, { align: "center", baseline: "middle", weight: 800, font: FONT_SANS });
  if (sub) {
    p.text(sub, cx, cy + size * 0.5, subSize, { ...WHITE, color: "#c9d3e0" }, {
      align: "center",
      baseline: "middle",
      weight: 600,
      font: FONT_SANS,
    });
  }
}

/** Accent colours of the floorplan (block sides and label bars). */
export const FP_COLORS = {
  core: "#3f7fd6",
  l2: "#2fb3a6",
  l3: "#8a63d8",
  fabric: "#e0a43a",
  control: "#8b97a8",
  l1i: "#5aa7ff",
  fetch: "#ff8a3d",
  decode: "#f2c94c",
  l1d: "#38c7d9",
  lsu: "#4cc38a",
  int: "#4f8df0",
  fp: "#c56cf0",
};

// ---------------------------------------------------------------------------
// Die paintings
// ---------------------------------------------------------------------------

export interface DiePaintOptions {
  /** Pattern scale (1 = real die; < 1 paints finer detail for magnified views). */
  k?: number;
  labels?: boolean;
  bumps?: boolean;
}

/** Compute die: 8 cores, L3 slices, fabric link and control strip. */
export function paintCcd(p: Painter, o: DiePaintOptions = {}) {
  const k = o.k ?? 1;
  const L = CCD_LAYOUT;
  p.rect(0, 0, CCD.w, CCD.h, flat("#121418"));
  // L3: 8 slices of 4 MB (two columns × four rows) either side of a control spine.
  const spine = 0.34;
  const sw = (L.l3.w - spine) / 2 - 0.03;
  for (let col = 0; col < 2; col++) {
    for (let row = 0; row < 4; row++) {
      const sh = L.l3.h / 4 - 0.05;
      sram(
        p,
        { x: L.l3.x + col * (sw + spine + 0.06), y: L.l3.y + row * (L.l3.h / 4) + 0.025, w: sw, h: sh },
        258 + ((row * 2 + col) % 3) * 8,
        k,
      );
    }
  }
  logic(p, { x: L.l3.x + sw + 0.03, y: L.l3.y, w: spine, h: L.l3.h }, 230, 77, k);
  for (const c of L.cores) {
    sram(p, c.l2, 186 + (c.index % 3) * 5, k);
    paintCoreLogic(p, c.logic, !c.right, 100 + c.index, k);
  }
  phy(p, L.fabric, 9, k);
  L.control.forEach((r, i) => analog(p, r, 200 + i * 40, 50 + i));
  sealRing(p, CCD.w, CCD.h);
  if (o.bumps) bumps(p, CCD.w, CCD.h, 0.2);
  if (!o.labels) return;

  for (const c of L.cores) {
    labelBox(p, c.logic.x + c.logic.w / 2, c.logic.y + c.logic.h / 2, `CORE ${c.index}`, "2 THREADS", 0.27, FP_COLORS.core);
    labelBox(p, c.l2.x + c.l2.w / 2, c.l2.y + c.l2.h / 2, "L2", "1 MB", 0.22, FP_COLORS.l2);
  }
  labelBox(p, L.l3.x + L.l3.w / 2, L.l3.y + L.l3.h / 2, "L3 CACHE", "32 MB · SHARED", 0.36, FP_COLORS.l3);
  labelBox(p, L.fabric.x + L.fabric.w / 2, L.fabric.y + L.fabric.h / 2, "FABRIC LINK → I/O DIE", undefined, 0.2, FP_COLORS.fabric);
  for (const r of L.control) {
    labelBox(p, r.x + r.w / 2, r.y + r.h / 2, "POWER · CLOCKS · TEST", undefined, 0.17, FP_COLORS.control);
  }
}

/** The magnified single core (core 4 orientation: L2 on the left). */
export function paintCorePlate(p: Painter, k = 0.42) {
  p.rect(0, 0, CORE_PLATE.w, CORE_PLATE.h, flat("#121418"));
  sram(p, CORE_PLATE_L2, 188, k);
  paintCoreLogic(p, CORE_PLATE_LOGIC, false, 104, k);
  const l2 = CORE_PLATE_L2;
  labelBox(p, l2.x + l2.w / 2, l2.y + l2.h / 2, "L2 CACHE", "1 MB · ≈3 ns", 0.12, FP_COLORS.l2);
  for (const u of CORE_UNITS) {
    const r = unitRect(CORE_PLATE_LOGIC, u, false);
    const size = Math.min(0.085, r.w * 0.15);
    labelBox(p, r.x + r.w / 2, r.y + r.h / 2, u.label, u.sub, size, FP_COLORS[u.id]);
  }
}

/** I/O die: memory and PCIe PHYs on the edges, graphics, media and fabric inside. */
export function paintIod(p: Painter, o: DiePaintOptions = {}) {
  const k = o.k ?? 1;
  const { w: W, h: H } = IOD;
  p.rect(0, 0, W, H, flat("#121418"));
  // Pad ring.
  p.rect(0.1, 0.1, W - 0.2, 0.12, flat("#2a2620", 0.3, 0.8));
  p.rect(0.1, H - 0.22, W - 0.2, 0.12, flat("#2a2620", 0.3, 0.8));
  // Die-to-die links facing each compute die (left edge).
  phy(p, { x: 0.2, y: 0.85, w: 0.75, h: 2.3 }, 1, k);
  phy(p, { x: 0.2, y: 9.35, w: 0.75, h: 2.3 }, 2, k);
  // DDR5 PHYs (two channels) along the right edge, controllers beside them.
  phy(p, { x: 8.25, y: 0.35, w: 0.85, h: 5.8 }, 3, k);
  phy(p, { x: 8.25, y: 6.35, w: 0.85, h: 5.8 }, 4, k);
  logic(p, { x: 7.0, y: 0.35, w: 1.15, h: 5.8 }, 30, 5, k);
  logic(p, { x: 7.0, y: 6.35, w: 1.15, h: 5.8 }, 36, 6, k);
  // PCIe / USB / display PHYs along the top and bottom edges.
  phy(p, { x: 1.15, y: 0.3, w: 5.7, h: 0.7 }, 7, k);
  phy(p, { x: 1.15, y: H - 1.0, w: 5.7, h: 0.7 }, 8, k);
  // Graphics (two compute units), display and media engines, security/management.
  logic(p, { x: 1.15, y: 4.15, w: 3.3, h: 4.2 }, 335, 9, k);
  sram(p, { x: 1.25, y: 6.6, w: 1.4, h: 1.6 }, 320, k);
  logic(p, { x: 4.6, y: 4.15, w: 2.25, h: 2.0 }, 95, 10, k);
  logic(p, { x: 4.6, y: 6.3, w: 2.25, h: 2.05 }, 160, 11, k);
  logic(p, { x: 1.15, y: 1.15, w: 2.4, h: 2.85 }, 12, 12, k);
  logic(p, { x: 3.7, y: 1.15, w: 3.15, h: 2.85 }, 60, 13, k);
  analog(p, { x: 1.15, y: 8.5, w: 2.1, h: 2.9 }, 210, 14);
  logic(p, { x: 3.4, y: 8.5, w: 3.45, h: 2.9 }, 250, 15, k);
  // Central data fabric spine.
  p.rect(0.95, 4.0, 6.0, 0.12, flat(hsl(190, 30, 26)));
  p.rect(0.95, 8.38, 6.0, 0.1, flat(hsl(190, 30, 26)));
  sealRing(p, W, H);
  if (o.bumps) bumps(p, W, H, 0.2);
}

// ---------------------------------------------------------------------------
// Markings
// ---------------------------------------------------------------------------

/**
 * A 2D matrix code (data-matrix style): solid "L" finder on two edges,
 * alternating clock track on the other two, pseudo-random data inside.
 */
export function matrixCode(p: Painter, x: number, y: number, size: number, n: number, seed: number, ink: Surface) {
  const rand = rng(seed);
  const m = size / n;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      let on: boolean;
      if (i === 0 || j === n - 1) on = true;
      else if (j === 0) on = i % 2 === 0;
      else if (i === n - 1) on = j % 2 === 1;
      else on = rand() > 0.52;
      if (on) p.rect(x + i * m, y + j * m, m * 1.02, m * 1.02, ink);
    }
  }
}

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, "$1$1") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const clampByte = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

/**
 * Satin metal finish: fine, low-contrast noise in colour and roughness
 * (plated or bead-blasted look), filled from a small random tile so it costs
 * one fill per layer. `cellPx` is the grain size in texels; `streak`
 * stretches it along x like a lightly brushed surface. Call right after the
 * base colour, before any markings. `base.color` must be a hex colour.
 */
export function satin(p: Painter, base: Surface, seed: number, cellPx = 1, streak = 1, amount = 1) {
  const N = 128;
  const rand = rng(seed);
  const [r, g, b] = hexRgb(base.color);
  const mk = () => {
    const c = document.createElement("canvas");
    c.width = c.height = N;
    return c;
  };
  const colTile = mk();
  const rmTile = mk();
  const ci = colTile.getContext("2d")!.createImageData(N, N);
  const mi = rmTile.getContext("2d")!.createImageData(N, N);
  for (let i = 0; i < N * N; i++) {
    const v = (rand() - 0.5) * amount;
    const d = v * 9;
    ci.data[i * 4] = clampByte(r + d);
    ci.data[i * 4 + 1] = clampByte(g + d);
    ci.data[i * 4 + 2] = clampByte(b + d);
    ci.data[i * 4 + 3] = 255;
    mi.data[i * 4] = 255;
    mi.data[i * 4 + 1] = clampByte((base.rough + v * 0.06) * 255);
    mi.data[i * 4 + 2] = clampByte(base.metal * 255);
    mi.data[i * 4 + 3] = 255;
  }
  colTile.getContext("2d")!.putImageData(ci, 0, 0);
  rmTile.getContext("2d")!.putImageData(mi, 0, 0);
  for (const [ctx, tile] of [
    [p.c, colTile],
    [p.m, rmTile],
  ] as [CanvasRenderingContext2D, HTMLCanvasElement][]) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const pat = ctx.createPattern(tile, "repeat")!;
    pat.setTransform(new DOMMatrix().scale(cellPx * streak, cellPx));
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
  }
}
