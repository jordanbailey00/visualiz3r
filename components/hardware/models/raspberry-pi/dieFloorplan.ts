import { MeshPhysicalMaterial, type Texture } from "three";
import { paintBlock, type DieBlockKind } from "@/lib/three/dieShot";
import { FONT_SANS, painted, type Painter } from "@/lib/three/painter";
import { SOC } from "./layout";

/**
 * A simplified floorplan of the BCM2712 (C1 stepping, 8.63 × 6.47 mm).
 *
 * Broadcom does not publish the real floorplan, so block sizes and positions
 * are illustrative: each interface sits on the die edge that faces the part it
 * talks to on the board (memory PHY toward the SDRAM, PCIe ×4 toward RP1,
 * HDMI toward the micro-HDMI ports), as real chips are laid out.
 *
 * Units are die millimetres; x → board +X, y → board +Z (toward the HDMI edge).
 */
export const DIE_W = SOC.die.w;
export const DIE_H = SOC.die.d;

export interface FloorBlock {
  /** Part id the tile belongs to. */
  part: string;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: DieBlockKind;
  hue: number;
  /** Category tint for the labelled view. */
  tint: string;
  label?: string;
  sub?: string;
  vertical?: boolean;
  /** Horizontal shift of the label centre (die mm), to clear inner blocks. */
  labelDx?: number;
  /** Extra height (die mm) above the other tiles (L1 caches sit on the cores). */
  raise?: number;
}

const CPU = "#f472b6";
const MEM = "#a78bfa";
const GPU = "#fb7185";
const MEDIA = "#fbbf24";
const IO = "#fb923c";
const SYS = "#2dd4bf";
const DARK = "#64748b";

/**
 * One Cortex-A76 core: its logic, the private L2 on the cluster's outer edge
 * and the L1 instruction/data caches tucked against the core's outer side.
 */
function core(i: number, x: number, top: boolean): FloorBlock[] {
  const w = 1.85;
  const l2h = 0.55;
  const ch = 1.1;
  const y0 = top ? 1.42 : 3.62;
  const l2y = top ? y0 : y0 + ch;
  const cy = top ? y0 + l2h : y0;
  const left = i % 2 === 0;
  const l1x = left ? x + 0.08 : x + w - 0.6;
  return [
    { part: "die-l2", x, y: l2y, w, h: l2h, kind: "sram", hue: 215, tint: MEM, label: "L2 · 512 KB" },
    { part: "die-cpu-cores", x, y: cy, w, h: ch, kind: "logic", hue: 330 + i * 6, tint: CPU, label: `Core ${i}`, sub: "Cortex-A76", labelDx: left ? 0.3 : -0.3 },
    { part: "die-l1", x: l1x, y: cy + 0.08, w: 0.52, h: 0.44, kind: "sram", hue: 250, tint: MEM, label: "L1 I", raise: 0.03 },
    { part: "die-l1", x: l1x, y: cy + 0.58, w: 0.52, h: 0.44, kind: "sram", hue: 250, tint: MEM, label: "L1 D", raise: 0.03 },
  ];
}

