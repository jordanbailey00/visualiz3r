"use client";

import { useMemo } from "react";
import { MeshPhysicalMaterial } from "three";
import { FONT_COND, FONT_SANS, octilinear, painted, rng, type Painter, type Surface } from "@/lib/three/painter";
import { bgaFanout, bgaLand, smdPads, type PcbSurfaces } from "@/lib/three/pcbPaint";
import { circlePath, extrudedWalls, flatFace, roundedRectShape, type FlatBounds } from "../../kit/geometry";
import { MAT, variant } from "../../kit/materials";
import type { SmdItem } from "../../kit/Passives";
import {
  ANTENNA_PARTS,
  ANTENNA_POLY,
  BAT_CONN,
  BOOT_FLASH,
  CORE_INDUCTORS,
  COOLER_HOLES,
  COOLER_HOLE_R,
  CRYSTALS,
  ETH,
  FAN_CONN,
  GPIO,
  HDMI,
  HDMI_X,
  INDUCTOR,
  J2_PADS,
  KEEP_OUT,
  MICROSD,
  MIPI,
  MIPI_X,
  MOUNT_HOLES,
  MOUNT_HOLE_R,
  PCB,
  PCIE_FPC,
  PHY,
  PMIC,
  POE,
  RAM,
  RP1,
  SOC,
  UART_CONN,
  USB2,
  USB3,
  USB_STACK,
  USB_SWITCH,
  USBC,
  WIFI,
  blocked,
  wx,
  wz,
} from "./layout";
import { BOTTOM_PASSIVES, TOP_PASSIVES, type PassiveSet } from "./passives";

type Pt = [number, number];

/**
 * Solder-mask palette of a Raspberry Pi board: a brighter, slightly bluish
 * green than generic PCBs, gold (ENIG) pads and crisp white silkscreen.
 */
export const PI_SURF: PcbSurfaces = {
  mask: { color: "#1b5a31", rough: 0.34, metal: 0, height: 0.3 },
  copper: { color: "#256c3c", rough: 0.3, metal: 0.04, height: 0.5 },
  gold: { color: "#e1b45f", rough: 0.2, metal: 1, height: 0.6 },
  tin: { color: "#c9ccd0", rough: 0.28, metal: 1, height: 0.6 },
  silk: { color: "#f1f2ec", rough: 0.72, metal: 0, height: 0.68 },
  via: { color: "#1f6236", rough: 0.32, metal: 0.04, height: 0.42 },
  hole: { color: "#0a0a0a", rough: 0.9, metal: 0, height: 0.05 },
  laminate: { color: "#6f7b4c", rough: 0.6, metal: 0, height: 0.28 },
};
/** Signal traces under the mask: a touch brighter and higher than the pour. */
const TRACE: Surface = { color: "#2c7a45", rough: 0.28, metal: 0.05, height: 0.6 };
/** Pour-free mask (clearance channels around traces). */
const GAP: Surface = { ...PI_SURF.mask, height: 0.26 };

// ---------------------------------------------------------------------------
// Routing helpers
// ---------------------------------------------------------------------------

/**
 * Collects traces and paints them in two passes: first a wider stroke of bare
 * mask (the clearance that real copper pours keep around every trace), then
 * the copper itself. That dark outline is what makes PCB traces readable.
 */
class Router {
  private lines: { pts: Pt[]; w: number; gap: number }[] = [];

  add(pts: Pt[], w = 0.1, gap = 0.09) {
    this.lines.push({ pts, w, gap });
    return this;
  }

  /** Parallel octilinear lines between two points, offset by `offsets` (mm). */
  bus(from: Pt, to: Pt, offsets: number[], horizontalFirst: boolean, w = 0.1, gap = 0.08) {
    for (const o of offsets) {
      const pts = horizontalFirst
        ? octilinear(from[0], from[1] + o, to[0], to[1] + o, true)
        : octilinear(from[0] + o, from[1], to[0] + o, to[1], false);
      this.add(pts, w, gap);
    }
    return this;
  }

  paint(p: Painter) {
    for (const l of this.lines) p.polyline(l.pts, l.w + 2 * l.gap, GAP);
    for (const l of this.lines) p.polyline(l.pts, l.w, TRACE);
  }
}

/** Offsets for `n` evenly spaced lines centred on 0. */
const spread = (n: number, pitch: number) => Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * pitch);

/** Offsets for differential pairs: two lines `inner` apart, pairs `pitch` apart. */
function pairs(n: number, pitch: number, inner = 0.22) {
  const out: number[] = [];
  for (const c of spread(n, pitch)) out.push(c - inner / 2, c + inner / 2);
  return out;
}

/** Tented via with its clearance ring in the pour. */
function via(p: Painter, x: number, y: number, r = 0.17) {
  p.circle(x, y, r + 0.1, GAP);
  p.circle(x, y, r, PI_SURF.copper);
  p.circle(x, y, r * 0.5, PI_SURF.via);
}

/** Exposed gold test point. */
function testPad(p: Painter, x: number, y: number, r = 0.45) {
  p.circle(x, y, r + 0.12, GAP);
  p.circle(x, y, r, PI_SURF.gold);
}

/** Through-hole pad (annular ring around a drilled hole). */
function pth(p: Painter, x: number, y: number, hole: number, ring: number, square = false) {
  const s = PI_SURF;
  if (square) p.rect(x - hole - ring, y - hole - ring, 2 * (hole + ring), 2 * (hole + ring), s.gold);
  else p.circle(x, y, hole + ring, s.gold);
  p.circle(x, y, hole, s.hole);
}

