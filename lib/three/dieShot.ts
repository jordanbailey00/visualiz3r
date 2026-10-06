import { FONT_SANS, rng, type Painter, type Surface } from "./painter";

/**
 * Procedural "die shot" painting. Real die photographs show colourful
 * thin-film interference over regular SRAM arrays, noisy standard-cell logic
 * and rows of I/O cells; each block kind below imitates one of those textures.
 */
export type DieBlockKind = "sram" | "logic" | "phy" | "analog" | "pad" | "fabric";

export interface DieBlock {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: DieBlockKind;
  /** Hue in degrees (thin-film colour). */
  hue?: number;
  /** Optional small label (used only for the architecture view). */
  label?: string;
}

const hsl = (h: number, s: number, l: number) => `hsl(${h} ${s}% ${l}%)`;
const flat = (color: string, rough = 0.15, metal = 0.6): Surface => ({ color, rough, metal, height: 0.5 });

export function paintBlock(p: Painter, b: DieBlock, seed: number) {
  const r = rng(seed);
  const hue = b.hue ?? 200;
  switch (b.kind) {
    case "sram": {
      p.rect(b.x, b.y, b.w, b.h, flat(hsl(hue, 40, 22)));
      // Bit-cell rows and periodic word-line drivers.
      const rowH = 0.035;
      for (let y = b.y; y < b.y + b.h; y += rowH * 2) {
        p.rect(b.x, y, b.w, rowH, flat(hsl(hue + 10, 45, 30)));
      }
      const banks = Math.max(1, Math.round(b.w / 0.45));
      for (let i = 1; i < banks; i++) {
        p.rect(b.x + (b.w * i) / banks - 0.025, b.y, 0.05, b.h, flat(hsl(hue - 30, 30, 16)));
      }
      const rowsOfBanks = Math.max(1, Math.round(b.h / 0.6));
      for (let j = 1; j < rowsOfBanks; j++) {
        p.rect(b.x, b.y + (b.h * j) / rowsOfBanks - 0.03, b.w, 0.06, flat(hsl(hue - 30, 30, 15)));
      }
      break;
    }
    case "logic": {
      p.rect(b.x, b.y, b.w, b.h, flat(hsl(hue, 30, 20)));
      const n = Math.round(b.w * b.h * 90);
      for (let i = 0; i < n; i++) {
        const w = 0.04 + r() * 0.16;
        const h = 0.03 + r() * 0.07;
        const x = b.x + r() * (b.w - w);
        const y = b.y + r() * (b.h - h);
        const l = 16 + r() * 18;
        p.rect(x, y, w, h, flat(hsl(hue + (r() - 0.5) * 40, 35, l)));
      }
      break;
    }
    case "phy": {
      p.rect(b.x, b.y, b.w, b.h, flat(hsl(hue, 35, 18)));
      const vertical = b.h > b.w;
      const n = Math.max(2, Math.round((vertical ? b.h : b.w) / 0.18));
      for (let i = 0; i < n; i++) {
        if (vertical) {
          const y = b.y + (b.h * i) / n;
          p.rect(b.x + b.w * 0.1, y + 0.02, b.w * 0.8, b.h / n - 0.04, flat(hsl(38 + r() * 10, 55, 34 + r() * 8), 0.2, 0.8));
        } else {
          const x = b.x + (b.w * i) / n;
          p.rect(x + 0.02, b.y + b.h * 0.1, b.w / n - 0.04, b.h * 0.8, flat(hsl(38 + r() * 10, 55, 34 + r() * 8), 0.2, 0.8));
        }
      }
      break;
    }
    case "analog": {
      p.rect(b.x, b.y, b.w, b.h, flat(hsl(hue, 25, 18)));
      for (let i = 0; i < 6; i++) {
        const w = b.w * (0.2 + r() * 0.3);
        const h = b.h * (0.2 + r() * 0.3);
        p.rect(b.x + r() * (b.w - w), b.y + r() * (b.h - h), w, h, flat(hsl(hue + 20, 30, 26 + r() * 10)));
      }
      break;
    }
    case "pad": {
      p.rect(b.x, b.y, b.w, b.h, flat("#1a1c1f"));
      const s = 0.12;
      for (let y = b.y + s; y < b.y + b.h - s; y += s * 2.2)
        for (let x = b.x + s; x < b.x + b.w - s; x += s * 2.2) p.rect(x, y, s, s, flat("#a9925a", 0.25, 0.9));
      break;
    }
    case "fabric": {
      p.rect(b.x, b.y, b.w, b.h, flat(hsl(hue, 20, 14)));
      const vertical = b.h > b.w;
      const n = Math.round((vertical ? b.w : b.h) / 0.03);
      for (let i = 0; i < n; i += 2) {
        if (vertical) p.rect(b.x + i * 0.03, b.y, 0.015, b.h, flat(hsl(hue + 15, 30, 24)));
        else p.rect(b.x, b.y + i * 0.03, b.w, 0.015, flat(hsl(hue + 15, 30, 24)));
      }
      break;
    }
  }
}