export const FLOORPLAN: FloorBlock[] = [
  // Memory interface along the edge facing the SDRAM.
  { part: "die-memory", x: 1.0, y: 0.22, w: 3.25, h: 0.56, kind: "phy", hue: 40, tint: MEM, label: "LPDDR4X PHY", sub: "channel 0" },
  { part: "die-memory", x: 4.45, y: 0.22, w: 3.25, h: 0.56, kind: "phy", hue: 40, tint: MEM, label: "LPDDR4X PHY", sub: "channel 1" },
  { part: "die-memory", x: 1.0, y: 0.86, w: 3.25, h: 0.44, kind: "logic", hue: 260, tint: MEM, label: "Memory controller" },
  { part: "die-memory", x: 4.45, y: 0.86, w: 3.25, h: 0.44, kind: "logic", hue: 260, tint: MEM, label: "Memory controller" },
  // Quad-core Cortex-A76 cluster around its shared L3.
  ...core(0, 0.95, true),
  ...core(1, 3.0, true),
  ...core(2, 0.95, false),
  ...core(3, 3.0, false),
  { part: "die-l3", x: 0.95, y: 3.11, w: 1.55, h: 0.47, kind: "sram", hue: 200, tint: MEM, label: "L3 cache" },
  { part: "die-l3", x: 2.55, y: 3.11, w: 0.75, h: 0.47, kind: "logic", hue: 180, tint: MEM, label: "DSU" },
  { part: "die-l3", x: 3.35, y: 3.11, w: 1.5, h: 0.47, kind: "sram", hue: 200, tint: MEM, label: "2 MB shared" },
  // Graphics, media and imaging.
  { part: "die-gpu", x: 5.05, y: 1.42, w: 2.2, h: 2.83, kind: "logic", hue: 300, tint: GPU, label: "VideoCore VII", sub: "GPU" },
  { part: "die-hevc", x: 5.05, y: 4.4, w: 1.3, h: 1.0, kind: "logic", hue: 50, tint: MEDIA, label: "HEVC", sub: "4K60 decode" },
  { part: "die-isp", x: 6.45, y: 4.4, w: 1.98, h: 1.0, kind: "logic", hue: 120, tint: MEDIA, label: "ISP", sub: "image back end" },
  // PCI Express: ×4 toward RP1 on the right edge, ×1 toward the FPC on the left.
  { part: "die-pcie", x: 7.32, y: 1.42, w: 0.48, h: 2.83, kind: "logic", hue: 20, tint: IO, label: "PCIe ctrl", vertical: true },
  { part: "die-pcie", x: 7.86, y: 1.42, w: 0.57, h: 2.83, kind: "phy", hue: 40, tint: IO, label: "PCIe ×4 → RP1", vertical: true },
  { part: "die-pcie", x: 0.2, y: 1.42, w: 0.62, h: 1.5, kind: "phy", hue: 40, tint: IO, label: "PCIe ×1", vertical: true },
  // Display pipeline and HDMI PHYs along the edge facing the HDMI ports.
  { part: "die-display", x: 0.95, y: 5.35, w: 2.65, h: 0.56, kind: "logic", hue: 160, tint: IO, label: "Display · HVS" },
  { part: "die-display", x: 1.0, y: 5.97, w: 1.25, h: 0.3, kind: "phy", hue: 40, tint: IO, label: "HDMI 0" },
  { part: "die-display", x: 2.35, y: 5.97, w: 1.25, h: 0.3, kind: "phy", hue: 40, tint: IO, label: "HDMI 1" },
  // Housekeeping.
  { part: "die-system", x: 3.7, y: 5.35, w: 1.15, h: 0.92, kind: "logic", hue: 170, tint: SYS, label: "Boot ROM", sub: "& system" },
  { part: "die-io", x: 0.2, y: 3.05, w: 0.62, h: 2.2, kind: "pad", hue: 30, tint: IO, label: "SD · SDIO", vertical: true },
  { part: "die-io", x: 6.7, y: 5.52, w: 1.73, h: 0.75, kind: "logic", hue: 30, tint: IO, label: "UART · I²C", sub: "GPIO · timers" },
  { part: "die-dark-silicon", x: 5.05, y: 5.52, w: 1.55, h: 0.75, kind: "logic", hue: 210, tint: DARK, label: "Unused", sub: "Ethernet MAC…" },
];

/** Paint the realistic die texture (no labels) into `p` (die-mm coordinates). */
function paintRealistic(p: Painter) {
  // Background: interconnect fabric and filler logic between the blocks.
  paintBlock(p, { x: 0, y: 0, w: DIE_W, h: DIE_H, kind: "logic", hue: 205 }, 5);
  paintBlock(p, { x: 0.2, y: 1.31, w: DIE_W - 0.4, h: 0.1, kind: "fabric", hue: 190 }, 9);
  paintBlock(p, { x: 4.88, y: 1.4, w: 0.14, h: 3.9, kind: "fabric", hue: 190 }, 21);
  // I/O pad ring.
  const e = 0.2;
  paintBlock(p, { x: 0, y: 0, w: DIE_W, h: e, kind: "pad" }, 1);
  paintBlock(p, { x: 0, y: DIE_H - e, w: DIE_W, h: e, kind: "pad" }, 2);
  paintBlock(p, { x: 0, y: e, w: e, h: DIE_H - 2 * e, kind: "pad" }, 3);
  paintBlock(p, { x: DIE_W - e, y: e, w: e, h: DIE_H - 2 * e, kind: "pad" }, 4);
  FLOORPLAN.forEach((b, i) => {
    paintBlock(p, b, 100 + i);
    if (b.part === "die-gpu") {
      // Twelve QPUs in three slices, plus shared texture/L2 SRAM strips.
      for (let s = 0; s < 3; s++) {
        const sx = b.x + 0.08 + s * ((b.w - 0.16) / 3);
        const sw = (b.w - 0.16) / 3 - 0.06;
        for (let q = 0; q < 4; q++) paintBlock(p, { x: sx, y: b.y + 0.1 + q * 0.5, w: sw, h: 0.42, kind: "logic", hue: 290 + q * 8 }, 300 + s * 4 + q);
        paintBlock(p, { x: sx, y: b.y + 2.1, w: sw, h: 0.6, kind: "sram", hue: 230 }, 320 + s);
      }
    }
  });
}