function silk(p: Painter, text: string, x: number, y: number, size = 0.9, rotate = 0, align: CanvasTextAlign = "center", weight = 700) {
  p.text(text, x, y, size, PI_SURF.silk, { align, baseline: "middle", rotate, weight, font: FONT_SANS });
}

function silkBox(p: Painter, x: number, y: number, w: number, h: number, line = 0.13) {
  p.strokeRect(x, y, w, h, line, PI_SURF.silk);
}

/** Corner brackets instead of a full outline (common on dense boards). */
function silkCorners(p: Painter, x: number, y: number, w: number, h: number, len = 1.2, line = 0.13) {
  const s = PI_SURF.silk;
  const L = Math.min(len, w / 3, h / 3);
  for (const [cx, cy, dx, dy] of [
    [x, y, 1, 1],
    [x + w, y, -1, 1],
    [x, y + h, 1, -1],
    [x + w, y + h, -1, -1],
  ]) {
    p.polyline(
      [
        [cx + dx * L, cy],
        [cx, cy],
        [cx, cy + dy * L],
      ],
      line,
      s,
    );
  }
}

function paintPassivePads(p: Painter, set: PassiveSet) {
  const s = PI_SURF;
  const pads = (items: SmdItem[], len: number, wid: number) => {
    for (const [x, z, r = 0] of items) smdPads(p, s, x, z, len, wid, r, s.tin);
  };
  pads(set.c0201, 0.66, 0.32);
  pads(set.r0201, 0.66, 0.32);
  pads(set.c0402, 1.1, 0.55);
  pads(set.r0402, 1.1, 0.55);
  pads(set.c0603, 1.75, 0.85);
  pads(set.c0805, 2.2, 1.3);
}

/** Stitching vias on a loose grid wherever nothing else lives. */
function stitch(p: Painter, step: number, seed: number, extra: [number, number, number, number][] = []) {
  const r = rng(seed);
  for (let z = 1.4; z < PCB.d - 1; z += step) {
    for (let x = 1.4 + ((z / step) % 2) * (step / 2); x < PCB.w - 1; x += step) {
      const jx = x + (r() - 0.5) * 0.5;
      const jz = z + (r() - 0.5) * 0.5;
      if (blocked(jx, jz, 0.6, [...KEEP_OUT, ...extra])) continue;
      if (r() < 0.25) continue;
      via(p, jx, jz, 0.15);
    }
  }
}

// ---------------------------------------------------------------------------
// Top side
// ---------------------------------------------------------------------------