/** One GPU streaming multiprocessor: 4 partitions (RF + datapath), L1 and texture units. */
export function smBlocks(x: number, y: number, w: number, h: number, hue: number): DieBlock[] {
  const out: DieBlock[] = [];
  const l1h = h * 0.22;
  const ph = (h - l1h) / 2;
  for (let k = 0; k < 4; k++) {
    const px = x + (k % 2) * (w / 2);
    const py = y + (k < 2 ? 0 : ph + l1h);
    out.push({ x: px, y: py, w: w / 2, h: ph * 0.45, kind: "sram", hue: hue + 20 });
    out.push({ x: px, y: py + ph * 0.45, w: w / 2, h: ph * 0.55, kind: "logic", hue });
  }
  out.push({ x, y: y + ph, w: w * 0.7, h: l1h, kind: "sram", hue: hue - 40 });
  out.push({ x: x + w * 0.7, y: y + ph, w: w * 0.3, h: l1h, kind: "logic", hue: hue + 60 });
  return out;
}

/** Floorplan of a large GPU die: 12 GPCs around a central L2, memory PHYs on the sides. */
export function gpuFloorplan(W: number, H: number): DieBlock[] {
  const blocks: DieBlock[] = [];
  const edge = 0.35;
  const phyW = 1.15;
  // I/O ring
  blocks.push({ x: 0, y: 0, w: W, h: edge, kind: "pad" }, { x: 0, y: H - edge, w: W, h: edge, kind: "pad" });
  blocks.push({ x: 0, y: edge, w: edge, h: H - 2 * edge, kind: "pad" }, { x: W - edge, y: edge, w: edge, h: H - 2 * edge, kind: "pad" });
  // GDDR PHYs on the left and right, six controllers each
  for (let i = 0; i < 6; i++) {
    const y = edge + 0.4 + (i * (H - 2 * edge - 0.8)) / 6;
    const h = (H - 2 * edge - 0.8) / 6 - 0.15;
    blocks.push({ x: edge, y, w: phyW, h, kind: "phy" });
    blocks.push({ x: W - edge - phyW, y, w: phyW, h, kind: "phy" });
  }
  const ix = edge + phyW + 0.2;
  const iw = W - 2 * ix;
  // Top strip: PCIe, display, media engines
  blocks.push({ x: ix, y: edge + 0.1, w: iw * 0.32, h: 1.1, kind: "phy" });
  blocks.push({ x: ix + iw * 0.34, y: edge + 0.1, w: iw * 0.3, h: 1.1, kind: "logic", hue: 280 });
  blocks.push({ x: ix + iw * 0.66, y: edge + 0.1, w: iw * 0.34, h: 1.1, kind: "logic", hue: 30 });
  // Central L2 + crossbar
  const l2h = 4.2;
  const cy = H / 2;
  blocks.push({ x: ix, y: cy - l2h / 2, w: iw / 2 - 0.4, h: l2h, kind: "sram", hue: 230 });
  blocks.push({ x: ix + iw / 2 + 0.4, y: cy - l2h / 2, w: iw / 2 - 0.4, h: l2h, kind: "sram", hue: 230 });
  blocks.push({ x: ix + iw / 2 - 0.4, y: cy - l2h / 2, w: 0.8, h: l2h, kind: "fabric", hue: 190 });
  // 12 GPCs: 6 above and 6 below the L2
  const gpcTop = edge + 1.4;
  const gpcH = cy - l2h / 2 - 0.25 - gpcTop;
  const gpcW = (iw - 5 * 0.18) / 6;
  for (let row = 0; row < 2; row++) {
    for (let c = 0; c < 6; c++) {
      const gx = ix + c * (gpcW + 0.18);
      const gy = row === 0 ? gpcTop : cy + l2h / 2 + 0.25;
      const hue = 150 + c * 18 + row * 10;
      // raster/geometry engine strip next to the L2
      const rh = 0.6;
      const ry = row === 0 ? gy + gpcH - rh : gy;
      blocks.push({ x: gx, y: ry, w: gpcW, h: rh, kind: "logic", hue: hue + 90 });
      // 6 TPCs × 2 SMs = 12 SMs in a 2 × 6 grid
      const smAreaY = row === 0 ? gy : gy + rh;
      const smAreaH = gpcH - rh;
      const smW = gpcW / 2 - 0.04;
      const smH = smAreaH / 6 - 0.06;
      for (let k = 0; k < 12; k++) {
        const sx = gx + (k % 2) * (smW + 0.08);
        const sy = smAreaY + Math.floor(k / 2) * (smH + 0.06) + 0.03;
        blocks.push(...smBlocks(sx, sy, smW, smH, hue));
      }
    }
  }
  return blocks;
}