const DIE_BASE = { color: "#14181c", rough: 0.2, metal: 0.6, height: 0.5 };

let realMaps: ReturnType<typeof painted> | null = null;
/** Low-resolution unlabelled die shot for the real (tiny) die's circuit side. */
function realisticMaps() {
  return (realMaps ??= painted("pi5:bcm2712-die", DIE_W, DIE_H, 70, DIE_BASE, paintRealistic));
}

/** Outlined label text drawn straight onto the colour canvas. */
function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, maxW: number, rotate = 0, weight = 700) {
  ctx.save();
  ctx.translate(x, y);
  if (rotate) ctx.rotate(rotate);
  ctx.font = `${weight} ${size}px ${FONT_SANS}`;
  const w = ctx.measureText(text).width;
  if (w > maxW) {
    const s = maxW / w;
    ctx.scale(s, s);
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = size * 0.22;
  ctx.strokeStyle = "rgba(4,6,12,0.85)";
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

/** Realistic die shot plus category tints, crisp outlines and labels. */
function paintLabelled(p: Painter) {
  paintRealistic(p);
  const ctx = p.c;
  for (const b of FLOORPLAN) {
    ctx.save();
    ctx.globalAlpha = b.part === "die-l1" ? 0.42 : 0.3;
    ctx.fillStyle = b.tint;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = b.tint;
    ctx.lineWidth = 0.025;
    ctx.strokeRect(b.x + 0.0125, b.y + 0.0125, b.w - 0.025, b.h - 0.025);
    ctx.restore();
  }
  for (const b of FLOORPLAN) {
    if (!b.label) continue;
    const cx = b.x + b.w / 2 + (b.labelDx ?? 0);
    const cy = b.y + b.h / 2;
    if (b.vertical) {
      label(ctx, b.label, cx, cy, Math.min(0.2, b.w * 0.42), b.h * 0.9, -Math.PI / 2);
      continue;
    }
    const small = b.h < 0.5 || b.w < 0.8;
    const size = Math.min(b.part === "die-gpu" ? 0.34 : 0.24, b.h * (b.sub ? 0.3 : 0.46), small ? 0.16 : 0.3);
    const room = b.w - 2 * Math.abs(b.labelDx ?? 0);
    if (b.sub) {
      label(ctx, b.label, cx, cy - size * 0.62, size, room * 0.9);
      label(ctx, b.sub, cx, cy + size * 0.68, size * 0.72, room * 0.9, 0, 600);
    } else {
      label(ctx, b.label, cx, cy, size, b.w * 0.88);
    }
  }
}

let labelledMaps: ReturnType<typeof painted> | null = null;
/** High-resolution labelled floorplan (260 px per die-mm, 2244 × 1682). */
function labelledMapsGet() {
  return (labelledMaps ??= painted("pi5:bcm2712-floorplan", DIE_W, DIE_H, 260, DIE_BASE, paintLabelled));
}

function dieMaterial(maps: { map: Texture; rmMap: Texture }, labelled: boolean) {
  return new MeshPhysicalMaterial({
    map: maps.map,
    roughnessMap: maps.rmMap,
    metalnessMap: maps.rmMap,
    roughness: 1,
    metalness: labelled ? 0.55 : 1,
    iridescence: labelled ? 0.25 : 0.6,
    iridescenceIOR: 1.8,
    iridescenceThicknessRange: [200, 700],
    emissiveMap: labelled ? maps.map : null,
    emissive: labelled ? "#ffffff" : "#000000",
    emissiveIntensity: labelled ? 0.32 : 0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

let realMat: MeshPhysicalMaterial | null = null;
/** Circuit side of the real die (faces down, flip-chip). */
export function dieShotMaterial() {
  return (realMat ??= dieMaterial(realisticMaps(), false));
}

let labelMat: MeshPhysicalMaterial | null = null;
/** Labelled floorplan used by the magnified deep-dive view. */
export function floorplanMaterial() {
  return (labelMat ??= dieMaterial(labelledMapsGet(), true));
}