function paintTop(p: Painter) {
  const s = PI_SURF;
  const rand = rng(5);

  // --- Copper pours (under the mask) --------------------------------------
  p.roundRect(0.45, 0.45, PCB.w - 0.9, PCB.d - 0.9, 2.6, s.copper);
  // Antenna keep-out: no copper anywhere near the radiating element.
  p.roundRect(-1, 6.6, 7.6, 13.9, 0.8, GAP);
  // Power islands: 5 V input, PMIC switching nodes and the SoC core rail.
  const island = (pts: Pt[]) => p.polyline([...pts, pts[0]], 0.32, GAP);
  island([
    [5.5, 44.6],
    [17.5, 44.6],
    [17.5, 49.2],
    [16.2, 55.4],
    [5.5, 55.4],
  ]);
  island([
    [4.6, 31.6],
    [18.3, 31.6],
    [18.3, 36.0],
    [24.1, 36.0],
    [24.1, 44.1],
    [4.6, 44.1],
  ]);
  island([
    [65.9, 36.9],
    [84.6, 36.9],
    [84.6, 55.2],
    [65.9, 55.2],
  ]);
  // Ground pour under the Ethernet magnetics is split from logic ground.
  p.polyline(
    [
      [65.4, 36.4],
      [65.4, 55.5],
    ],
    0.5,
    GAP,
  );

  // --- Signal routing --------------------------------------------------------
  const R = new Router();
  const socL = SOC.x - SOC.size / 2;
  const socR = SOC.x + SOC.size / 2;
  const socT = SOC.z - SOC.size / 2;
  const socB = SOC.z + SOC.size / 2;
  const ramB = RAM.z + RAM.d / 2;

  // LPDDR4X: a dense field of short, length-matched lines between SoC and RAM.
  for (let i = 0; i < 40; i++) {
    const x = RAM.x - 6.6 + i * 0.34;
    const wig = i % 3 === 0 ? 0.18 : 0;
    R.add(
      [
        [x, ramB + 0.2],
        [x, ramB + 0.8],
        [x + wig, ramB + 1.0],
        [x + wig, ramB + 1.5],
        [x, ramB + 1.7],
        [x, socT - 0.2],
      ],
      0.085,
      0.06,
    );
  }
  // PCIe 2.0 ×4 to RP1: four TX and four RX differential pairs + REFCLK.
  R.bus([socR + 0.3, 27.4], [RP1.x - RP1.size / 2 - 0.2, 18.2], pairs(9, 0.62), true, 0.1, 0.07);
  // PCIe ×1 to the FPC connector on the left edge.
  R.bus([socL - 0.3, 26.0], [PCIE_FPC.x + 1.8, 26.0], pairs(3, 0.68), true, 0.1, 0.07);
  R.bus([socL - 0.3, 29.4], [PCIE_FPC.x + 1.8, 28.4], spread(3, 0.42), true, 0.09, 0.07);
  // HDMI: four TMDS pairs plus DDC/HPD to each micro-HDMI port.
  R.bus([28.0, socB + 0.3], [HDMI_X[0], HDMI.z0 - 0.3], pairs(4, 0.62), false, 0.1, 0.07);
  R.bus([37.6, socB + 0.3], [HDMI_X[1], HDMI.z0 - 0.3], pairs(4, 0.62), false, 0.1, 0.07);
  R.bus([31.5, socB + 0.3], [UART_CONN.x, 50.3], spread(3, 0.4), false, 0.09, 0.07);
  // SDIO to the wireless chip.
  R.bus([socL - 0.3, 31.0], [WIFI.x + WIFI.w / 2 + 0.2, 17.4], spread(6, 0.36), true, 0.09, 0.07);
  // RP1 → USB 3.0 ports (SuperSpeed pairs) and USB 2.0 ports.
  R.bus([RP1.x + RP1.size / 2 + 0.2, 23.6], [USB_STACK.x0 + 0.6, USB3.z], pairs(6, 0.6), true, 0.1, 0.07);
  R.bus([62.0, RP1.z - RP1.size / 2 - 0.2], [USB_STACK.x0 + 0.6, 7.7], pairs(2, 0.6), false, 0.1, 0.07);
  // RP1 → Ethernet PHY (RGMII), PHY → magnetics (four MDI pairs).
  R.bus([61.6, RP1.z + RP1.size / 2 + 0.2], [PHY.x - 2.1, PHY.z - 2.1], spread(8, 0.32), false, 0.09, 0.06);
  R.bus([PHY.x + 2.1, PHY.z + 2.1], [ETH.x0 + 0.8, 47.0], pairs(4, 0.62), false, 0.1, 0.07);
  // Magnetics → PoE header.
  R.bus([ETH.x0 + 0.6, 45.1], [POE.x + 2.4, 46.5], spread(4, 0.6), true, 0.18, 0.1);
  // RP1 → camera/display connectors (two 4-lane MIPI links).
  R.bus([54.6, RP1.z + RP1.size / 2 + 0.2], [MIPI_X[0], MIPI.z - MIPI.d / 2 - 0.3], pairs(5, 0.5), false, 0.1, 0.06);
  R.bus([57.4, RP1.z + RP1.size / 2 + 0.2], [MIPI_X[1], MIPI.z - MIPI.d / 2 - 0.3], pairs(5, 0.5), false, 0.1, 0.06);
  // RP1 → GPIO header: a bus running west under the header with stubs to pins.
  for (let i = 0; i < 18; i++) {
    const y = 7.0 + (i % 9) * 0.36;
    const col = 19 - i;
    const px = GPIO.x + (col - 9.5) * GPIO.pitch + (i < 9 ? 0 : 0.0);
    const pinZ = i < 9 ? 4.77 : 2.23;
    const startX = RP1.x - 5.6 + (i % 9) * 0.4;
    R.add(
      [
        [startX, RP1.z - RP1.size / 2 - 0.2],
        [startX, y + 1.2],
        [startX - 1.2, y],
        [px + 0.6, y],
        [px, y - 0.6],
        [px, pinZ + (pinZ < 3 ? 0.9 : 0.6)],
      ],
      0.09,
      0.06,
    );
  }
  // Fan header PWM / tach and 5 V.
  R.bus([RP1.x + 3.5, RP1.z - RP1.size / 2 - 0.2], [FAN_CONN.x - 0.5, 6.4], spread(3, 0.4), false, 0.09, 0.06);
  // Boot flash (QSPI) back to the SoC.
  R.bus([BOOT_FLASH.x - 0.8, BOOT_FLASH.z + 1.0], [socR - 2, socT - 0.3], spread(5, 0.34), false, 0.09, 0.06);
  // RTC battery and power button lines to the PMIC.
  R.bus([BAT_CONN.x, BAT_CONN.z - 1.5], [PMIC.x + 2.2, PMIC.z + 3.2], spread(2, 0.5), false, 0.15, 0.08);
  R.add([[2.9, 37.6], [6.5, 37.6], [7.8, 38.9]], 0.1).add([[1.7, 42.7], [6.4, 42.7], [7.8, 41.3]], 0.1);
  // Random short routes fill the remaining space.
  for (let i = 0; i < 70; i++) {
    const ax = 2 + rand() * 81;
    const ay = 2 + rand() * 52;
    if (blocked(ax, ay, 0.8)) continue;
    const ang = Math.floor(rand() * 8) * (Math.PI / 4);
    const len = 2 + rand() * 5;
    const bx = ax + Math.cos(ang) * len;
    const by = ay + Math.sin(ang) * len;
    if (blocked(bx, by, 0.8)) continue;
    const lanes = 1 + Math.floor(rand() * 3);
    for (let k = 0; k < lanes; k++) {
      R.add(octilinear(ax + k * 0.3, ay, bx + k * 0.3, by, rand() > 0.5), 0.09, 0.06);
    }
  }
  R.paint(p);

  // Wide power traces (drawn after signals so they sit on top).
  p.polyline(
    [
      [USBC.x, USBC.z0 - 0.4],
      [USBC.x, 46.0],
      [PMIC.x + 1, PMIC.z + 3.4],
    ],
    1.6,
    TRACE,
  );
  for (const [x] of CORE_INDUCTORS) p.polyline([[x, 33.0], [x, 31.9], [19.6, 31.9]], 0.9, TRACE);
  p.polyline([[19.6, 31.9], [socL - 0.6, 31.9]], 2.2, TRACE);

  // --- Land patterns under the chips (seen when they lift off) ---------------
  bgaFanout(p, s, SOC.x, SOC.z, 20, 20, 0.8);
  bgaLand(p, s, SOC.x, SOC.z, 20, 20, 0.8, 0.4, { surface: s.gold });
  bgaFanout(p, s, RAM.x, RAM.z, 21, 14, 0.65);
  bgaLand(p, s, RAM.x, RAM.z, 21, 14, 0.65, 0.3, { surface: s.gold, hollow: 4 });
  bgaFanout(p, s, RP1.x, RP1.z, 17, 17, 0.65);
  bgaLand(p, s, RP1.x, RP1.z, 17, 17, 0.65, 0.3, { surface: s.gold });
  qfnLand(p, PMIC.x, PMIC.z, PMIC.size, 12, 0);
  qfnLand(p, PHY.x, PHY.z, PHY.size, 12, 45);
  // Shield-can fence and the radio chip's pads inside it.
  p.strokeRect(WIFI.x - WIFI.w / 2 + 0.2, WIFI.z - WIFI.d / 2 + 0.2, WIFI.w - 0.4, WIFI.d - 0.4, 0.45, s.gold);
  bgaLand(p, s, WIFI.x + 0.6, WIFI.z - 1.2, 8, 6, 0.5, 0.24, { surface: s.gold });
  for (const [x, z] of CORE_INDUCTORS) {
    p.rect(x - INDUCTOR.w / 2, z - INDUCTOR.d / 2 - 0.1, INDUCTOR.w, 0.9, s.tin);
    p.rect(x - INDUCTOR.w / 2, z + INDUCTOR.d / 2 - 0.8, INDUCTOR.w, 0.9, s.tin);
  }
  for (const c of CRYSTALS) {
    for (const [dx, dz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ])
      p.rect(c.x + dx * c.w * 0.27 - 0.35, c.z + dz * c.d * 0.27 - 0.3, 0.7, 0.6, s.tin);
  }
  // Boot flash (USON-8) and the USB power switch (SOT-23-6).
  for (let i = 0; i < 4; i++) {
    p.rect(BOOT_FLASH.x - 0.75, BOOT_FLASH.z - 0.9 + i * 0.5 - 0.12, 0.35, 0.24, s.tin);
    p.rect(BOOT_FLASH.x + 0.4, BOOT_FLASH.z - 0.9 + i * 0.5 - 0.12, 0.35, 0.24, s.tin);
  }
  p.rect(BOOT_FLASH.x - 0.3, BOOT_FLASH.z - 0.8, 0.6, 1.6, s.tin);

  // --- Through-hole pads ------------------------------------------------------
  for (let c = 0; c < GPIO.cols; c++) {
    for (const zz of [GPIO.z - GPIO.pitch / 2, GPIO.z + GPIO.pitch / 2]) {
      const x = GPIO.x + (c - (GPIO.cols - 1) / 2) * GPIO.pitch;
      pth(p, x, zz, 0.5, 0.36, c === 0 && zz > GPIO.z);
    }
  }
  for (const dx of [-1.27, 1.27]) for (const dz of [-1.27, 1.27]) pth(p, POE.x + dx, POE.z + dz, 0.5, 0.36);
  for (const [x, z] of J2_PADS) pth(p, x, z, 0.5, 0.35);
  for (const [x, z] of MOUNT_HOLES) {
    p.circle(x, z, 3.2, GAP);
    p.circle(x, z, 2.95, s.gold);
    p.circle(x, z, MOUNT_HOLE_R + 0.05, s.hole);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + 0.39;
      p.circle(x + Math.cos(a) * 2.25, z + Math.sin(a) * 2.25, 0.16, s.hole);
    }
  }
  for (const [x, z] of COOLER_HOLES) {
    p.circle(x, z, COOLER_HOLE_R + 0.75, GAP);
    p.circle(x, z, COOLER_HOLE_R + 0.5, s.gold);
  }
  // Connector shell legs and signal pads.
  for (const x of HDMI_X) {
    for (let k = 0; k < 10; k++) p.rect(x - 2.25 + k * 0.5 - 0.12, HDMI.z0 - 0.9, 0.24, 0.9, s.tin);
  }
  for (let k = 0; k < 12; k++) p.rect(USBC.x - 2.75 + k * 0.5 - 0.13, USBC.z0 - 1.0, 0.26, 0.9, s.tin);
  for (const zc of [USB2.z, USB3.z]) {
    for (let k = 0; k < 9; k++) pth(p, USB_STACK.x0 + 1.4 + (k % 2) * 1.6, zc - 4 + k, 0.35, 0.25);
  }
  for (const x of MIPI_X) {
    for (let k = 0; k < 11; k++) {
      p.rect(x - MIPI.w / 2 - 0.8, MIPI.z - 5 + k * 1.0 - 0.13, 0.7, 0.26, s.tin);
      p.rect(x + MIPI.w / 2 + 0.1, MIPI.z - 4.5 + k * 1.0 - 0.13, 0.7, 0.26, s.tin);
    }
  }
  for (let k = 0; k < 16; k++) p.rect(PCIE_FPC.x + 1.55, PCIE_FPC.z - 3.75 + k * 0.5 - 0.11, 0.8, 0.22, s.tin);

  // --- Vias -------------------------------------------------------------------
  // Fan-out vias around the big BGAs and power vias at the core inductors.
  for (let i = 0; i < 26; i++) via(p, socL - 0.9 - (i % 2) * 0.55, SOC.z - 6.5 + i * 0.52, 0.14);
  for (let i = 0; i < 26; i++) via(p, socR + 0.9 + (i % 2) * 0.55, SOC.z - 6.5 + i * 0.52, 0.14);
  for (let i = 0; i < 18; i++) via(p, 20.2 + (i % 3) * 0.7, 30.2 + Math.floor(i / 3) * 0.6, 0.18);
  stitch(p, 2.4, 11);
  // Fence of stitching vias along the board edge.
  for (let x = 2; x < PCB.w - 2; x += 1.6) {
    if (!blocked(x, 0.9, 0.3)) via(p, x, 0.9, 0.13);
    if (!blocked(x, PCB.d - 0.9, 0.3)) via(p, x, PCB.d - 0.9, 0.13);
  }

  // --- Antenna: the radiating copper element and its four tuning parts ---------
  const ant: Surface = { ...TRACE, height: 0.62 };
  p.polygon(ANTENNA_POLY, ant);
  p.polyline(
    [
      [3.4, 12.8],
      [5.0, 12.8],
      [5.6, 13.4],
      [6.9, 13.4],
    ],
    0.32,
    ant,
  );
  p.polyline(
    [
      [WIFI.x - WIFI.w / 2, 15.2],
      [6.4, 15.2],
      [5.9, 14.6],
      [5.9, 13.6],
    ],
    0.32,
    ant,
  );
  for (const [x, z, r] of ANTENNA_PARTS) smdPads(p, s, x, z, 0.66, 0.32, r, s.tin);

  // --- Passive solder pads ---------------------------------------------------
  paintPassivePads(p, TOP_PASSIVES);

  // --- Test points & fiducials ---------------------------------------------------
  for (const [x, z] of [
    [20.6, 39.4],
    [21.6, 39.4],
    [22.6, 39.4],
    [45.6, 47.2],
    [45.6, 48.4],
    [44.0, 52.6],
    [57.5, 37.6],
    [57.5, 38.8],
    [4.2, 47.9],
    [62.6, 29.2],
    [50.6, 8.4],
    [24.2, 8.6],
  ] as Pt[])
    testPad(p, x, z, 0.42);
  for (const [x, z] of [
    [45.4, 7.4],
    [20.6, 47.8],
    [69.0, 35.6],
  ] as Pt[]) {
    p.circle(x, z, 1.1, { ...s.laminate, color: "#2a5a3a", height: 0.25 });
    p.circle(x, z, 0.5, s.gold);
  }

  // --- Silkscreen --------------------------------------------------------------
  p.text("Raspberry Pi 5", 27.4, 44.7, 2.25, s.silk, { align: "center", baseline: "middle", font: FONT_SANS, weight: 800, letterSpacing: 0.05 });
  silk(p, "1", GPIO.x - 9.5 * GPIO.pitch - 1.85, GPIO.z + 1.3, 0.85);
  silk(p, "2", GPIO.x - 9.5 * GPIO.pitch - 1.85, GPIO.z - 1.2, 0.85);
  silk(p, "39", GPIO.x + 9.5 * GPIO.pitch + 2.1, GPIO.z + 1.3, 0.85);
  silk(p, "40", GPIO.x + 9.5 * GPIO.pitch + 2.1, GPIO.z - 1.2, 0.85);
  silk(p, "GPIO", 45.2, 9.3, 0.9);
  silkBox(p, GPIO.x - 10 * GPIO.pitch - 0.25, GPIO.z - GPIO.pitch - 0.25, 20 * GPIO.pitch + 0.5, 2 * GPIO.pitch + 0.5);
  p.polyline([[GPIO.x - 10 * GPIO.pitch - 0.25, GPIO.z + 0.2], [GPIO.x - 9 * GPIO.pitch, GPIO.z + 0.2], [GPIO.x - 9 * GPIO.pitch, GPIO.z + GPIO.pitch + 0.25]], 0.13, s.silk);
  silk(p, "FAN", FAN_CONN.x - 3.0, 1.9, 0.8, 0, "center");
  silk(p, "BAT", BAT_CONN.x, 48.6, 0.8);
  silk(p, "J5", BAT_CONN.x - 3.0, BAT_CONN.z, 0.7);
  silk(p, "J2", 19.0, 55.4, 0.7);
  silk(p, "UART", UART_CONN.x, 49.4, 0.8);
  silk(p, "POE", POE.x, 42.6, 0.8);
  silk(p, "HDMI0", HDMI_X[0], 48.2, 0.75);
  silk(p, "HDMI1", HDMI_X[1], 48.2, 0.75);
  silk(p, "CAM/DISP 0", MIPI_X[0] - MIPI.w / 2 - 1.15, MIPI.z, 0.75, -90);
  silk(p, "CAM/DISP 1", MIPI_X[1] - MIPI.w / 2 - 1.15, MIPI.z, 0.75, -90);
  silk(p, "PCIE", PCIE_FPC.x + 3.2, PCIE_FPC.z, 0.75, -90);
  silk(p, "5V 5A", USBC.x, 47.1, 0.75);
  silk(p, "U1", SOC.x - SOC.size / 2 - 1.2, SOC.z + SOC.size / 2 + 0.9, 0.7);
  silk(p, "U3", RP1.x - RP1.size / 2 - 0.4, RP1.z + RP1.size / 2 + 0.9, 0.7);
  silk(p, "U5", PMIC.x + PMIC.size / 2 + 1.3, PMIC.z + PMIC.size / 2 + 0.2, 0.7);
  silk(p, "U9", PHY.x + 3.6, PHY.z - 3.6, 0.7);
  silk(p, "Y1", CRYSTALS[0].x + 2.0, CRYSTALS[0].z, 0.6);
  silk(p, "Y2", CRYSTALS[1].x, CRYSTALS[1].z - 1.9, 0.6);
  silk(p, "Y3", CRYSTALS[2].x, CRYSTALS[2].z - 2.1, 0.6);
  for (const [i, [x, z]] of CORE_INDUCTORS.entries()) silk(p, `L${i + 1}`, x, z + 2.1, 0.55);
  silkCorners(p, SOC.x - SOC.size / 2 - 0.4, SOC.z - SOC.size / 2 - 0.4, SOC.size + 0.8, SOC.size + 0.8, 2);
  silkCorners(p, RP1.x - RP1.size / 2 - 0.3, RP1.z - RP1.size / 2 - 0.3, RP1.size + 0.6, RP1.size + 0.6, 1.5);
  silkCorners(p, RAM.x - RAM.w / 2 - 0.3, RAM.z - RAM.d / 2 - 0.3, RAM.w + 0.6, RAM.d + 0.6, 1.5);
  for (const x of MIPI_X) silkBox(p, x - MIPI.w / 2 - 0.15, MIPI.z - MIPI.d / 2 - 0.15, MIPI.w + 0.3, MIPI.d + 0.3, 0.12);
  silkBox(p, POE.x - 2.7, POE.z - 2.7, 5.4, 5.4, 0.12);
  silk(p, "1", POE.x - 3.4, POE.z + 1.3, 0.6);
  for (const r of [[FAN_CONN.x - 1.75, FAN_CONN.z - 3.25, 3.5, 6.5], [BAT_CONN.x - 2.3, BAT_CONN.z - 1.75, 4.6, 3.5], [UART_CONN.x - 2.9, UART_CONN.z - 1.8, 5.8, 3.6]] as [number, number, number, number][])
    silkBox(p, ...r, 0.12);
  // Pin-1 dots for the small ICs.
  for (const [x, z] of [
    [PMIC.x - PMIC.size / 2 - 0.6, PMIC.z - PMIC.size / 2 - 0.6],
    [RP1.x - RP1.size / 2 - 0.9, RP1.z - RP1.size / 2 - 0.9],
    [BOOT_FLASH.x - 1.2, BOOT_FLASH.z - 1.7],
    [USB_SWITCH.x - 1.6, USB_SWITCH.z - 2.3],
  ] as Pt[])
    p.circle(x, z, 0.22, s.silk);
  // Small reference designators near some passives (where there is space).
  const refs = rng(9);
  const items = TOP_PASSIVES.c0402.slice(0, 160);
  for (let i = 0; i < items.length; i += 7) {
    const [x, z, r = 0] = items[i];
    const ox = Math.abs(((r % 180) + 180) % 180 - 90) < 1 ? 0.9 : 0;
    const oz = ox ? 0 : 0.75;
    const tx = x + ox;
    const tz = z + oz;
    if (blocked(tx, tz, 0.4)) continue;
    silk(p, `C${100 + Math.floor(refs() * 900)}`, tx, tz, 0.42, 0, "center", 600);
  }

  // Factory marks: date code, lot and a tiny data-matrix in the free area left of RP1.
  p.text("2023-08  REV 1.0", 64.0, 54.4, 0.62, s.silk, { align: "right", baseline: "middle", font: FONT_COND, weight: 700 });
}

