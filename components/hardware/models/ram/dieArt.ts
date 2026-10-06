import { FONT_SANS, rng, type Painter, type Surface } from "@/lib/three/painter";

/**
 * Procedural floorplan of a 16 Gbit x8 DDR5 die, shared by the tiny die inside
 * the opened package and the magnified deep-dive views.
 *
 * Real DRAM dies are mostly memory array: 32 banks in 8 bank groups, each bank
 * tiled from "mats" separated by sense-amplifier and word-line-driver strips.
 * A narrow spine of peripheral logic with the bond pads runs down the middle.
 * Coordinates here are real die millimetres, canvas style (origin top-left,
 * y down), portrait: 7.0 mm wide × 9.6 mm tall.
 */
export const DIE = { w: 7.0, h: 9.6 };

/** Centre spine: peripheral logic with the pad row. */
export const SPINE = { x0: 2.9, x1: 4.1, padX: [3.38, 3.62], logicW: 0.36 };

export interface BankRect {
  /** Bank group 0…7 and bank 0…3 within it. */
  bg: number;
  bank: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MARGIN = 0.14;
const BG_GAP = 0.08;
const BANK_GAP = 0.05;

/** Bank-group rectangles: BG0–3 down the left half, BG4–7 down the right. */
export const BANK_GROUPS: (Rect & { bg: number })[] = (() => {
  const out: (Rect & { bg: number })[] = [];
  const halfW = SPINE.x0 - 0.06 - MARGIN;
  const bgH = (DIE.h - 2 * MARGIN - 3 * BG_GAP) / 4;
  for (let side = 0; side < 2; side++) {
    const x = side === 0 ? MARGIN : SPINE.x1 + 0.06;
    for (let i = 0; i < 4; i++) {
      out.push({ bg: side * 4 + i, x, y: MARGIN + i * (bgH + BG_GAP), w: halfW, h: bgH });
    }
  }
  return out;
})();

/** 32 banks, four (2 × 2) per bank group. */
export const BANKS: BankRect[] = BANK_GROUPS.flatMap((g) => {
  const w = (g.w - BANK_GAP) / 2;
  const h = (g.h - BANK_GAP) / 2;
  return [0, 1, 2, 3].map((bank) => ({
    bg: g.bg,
    bank,
    x: g.x + (bank % 2) * (w + BANK_GAP),
    y: g.y + Math.floor(bank / 2) * (h + BANK_GAP),
    w,
    h,
  }));
});

/** Peripheral blocks beside the pad row (left and right of the spine). */
export const PERIPHERY = {
  cmd: { y0: 0.22, y1: 2.95 },
  data: { y0: 3.08, y1: 6.38 },
  ecc: { y0: 6.51, y1: 9.38 },
};

// ---------------------------------------------------------------------------
// Bank layout (shared by the bank texture and the 3D bank view)
// ---------------------------------------------------------------------------

/** Bank-view units: the magnified bank is 36 × 28 with y up from the column decoder. */
export const BANK_VIEW = { w: 36, h: 28, dec: 3, cols: 6, rows: 8, swd: 0.5, sa: 0.55 };
const MAT_W = (BANK_VIEW.w - BANK_VIEW.dec) / BANK_VIEW.cols - BANK_VIEW.swd;
const MAT_H = (BANK_VIEW.h - BANK_VIEW.dec - (BANK_VIEW.rows + 1) * BANK_VIEW.sa) / BANK_VIEW.rows;

export interface BankLayout {
  ctrl: Rect;
  rowDec: Rect;
  colDec: Rect;
  sa: Rect[];
  swd: Rect[];
  mats: Rect[];
}

/** Rectangles in bank-view units (origin bottom-left, y up). */
export const BANK_LAYOUT: BankLayout = (() => {
  const { w, h, dec, cols, rows, swd, sa } = BANK_VIEW;
  const out: BankLayout = {
    ctrl: { x: 0, y: 0, w: dec, h: dec },
    colDec: { x: dec, y: 0, w: w - dec, h: dec },
    rowDec: { x: 0, y: dec, w: dec, h: h - dec },
    sa: [],
    swd: [],
    mats: [],
  };
  const pitchX = MAT_W + swd;
  const pitchY = MAT_H + sa;
  for (let k = 0; k <= rows; k++) out.sa.push({ x: dec, y: dec + k * pitchY, w: w - dec, h: sa });
  for (let c = 0; c < cols; c++) out.swd.push({ x: dec + c * pitchX, y: dec, w: swd, h: h - dec });
  for (let k = 0; k < rows; k++)
    for (let c = 0; c < cols; c++) out.mats.push({ x: dec + c * pitchX + swd, y: dec + k * pitchY + sa, w: MAT_W, h: MAT_H });
  return out;
})();

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

const hsl = (h: number, s: number, l: number) => `hsl(${h} ${s}% ${l}%)`;
const film = (color: string, rough = 0.34, metal = 0.38): Surface => ({ color, rough, metal, height: 0.5 });

export const DIE_BASE: Surface = film("#191c24", 0.3, 0.5);
const ARRAY = (l = 30) => film(hsl(262, 26, l), 0.3, 0.35);
const SA_STRIP = film(hsl(42, 55, 46), 0.3, 0.7);
const SWD_STRIP = film(hsl(196, 38, 38), 0.3, 0.5);

/** Fine word-line striping of a memory array (rows of cells). */
export function paintArray(p: Painter, x: number, y: number, w: number, h: number, pitch: number, l = 30) {
  p.rect(x, y, w, h, ARRAY(l));
  const stripe = ARRAY(l + 7);
  for (let yy = y + pitch * 0.5; yy < y + h - pitch * 0.25; yy += pitch * 2) p.rect(x, yy, w, pitch * 0.9, stripe);
}

/** Standard-cell logic: a dense patchwork of small rectangles (at most `maxN`). */
export function paintLogic(p: Painter, x: number, y: number, w: number, h: number, hue: number, cell: number, seed: number, maxN = 260) {
  const r = rng(seed);
  p.rect(x, y, w, h, film(hsl(hue, 28, 19)));
  const n = Math.min(maxN, Math.round((w * h) / (cell * cell * 0.9)));
  for (let i = 0; i < n; i++) {
    const cw = cell * (0.5 + r() * 1.6);
    const ch = cell * (0.35 + r() * 0.6);
    const cx = x + r() * Math.max(0, w - cw);
    const cy = y + r() * Math.max(0, h - ch);
    p.rect(cx, cy, cw, ch, film(hsl(hue + (r() - 0.5) * 50, 34, 17 + r() * 20)));
  }
  // Metal power straps over the logic.
  const strap = film(hsl(hue + 10, 18, 42), 0.25, 0.85);
  const step = Math.max(cell * 7, Math.min(w, h) / 3);
  for (let yy = y + step / 2; yy < y + h; yy += step) p.rect(x, yy, w, cell * 0.35, strap);
}

/**
 * One bank: row decoder, column decoder, control corner, sense-amp strips,
 * sub-word-line-driver strips and mats — scaled into the canvas rect
 * (x, y, w, h) with the column decoder along the bottom edge. `detail` paints
 * the decoders as logic; otherwise they are flat tones (for the tiny die).
 */
export function paintBank(p: Painter, x: number, y: number, w: number, h: number, seed: number, stripePitch: number, detail = true) {
  const sx = w / BANK_VIEW.w;
  const sy = h / BANK_VIEW.h;
  const R = (r: Rect): [number, number, number, number] => [x + r.x * sx, y + h - (r.y + r.h) * sy, r.w * sx, r.h * sy];
  const L = BANK_LAYOUT;
  const d = BANK_VIEW.dec;
  const [ax, ay, aw, ah] = R({ x: d, y: d, w: BANK_VIEW.w - d, h: BANK_VIEW.h - d });
  paintArray(p, ax, ay, aw, ah, stripePitch);
  for (const s of L.sa) {
    const [a, b, c, e] = R(s);
    p.rect(a, b, c, e, SA_STRIP);
  }
  for (const s of L.swd) {
    const [a, b, c, e] = R(s);
    p.rect(a, b, c, e, SWD_STRIP);
  }
  const blocks: [Rect, number][] = [
    [L.rowDec, 168],
    [L.colDec, 18],
    [L.ctrl, 300],
  ];
  blocks.forEach(([r, hue], i) => {
    const [bx, by, bw, bh] = R(r);
    if (detail) paintLogic(p, bx, by, bw, bh, hue, Math.min(bw, bh) / 9, seed + i);
    else {
      p.rect(bx, by, bw, bh, film(hsl(hue, 30, 24)));
      p.rect(bx + bw * 0.2, by + bh * 0.2, bw * 0.6, bh * 0.6, film(hsl(hue + 20, 34, 30)));
    }
  });
}

/** Bond pads down the spine (two staggered columns). */
export function padPositions(): [number, number][] {
  const out: [number, number][] = [];
  const pitch = 0.13;
  for (let y = 0.3; y < DIE.h - 0.25; y += pitch) {
    out.push([SPINE.padX[0], y], [SPINE.padX[1], y + pitch / 2]);
  }
  return out;
}

/**
 * The whole die, real scale. Used for the circuit side of the die in the
 * opened package and for the magnified die view's base.
 */
export function paintDie(p: Painter, opts: { bankDetail?: boolean } = {}) {
  // Seal ring and scribe.
  p.rect(0, 0, DIE.w, DIE.h, film("#262a33", 0.3, 0.7));
  p.rect(0.05, 0.05, DIE.w - 0.1, DIE.h - 0.1, film("#5a5040", 0.25, 0.85));
  p.rect(0.09, 0.09, DIE.w - 0.18, DIE.h - 0.18, DIE_BASE);
  // Memory arrays.
  BANKS.forEach((b, i) => paintBank(p, b.x, b.y, b.w, b.h, 100 + i, 0.012, opts.bankDetail ?? false));
  // Spine: logic either side of the pad row, pads, global I/O busses.
  const lx = SPINE.x0 + 0.02;
  const rx = SPINE.x1 - 0.02 - SPINE.logicW;
  const blocks: [keyof typeof PERIPHERY, number][] = [
    ["cmd", 186],
    ["data", 28],
    ["ecc", 290],
  ];
  blocks.forEach(([k, hue], i) => {
    const { y0, y1 } = PERIPHERY[k];
    paintLogic(p, lx, y0, SPINE.logicW, y1 - y0, hue, 0.03, 7 + i, 320);
    paintLogic(p, rx, y0, SPINE.logicW, y1 - y0, hue + 14, 0.03, 17 + i, 320);
  });
  p.rect(SPINE.x0 + 0.4, 0.15, SPINE.x1 - SPINE.x0 - 0.8, DIE.h - 0.3, film(hsl(220, 20, 17)));
  for (let y = 0.2; y < DIE.h - 0.2; y += 0.05) p.rect(SPINE.x0 + 0.41, y, SPINE.x1 - SPINE.x0 - 0.82, 0.012, film(hsl(40, 30, 40), 0.25, 0.85));
  for (const [x, y] of padPositions()) {
    p.rect(x - 0.045, y - 0.045, 0.09, 0.09, film("#b39a5c", 0.22, 0.95));
    p.rect(x - 0.03, y - 0.03, 0.06, 0.06, film("#d8c48a", 0.18, 1));
  }
  // Global data lines from the arrays into the spine.
  for (let y = 0.3; y < DIE.h - 0.3; y += 0.18) {
    p.rect(SPINE.x0 - 0.06, y, 0.06, 0.012, SA_STRIP);
    p.rect(SPINE.x1, y + 0.09, 0.06, 0.012, SA_STRIP);
  }
}

/** Mat texture for the magnified bank: word lines and a sheen of bit lines. */
export function paintMat(p: Painter, w: number, h: number) {
  paintArray(p, 0, 0, w, h, h / 48, 29);
  const bl = film(hsl(250, 22, 42), 0.14, 0.62);
  for (let x = w / 96; x < w; x += w / 48) p.rect(x, 0, w / 220, h, bl);
  // Bit-line contacts form a fine dotted lattice.
  const dot = film(hsl(40, 40, 52), 0.2, 0.85);
  for (let y = h / 24; y < h; y += h / 12) for (let x = w / 48; x < w; x += w / 24) p.rect(x, y, w / 300, h / 150, dot);
}

/** Small label used inside textures. */
export function dieText(p: Painter, s: string, x: number, y: number, size: number, color = "#e8ecf4") {
  p.text(s, x, y, size, { color, rough: 0.5, metal: 0 }, { align: "center", baseline: "middle", font: FONT_SANS, weight: 700 });
}
