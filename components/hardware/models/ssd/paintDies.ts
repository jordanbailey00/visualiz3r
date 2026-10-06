import { paintBlock, type DieBlock } from "@/lib/three/dieShot";
import { FONT_SANS, rng, type Painter, type Surface } from "@/lib/three/painter";

/**
 * Procedural silicon for the SSD: the controller's floorplan (seen when its
 * die flips over), the NAND die floorplan (die stack + magnified view) and
 * the cross-section textures of the 3D NAND cut-away.
 */

const flat = (color: string, rough = 0.18, metal = 0.6, height = 0.5): Surface => ({ color, rough, metal, height });
const hsl = (h: number, s: number, l: number) => `hsl(${h} ${s}% ${l}%)`;

/**
 * White label with a dark halo so it reads on any part of a die shot.
 * Drawn straight into the colour canvas (and the height canvas for a faint
 * raised print), in millimetre units like the rest of the painter.
 */
export function haloText(
  p: Painter,
  str: string,
  x: number,
  y: number,
  size: number,
  opts: { rotate?: number; align?: CanvasTextAlign; color?: string; weight?: number } = {},
) {
  for (const [ctx, fill, stroke] of [
    [p.c, opts.color ?? "#f4f7fb", "rgba(6,8,12,0.85)"],
    [p.m, "rgb(255, 120, 0)", "rgb(255, 120, 0)"],
  ] as [CanvasRenderingContext2D, string, string][]) {
    ctx.save();
    ctx.translate(x, y);
    if (opts.rotate) ctx.rotate((opts.rotate * Math.PI) / 180);
    ctx.font = `${opts.weight ?? 700} ${size}px ${FONT_SANS}`;
    ctx.textAlign = opts.align ?? "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = size * 0.28;
    ctx.strokeStyle = stroke;
    ctx.strokeText(str, 0, 0);
    ctx.fillStyle = fill;
    ctx.fillText(str, 0, 0);
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Controller die (5.6 × 5.0 mm, circuit side)
// ---------------------------------------------------------------------------

export const CTRL_DIE = { w: 5.5, h: 4.9 };

interface LabeledBlock extends DieBlock {
  text?: string;
  vertical?: boolean;
}

function controllerBlocks(): LabeledBlock[] {
  const B: LabeledBlock[] = [];
  const { w: W, h: H } = CTRL_DIE;
  const e = 0.17;
  B.push({ x: 0, y: 0, w: W, h: e, kind: "pad" }, { x: 0, y: H - e, w: W, h: e, kind: "pad" });
  B.push({ x: 0, y: e, w: e, h: H - 2 * e, kind: "pad" }, { x: W - e, y: e, w: e, h: H - 2 * e, kind: "pad" });
  B.push({ x: 0.22, y: 0.75, w: 0.7, h: 3.4, kind: "phy", text: "PCIe 4.0 ×4 PHY", vertical: true });
  B.push({ x: 0.22, y: 0.22, w: 1.75, h: 0.45, kind: "analog", hue: 30, text: "PLL" });
  B.push({ x: 0.22, y: 4.22, w: 1.75, h: 0.45, kind: "analog", hue: 190, text: "PMU · TEMP" });
  B.push({ x: 2.05, y: 0.22, w: 3.2, h: 0.45, kind: "phy", text: "NAND CH 0–3" });
  B.push({ x: 2.05, y: 4.22, w: 3.2, h: 0.45, kind: "phy", text: "NAND CH 4–7" });
  B.push({ x: 4.82, y: 1.25, w: 0.48, h: 2.4, kind: "phy", text: "LPDDR4 PHY", vertical: true });
  B.push({ x: 1.0, y: 0.75, w: 1.05, h: 1.6, kind: "logic", hue: 205, text: "NVMe" });
  B.push({ x: 2.1, y: 0.75, w: 1.75, h: 1.6, kind: "sram", hue: 235, text: "SRAM" });
  B.push({ x: 3.9, y: 0.75, w: 0.85, h: 1.6, kind: "logic", hue: 300, text: "FLASH" });
  // Four CPU cores, each with its own cache.
  for (let i = 0; i < 4; i++) {
    const x = 1.0 + (i % 2) * 0.66;
    const y = 2.42 + Math.floor(i / 2) * 0.88;
    B.push({ x, y, w: 0.62, h: 0.5, kind: "logic", hue: 20 });
    B.push({ x, y: y + 0.5, w: 0.62, h: 0.32, kind: "sram", hue: 250 });
  }
  B.push({ x: 2.4, y: 2.42, w: 2.35, h: 1.73, kind: "logic", hue: 150, text: "LDPC ECC" });
  return B;
}

/** Circuit side of the controller die, with block names. */
export function paintControllerDie(p: Painter) {
  const blocks = controllerBlocks();
  p.rect(0, 0, CTRL_DIE.w, CTRL_DIE.h, flat("#151821"));
  blocks.forEach((b, i) => paintBlock(p, b, 900 + i));
  // CPU label spans the four cores.
  haloText(p, "CPU ×4", 1.64, 3.32, 0.2);
  for (const b of blocks) {
    if (!b.text) continue;
    const size = b.vertical ? Math.min(b.w * 0.36, 0.2) : Math.min(b.h * 0.42, 0.22);
    haloText(p, b.text, b.x + b.w / 2, b.y + b.h / 2, size, { rotate: b.vertical ? -90 : 0 });
  }
}

// ---------------------------------------------------------------------------
// NAND die (11 × 6.2 mm, circuit side up — wire bonded)
// ---------------------------------------------------------------------------

export const NAND_DIE = { w: 11, h: 6.2 };

/** Floorplan rectangles (die mm, origin top-left, +y toward the bond pads). */
export const NAND_FLOOR = (() => {
  const planeW = 4.85;
  const xL = 0.16;
  const xR = NAND_DIE.w - 0.16 - planeW;
  const top = 0.16;
  const planeH = 2.2;
  const pbY = top + planeH;
  const pbH = 0.52;
  const yB = pbY + pbH;
  const periY = yB + planeH + 0.06;
  const planes = [
    { x: xL, y: top, w: planeW, h: planeH },
    { x: xR, y: top, w: planeW, h: planeH },
    { x: xL, y: yB, w: planeW, h: planeH },
    { x: xR, y: yB, w: planeW, h: planeH },
  ];
  const decX = xL + planeW;
  return {
    planes,
    pageBuffers: [
      { x: xL, y: pbY, w: planeW, h: pbH },
      { x: xR, y: pbY, w: planeW, h: pbH },
    ],
    /** Row decoders (+ word-line staircase contacts) between left and right planes. */
    rowDecoders: { x: decX, y: top, w: xR - decX, h: yB + planeH - top },
    pumps: { x: 0.16, y: periY, w: 3.3, h: NAND_DIE.h - periY - 0.38 },
    logic: { x: 3.56, y: periY, w: 4.6, h: NAND_DIE.h - periY - 0.38 },
    regs: { x: 8.26, y: periY, w: 2.58, h: NAND_DIE.h - periY - 0.38 },
    pads: { x: 0.16, y: NAND_DIE.h - 0.36, w: NAND_DIE.w - 0.32, h: 0.24 },
    /** One erase block highlighted inside plane 0 and one page (word line) in it. */
    block: { x: xL, y: top + 0.78, w: planeW, h: 0.15 },
    page: { x: xL, y: top + 0.83, w: planeW, h: 0.035 },
  };
})();

type R = { x: number; y: number; w: number; h: number };

function paintArray(p: Painter, r: R, seed: number) {
  const rand = rng(seed);
  p.rect(r.x, r.y, r.w, r.h, flat(hsl(268, 32, 21), 0.14, 0.65));
  // Erase blocks run across the plane (along the word lines).
  const bh = 0.05;
  for (let y = r.y, i = 0; y < r.y + r.h; y += bh, i++) {
    const l = 21 + (i % 2) * 3 + rand() * 2;
    p.rect(r.x, y, r.w, bh * 0.92, flat(hsl(262 + rand() * 10, 34, l), 0.14, 0.65));
  }
  // Sub-array tiles ("mats") with bit-line strapping between them.
  const tiles = 8;
  for (let i = 1; i < tiles; i++) p.rect(r.x + (r.w * i) / tiles - 0.012, r.y, 0.024, r.h, flat(hsl(220, 25, 13)));
  for (let j = 1; j < 4; j++) p.rect(r.x, r.y + (r.h * j) / 4 - 0.012, r.w, 0.024, flat(hsl(220, 25, 14)));
}

function paintPageBuffer(p: Painter, r: R, seed: number) {
  const rand = rng(seed);
  p.rect(r.x, r.y, r.w, r.h, flat(hsl(165, 30, 17)));
  // Rows of sense amplifiers and data latches, one column per bit-line group.
  const rows = 5;
  for (let j = 0; j < rows; j++) {
    const y = r.y + (r.h * j) / rows;
    for (let x = r.x; x < r.x + r.w; x += 0.06) {
      const l = 22 + rand() * 12 + (j % 2) * 4;
      p.rect(x + 0.006, y + 0.01, 0.048, r.h / rows - 0.02, flat(hsl(160 + rand() * 20, 40, l)));
    }
  }
}

function paintDecoder(p: Painter, r: R, seed: number) {
  const rand = rng(seed);
  p.rect(r.x, r.y, r.w, r.h, flat(hsl(30, 30, 15)));
  // Word-line staircase contact regions flank the decoders.
  for (const sx of [r.x, r.x + r.w - 0.09]) {
    for (let y = r.y; y < r.y + r.h; y += 0.04) p.rect(sx, y, 0.09, 0.022, flat(hsl(40, 45, 30), 0.2, 0.8));
  }
  for (let y = r.y; y < r.y + r.h; y += 0.03) {
    const l = 20 + rand() * 16;
    p.rect(r.x + 0.11, y, r.w - 0.22, 0.022, flat(hsl(22 + rand() * 18, 45, l)));
  }
}

function paintPumps(p: Painter, r: R, seed: number) {
  const rand = rng(seed);
  p.rect(r.x, r.y, r.w, r.h, flat(hsl(205, 25, 14)));
  // Arrays of large MOS capacitors (the pump stages) with switches between.
  const cols = 8;
  const rows = 2;
  const cw = r.w / cols;
  const ch = r.h / rows;
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      p.rect(r.x + i * cw + 0.03, r.y + j * ch + 0.03, cw * 0.72, ch - 0.06, flat(hsl(200 + rand() * 25, 45, 28 + rand() * 8)));
      p.rect(r.x + i * cw + cw * 0.78, r.y + j * ch + 0.05, cw * 0.16, ch - 0.1, flat(hsl(30, 40, 30)));
    }
}

/**
 * Circuit side of a 1 Tb 3D TLC die. `labels` adds the annotations used by
 * the magnified view; the copies inside the die stack are unlabelled.
 */
export function paintNandDie(p: Painter, labels: boolean) {
  const F = NAND_FLOOR;
  p.rect(0, 0, NAND_DIE.w, NAND_DIE.h, flat("#14161c"));
  // Seal ring.
  p.strokeRect(0.05, 0.05, NAND_DIE.w - 0.1, NAND_DIE.h - 0.1, 0.05, flat("#8a7a52", 0.25, 0.9));
  F.planes.forEach((r, i) => paintArray(p, r, 40 + i));
  F.pageBuffers.forEach((r, i) => paintPageBuffer(p, r, 60 + i));
  paintDecoder(p, F.rowDecoders, 70);
  paintPumps(p, F.pumps, 80);
  paintBlock(p, { ...F.logic, kind: "logic", hue: 210 }, 81);
  paintBlock(p, { ...F.regs, kind: "analog", hue: 280 }, 82);
  // Bond pads along the front edge (the edge the gold wires leave from).
  p.rect(F.pads.x, F.pads.y, F.pads.w, F.pads.h, flat("#1b1d22"));
  const nPads = 44;
  for (let i = 0; i < nPads; i++) {
    const x = F.pads.x + 0.12 + (i * (F.pads.w - 0.3)) / (nPads - 1);
    p.rect(x - 0.06, F.pads.y + 0.05, 0.12, 0.14, flat("#c9b071", 0.22, 1));
  }
  // The highlighted erase block and one page inside it.
  const b = F.block;
  p.rect(b.x, b.y, b.w, b.h, flat("#5a3d12", 0.3, 0.3));
  p.strokeRect(b.x + 0.01, b.y + 0.01, b.w - 0.02, b.h - 0.02, 0.02, flat("#ffb648", 0.3, 0.2));
  p.rect(F.page.x + 0.02, F.page.y, F.page.w - 0.04, F.page.h, flat("#7fe3ff", 0.3, 0.2));
  if (!labels) return;

  const names = ["PLANE 0", "PLANE 1", "PLANE 2", "PLANE 3"];
  F.planes.forEach((r, i) => haloText(p, names[i], r.x + r.w / 2, r.y + r.h * (i === 0 ? 0.72 : 0.5), 0.34));
  haloText(p, "MEMORY ARRAY · ≈100 BILLION CELLS PER PLANE", F.planes[2].x + F.planes[2].w / 2, F.planes[2].y + F.planes[2].h * 0.76, 0.14, { weight: 600 });
  F.pageBuffers.forEach((r) => haloText(p, "PAGE BUFFERS · SENSE AMPS + LATCHES", r.x + r.w / 2, r.y + r.h / 2, 0.15));
  const d = F.rowDecoders;
  haloText(p, "ROW DECODERS  +  WORD-LINE STAIRCASE", d.x + d.w / 2, d.y + d.h / 2, 0.15, { rotate: -90 });
  haloText(p, "CHARGE PUMPS (→ 20 V)", F.pumps.x + F.pumps.w / 2, F.pumps.y + F.pumps.h / 2, 0.17);
  haloText(p, "CONTROL LOGIC · STATE MACHINE", F.logic.x + F.logic.w / 2, F.logic.y + F.logic.h / 2, 0.17);
  haloText(p, "VOLTAGE REGS", F.regs.x + F.regs.w / 2, F.regs.y + F.regs.h / 2, 0.17);
  haloText(p, "I/O PADS  (8-BIT BUS · 2400 MT/s)", NAND_DIE.w / 2, F.pads.y - 0.1, 0.12, { weight: 600 });
  haloText(p, "◀ 1 ERASE BLOCK ≈ 24 MB", b.x + b.w * 0.5, b.y - 0.12, 0.15, { color: "#ffd089" });
  haloText(p, "1 PAGE = 16 KB ▶", b.x + b.w * 0.5, b.y + b.h + 0.13, 0.14, { color: "#a5ecff" });
}

// ---------------------------------------------------------------------------
// 3D NAND cross-section textures
// ---------------------------------------------------------------------------

/** Radial structure of one vertical channel (mm in the magnified model). */
export const CHANNEL = {
  r: 0.85,
  /** Outer radius of each layer, from the outside in. */
  blocking: 0.85,
  nitride: 0.72,
  tunnel: 0.58,
  poly: 0.5,
  core: 0.35,
};

/**
 * A channel cut lengthwise through its axis: blocking oxide, charge-trap
 * nitride, tunnel oxide, polysilicon channel and oxide core, with the
 * doped plug on top and the source contact at the bottom.
 */
export function paintChannelStrip(p: Painter, len: number) {
  const c = CHANNEL;
  const W = c.r * 2;
  const cx = c.r;
  const bands: [number, number, Surface][] = [
    [c.blocking, c.nitride, flat("#c7ccd3", 0.5, 0.0)],
    [c.nitride, c.tunnel, flat("#d79a33", 0.45, 0.0)],
    [c.tunnel, c.poly, flat("#a7d6ec", 0.4, 0.0)],
    [c.poly, c.core, flat("#8a4f30", 0.4, 0.1)],
  ];
  p.rect(0, 0, W, len, flat("#e3e6ea", 0.45, 0.0));
  for (const [ro, ri, surf] of bands) {
    p.rect(cx - ro, 0, ro - ri, len, surf);
    p.rect(cx + ri, 0, ro - ri, len, surf);
  }
  // Doped drain plug on top, source contact at the bottom.
  p.rect(0, 0, W, 0.5, flat("#5b2a1c", 0.4, 0.1));
  p.rect(cx - c.poly, len - 0.45, c.poly * 2, 0.45, flat("#8a4f30", 0.4, 0.1));
}

/** Front face of the CMOS logic built underneath the memory array. */
export function paintCmosFace(p: Painter, w: number, h: number) {
  const rand = rng(5);
  const si = flat("#3b4250", 0.35, 0.2);
  p.rect(0, 0, w, h, flat("#c9ced6", 0.5, 0)); // inter-metal dielectric
  p.rect(0, h - 1.0, w, 1.0, si); // silicon substrate
  // Transistors: wells, poly gates with spacers, contacts up to two metal layers.
  for (let x = 0.4; x < w - 0.6; x += 1.15 + rand() * 0.5) {
    const gw = 0.28 + rand() * 0.12;
    p.rect(x - 0.45, h - 1.0, 0.9 + gw, 0.12, flat("#6c7a92", 0.35, 0.2));
    p.rect(x, h - 1.25, gw, 0.25, flat("#9b3b2d", 0.4, 0.1));
    p.rect(x - 0.05, h - 1.27, gw + 0.1, 0.04, flat("#e6e8ea", 0.5, 0));
    for (const cx of [x - 0.3, x + gw + 0.22]) p.rect(cx, h - 1.9, 0.1, 0.9, flat("#9aa1aa", 0.3, 1));
  }
  for (let x = 0.2; x < w; x += 0.9 + rand() * 1.4) p.rect(x, h - 2.0, 0.6 + rand() * 1.4, 0.18, flat("#c98a52", 0.3, 1));
  for (let x = 0.5; x < w; x += 1.2 + rand() * 1.8) {
    p.rect(x, h - 2.32, 0.08, 0.32, flat("#9aa1aa", 0.3, 1));
    p.rect(x - 0.3, h - 2.4, 1.1 + rand(), 0.12, flat("#c98a52", 0.3, 1));
  }
}

/** Top of the capping oxide: channel plugs in a staggered grid and the slit. */
export function paintCapTop(
  p: Painter,
  w: number,
  d: number,
  x0: number,
  z0: number,
  channels: [number, number][],
  slit: [number, number],
) {
  p.rect(0, 0, w, d, flat("#d5d9de", 0.45, 0));
  for (const [x, z] of channels) {
    p.circle(x - x0, z - z0, CHANNEL.r, flat("#b9bec6", 0.45, 0));
    p.circle(x - x0, z - z0, CHANNEL.poly + 0.08, flat("#6b3424", 0.4, 0.1));
  }
  p.rect(0, slit[0] - z0, w, slit[1] - slit[0], flat("#80868f", 0.3, 1));
}