/** QFN land pattern: perimeter pads and an exposed thermal pad with vias. */
function qfnLand(p: Painter, x: number, z: number, size: number, perSide: number, deg: number) {
  const s = PI_SURF;
  p.c.save();
  p.m.save();
  p.hgt.save();
  for (const ctx of [p.c, p.m, p.hgt]) {
    ctx.translate(x, z);
    ctx.rotate((deg * Math.PI) / 180);
  }
  const pitch = (size * 0.8) / perSide;
  for (let i = 0; i < perSide; i++) {
    const o = -size * 0.4 + pitch * (i + 0.5);
    p.rect(o - 0.12, -size / 2 - 0.1, 0.24, 0.6, s.tin);
    p.rect(o - 0.12, size / 2 - 0.5, 0.24, 0.6, s.tin);
    p.rect(-size / 2 - 0.1, o - 0.12, 0.6, 0.24, s.tin);
    p.rect(size / 2 - 0.5, o - 0.12, 0.6, 0.24, s.tin);
  }
  const ep = size * 0.62;
  p.rect(-ep / 2, -ep / 2, ep, ep, s.tin);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) p.circle(-ep / 3 + i * (ep / 3), -ep / 3 + j * (ep / 3), 0.15, s.hole);
  p.c.restore();
  p.m.restore();
  p.hgt.restore();
}