export function paintDie(p: Painter, blocks: DieBlock[], seed = 1) {
  blocks.forEach((b, i) => paintBlock(p, b, seed * 1000 + i));
}

/** Label overlay used by the architecture views. */
export function labelBlocks(p: Painter, blocks: DieBlock[]) {
  for (const b of blocks) {
    if (!b.label) continue;
    p.text(b.label, b.x + b.w / 2, b.y + b.h / 2, Math.min(b.h * 0.3, 0.9), { color: "#ffffff", rough: 0.5, metal: 0 }, {
      align: "center",
      baseline: "middle",
      font: FONT_SANS,
      weight: 700,
    });
  }
}

export interface NamedRegion {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The selectable regions of `gpuFloorplan(W, H)` — same geometry, grouped by
 * function (GPC rectangles, L2 halves, PHY columns, I/O strip blocks).
 */
export function gpuRegions(W: number, H: number): NamedRegion[] {
  const edge = 0.35;
  const phyW = 1.15;
  const ix = edge + phyW + 0.2;
  const iw = W - 2 * ix;
  const l2h = 4.2;
  const cy = H / 2;
  const gpcTop = edge + 1.4;
  const gpcH = cy - l2h / 2 - 0.25 - gpcTop;
  const gpcW = (iw - 5 * 0.18) / 6;
  const out: NamedRegion[] = [
    { id: "memory-phy", x: edge, y: edge + 0.4, w: phyW, h: H - 2 * edge - 0.8 },
    { id: "memory-phy", x: W - edge - phyW, y: edge + 0.4, w: phyW, h: H - 2 * edge - 0.8 },
    { id: "pcie-phy", x: ix, y: edge + 0.1, w: iw * 0.32, h: 1.1 },
    { id: "display-engine", x: ix + iw * 0.34, y: edge + 0.1, w: iw * 0.3, h: 1.1 },
    { id: "media-engine", x: ix + iw * 0.66, y: edge + 0.1, w: iw * 0.34, h: 1.1 },
    { id: "l2-cache", x: ix, y: cy - l2h / 2, w: iw / 2 - 0.4, h: l2h },
    { id: "l2-cache", x: ix + iw / 2 + 0.4, y: cy - l2h / 2, w: iw / 2 - 0.4, h: l2h },
    { id: "crossbar", x: ix + iw / 2 - 0.4, y: cy - l2h / 2, w: 0.8, h: l2h },
  ];
  for (let row = 0; row < 2; row++)
    for (let c = 0; c < 6; c++)
      out.push({ id: "gpc", x: ix + c * (gpcW + 0.18), y: row === 0 ? gpcTop : cy + l2h / 2 + 0.25, w: gpcW, h: gpcH });
  return out;
}

/** Rectangle of one SM inside `gpuFloorplan(W, H)` (die mm, origin top-left). */
export function gpuSmRect(W: number, H: number, gpcRow: number, gpcCol: number, sm: number): NamedRegion {
  const g = gpuRegions(W, H).filter((r) => r.id === "gpc")[gpcRow * 6 + gpcCol];
  const rh = 0.6;
  const smAreaY = gpcRow === 0 ? g.y : g.y + rh;
  const smAreaH = g.h - rh;
  const smW = g.w / 2 - 0.04;
  const smH = smAreaH / 6 - 0.06;
  return { id: "sm", x: g.x + (sm % 2) * (smW + 0.08), y: smAreaY + Math.floor(sm / 2) * (smH + 0.06) + 0.03, w: smW, h: smH };
}