// ---------------------------------------------------------------------------
// Bottom side
// ---------------------------------------------------------------------------

function paintBottom(p: Painter) {
  const s = PI_SURF;
  const rand = rng(17);
  p.roundRect(0.45, 0.45, PCB.w - 0.9, PCB.d - 0.9, 2.6, s.copper);
  p.roundRect(-1, 6.6, 7.6, 13.9, 0.8, GAP);

  const R = new Router();
  // SD card bus from the slot to the SoC (it runs on the underside).
  R.bus([MICROSD.socketW + 0.3, MICROSD.z], [SOC.x - SOC.size / 2, SOC.z - 2], spread(6, 0.4), true, 0.1, 0.07);
  for (let i = 0; i < 60; i++) {
    const ax = 2 + rand() * 81;
    const ay = 2 + rand() * 52;
    const ang = Math.floor(rand() * 8) * (Math.PI / 4);
    const len = 2 + rand() * 7;
    const bx = Math.min(83, Math.max(2, ax + Math.cos(ang) * len));
    const by = Math.min(54, Math.max(2, ay + Math.sin(ang) * len));
    for (let k = 0; k < 1 + Math.floor(rand() * 3); k++) R.add(octilinear(ax + k * 0.3, ay, bx + k * 0.3, by, rand() > 0.5), 0.1, 0.07);
  }
  R.paint(p);

  // microSD socket footprint: contact pads and shell tabs.
  for (let k = 0; k < 8; k++) p.rect(MICROSD.socketW - 2.4, MICROSD.z - 3.8 + k * 1.1 - 0.3, 1.4, 0.6, s.gold);
  for (const dz of [-1, 1]) p.rect(1.0, MICROSD.z + dz * (MICROSD.socketD / 2 + 0.2) - 0.6, 2.4, 1.2, s.gold);
  for (const dz of [-1, 1]) p.rect(MICROSD.socketW - 1.2, MICROSD.z + dz * (MICROSD.socketD / 2 + 0.2) - 0.6, 1.6, 1.2, s.gold);

  // Through-hole pads (headers, ports, mounting holes).
  for (let c = 0; c < GPIO.cols; c++) {
    for (const zz of [GPIO.z - GPIO.pitch / 2, GPIO.z + GPIO.pitch / 2]) {
      pth(p, GPIO.x + (c - (GPIO.cols - 1) / 2) * GPIO.pitch, zz, 0.5, 0.38, c === 0 && zz > GPIO.z);
    }
  }
  for (const dx of [-1.27, 1.27]) for (const dz of [-1.27, 1.27]) pth(p, POE.x + dx, POE.z + dz, 0.5, 0.38);
  for (const [x, z] of J2_PADS) pth(p, x, z, 0.5, 0.36);
  for (const zc of [USB2.z, USB3.z]) {
    for (let k = 0; k < 9; k++) pth(p, USB_STACK.x0 + 1.4 + (k % 2) * 1.6, zc - 4 + k, 0.35, 0.28);
    for (const [dx, dz] of [
      [3.6, -6.9],
      [3.6, 6.9],
      [13.6, -6.9],
      [13.6, 6.9],
    ])
      pth(p, USB_STACK.x0 + dx, zc + dz, 0.6, 0.4);
  }
  for (let k = 0; k < 10; k++) pth(p, ETH.x0 + 2.0 + (k % 2) * 1.6, ETH.z - 4.6 + k * 1.02, 0.4, 0.28);
  for (const dz of [-6.9, 6.9]) pth(p, ETH.x0 + 9.5, ETH.z + dz, 0.75, 0.45);
  for (const dz of [-5.7, 5.7]) p.circle(ETH.x0 + 14.3, ETH.z + dz, 1.6, s.hole);
  for (const x of HDMI_X) for (const dx of [-3.6, 3.6]) pth(p, x + dx, 53.6, 0.4, 0.3);
  for (const dx of [-4.3, 4.3]) for (const z of [51.2, 54.6]) pth(p, USBC.x + dx, z, 0.35, 0.3);
  for (const [x, z] of MOUNT_HOLES) {
    p.circle(x, z, 3.2, GAP);
    p.circle(x, z, 2.95, s.gold);
  }
  for (const [x, z] of COOLER_HOLES) p.circle(x, z, COOLER_HOLE_R + 0.5, s.gold);

  paintPassivePads(p, BOTTOM_PASSIVES);

  // Production test points: a field of gold pads with tiny labels.
  const tps: Pt[] = [];
  for (let i = 0; i < 260 && tps.length < 70; i++) {
    const x = 3 + rand() * 79;
    const z = 3 + rand() * 50;
    if (blocked(x, z, 0.4, BOTTOM_KEEP_OUT)) continue;
    if (tps.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 2.2)) continue;
    tps.push([x, z]);
  }
  tps.forEach(([x, z], i) => {
    testPad(p, x, z, 0.5);
    silk(p, `TP${i + 1}`, x, z + 1.05, 0.48, 0, "center", 600);
  });

  stitch(p, 2.2, 23, BOTTOM_KEEP_OUT);

  // Silkscreen identity and a serial label.
  p.text("Raspberry Pi 5", 46.0, 31.0, 2.6, s.silk, { align: "center", baseline: "middle", font: FONT_SANS, weight: 800 });
  p.text("Model B · Rev 1.0 · 8 GB", 46.0, 34.2, 1.0, s.silk, { align: "center", baseline: "middle", font: FONT_SANS, weight: 600 });
  p.text("Designed and made in the UK", 46.0, 36.0, 0.9, s.silk, { align: "center", baseline: "middle", font: FONT_SANS, weight: 600 });
  const lx = 33;
  const lz = 39.5;
  p.roundRect(lx, lz, 26, 7.5, 0.4, { color: "#f2f1ea", rough: 0.6, metal: 0, height: 0.72 });
  const ink: Surface = { color: "#141414", rough: 0.6, metal: 0, height: 0.73 };
  // Data-matrix style code.
  const cr = rng(77);
  const cell = 0.36;
  for (let i = 0; i < 16; i++)
    for (let j = 0; j < 16; j++) {
      const edge = i === 0 || j === 15;
      const dash = (i === 15 && j % 2 === 0) || (j === 0 && i % 2 === 1);
      if (edge || dash || cr() > 0.52) p.rect(lx + 0.9 + i * cell, lz + 0.9 + j * cell, cell, cell, ink);
    }
  // The bottom canvas is mirrored, so "right" alignment makes text run toward +x on the board.
  const lt = { font: FONT_COND, weight: 700, baseline: "middle" as const, align: "right" as const };
  p.text("S/N 9C4E 51A7 02", lx + 8, lz + 2.3, 1.1, ink, lt);
  p.text("RPI5-8GB  2341", lx + 8, lz + 4.2, 1.1, ink, lt);
  p.text("MAC 00:00:5E:00:53:2A", lx + 8, lz + 6.0, 0.95, ink, { ...lt, weight: 600 });
}

/** Underside keep-outs for test points and vias. */
const BOTTOM_KEEP_OUT: [number, number, number, number][] = [
  [0, 20.5, 15.4, 15], // microSD socket
  [6.6, 0.5, 51.8, 6], // GPIO pins
  [58.6, 43.6, 5.8, 5.8], // PoE pins
  [69.5, 1, 16, 34], // USB pins
  [66, 37, 20, 18], // Ethernet pins
  [SOC.x - 7, SOC.z - 7, 14, 14],
  [RP1.x - 4.5, RP1.z - 4.5, 9, 9],
  [30, 29, 32, 18.6], // silkscreen block & label
  ...MOUNT_HOLES.map(([x, z]): [number, number, number, number] => [x - 3.4, z - 3.4, 6.8, 6.8]),
  ...COOLER_HOLES.map(([x, z]): [number, number, number, number] => [x - 2.4, z - 2.4, 4.8, 4.8]),
];

// ---------------------------------------------------------------------------
// Geometry & materials
// ---------------------------------------------------------------------------

const BOUNDS: FlatBounds = { minX: -PCB.w / 2, minY: -PCB.d / 2, w: PCB.w, h: PCB.d };

function boardShape() {
  const s = roundedRectShape(-PCB.w / 2, -PCB.d / 2, PCB.w, PCB.d, PCB.r);
  for (const [x, z] of MOUNT_HOLES) s.holes.push(circlePath(wx(x), wz(z), MOUNT_HOLE_R));
  for (const [x, z] of COOLER_HOLES) s.holes.push(circlePath(wx(x), wz(z), COOLER_HOLE_R));
  return s;
}

/** Texture resolution: 30 px/mm keeps 0.1 mm traces crisp in close-ups (2550 × 1680). */
const PPM_TOP = 30;
const PPM_BOTTOM = 14;

let boardCache: ReturnType<typeof buildBoard> | null = null;

function buildBoard() {
  const shape = boardShape();
  const material = (maps: ReturnType<typeof painted>) =>
    new MeshPhysicalMaterial({
      map: maps.map,
      roughnessMap: maps.rmMap,
      metalnessMap: maps.rmMap,
      bumpMap: maps.bumpMap,
      bumpScale: 0.9,
      roughness: 1,
      metalness: 1,
      clearcoat: 0.55,
      clearcoatRoughness: 0.32,
    });
  const top = painted("pi5-pcb:top", PCB.w, PCB.d, PPM_TOP, PI_SURF.mask, paintTop, { anisotropy: 16 });
  const bottom = painted("pi5-pcb:bottom", PCB.w, PCB.d, PPM_BOTTOM, PI_SURF.mask, (p) => {
    // Seen from below: mirror so drawing coordinates land under the same spot
    // and text still reads correctly.
    p.mirrorText = true;
    for (const ctx of [p.c, p.m, p.hgt]) {
      ctx.translate(PCB.w, 0);
      ctx.scale(-1, 1);
    }
    paintBottom(p);
  });
  return {
    topGeo: flatFace(shape, BOUNDS, false, 12),
    bottomGeo: flatFace(shape, BOUNDS, true, 12),
    wallGeo: extrudedWalls(shape, PCB.t, 12),
    topMat: material(top),
    bottomMat: material(bottom),
    edgeMat: variant("pi5-fr4", MAT.fr4, { color: "#6a7445", roughness: 0.7 }),
  };
}

/** The bare printed circuit board: painted top/bottom faces and FR-4 edges. */
export function PiBoard() {
  const b = useMemo(() => (boardCache ??= buildBoard()), []);
  return (
    <group>
      <mesh geometry={b.topGeo} material={b.topMat} receiveShadow castShadow />
      <mesh geometry={b.bottomGeo} material={b.bottomMat} position-y={-PCB.t} receiveShadow />
      <mesh geometry={b.wallGeo} material={b.edgeMat} receiveShadow castShadow />
    </group>
  );
}
