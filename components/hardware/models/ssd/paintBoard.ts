import { FONT_COND, FONT_SANS, rng, type Painter, type Surface } from "@/lib/three/painter";
import { bgaFanout, bgaLand, silk, smdPads, stitchRow, viaField, type PcbSurfaces } from "@/lib/three/pcbPaint";
import type { SmdItem } from "../../kit/Passives";
import {
  CRYSTAL,
  CTRL,
  DRAM,
  INDUCTOR,
  INDUCTORS,
  KEY_M,
  MB,
  MOUNT,
  M2,
  NANDS,
  NAND_PKG,
  PINS,
  PMIC,
  SOCKET,
  STANDOFF_X,
  TEST_POINTS,
  TOP_PINS,
  TSENSOR,
  BOTTOM_PINS,
  pinZ,
} from "./layout";
import { AC_CAPS, PCIE_PAIRS, SSD_PASSIVES } from "./passives";

type Pt = [number, number];

/** SMD footprint sizes (length × width, mm). */
const SMD_DIMS = {
  "0201": [0.6, 0.3],
  "0402": [1.0, 0.5],
  "0603": [1.6, 0.8],
  "0805": [2.0, 1.25],
} as const;

/** Offset an open polyline sideways by `d` (positive = left of travel), mitred. */
export function offsetLine(pts: Pt[], d: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    let nx = 0;
    let ny = 0;
    const seg = (a: Pt, b: Pt) => {
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const l = Math.hypot(dx, dy) || 1;
      return [-dy / l, dx / l] as Pt;
    };
    const n0 = i > 0 ? seg(pts[i - 1], pts[i]) : null;
    const n1 = i < pts.length - 1 ? seg(pts[i], pts[i + 1]) : null;
    for (const n of [n0, n1]) if (n) ((nx += n[0]), (ny += n[1]));
    const l = Math.hypot(nx, ny) || 1;
    nx /= l;
    ny /= l;
    const ref = n0 ?? n1!;
    const k = 1 / Math.max(0.5, ref[0] * nx + ref[1] * ny);
    out.push([pts[i][0] + nx * d * k, pts[i][1] + ny * d * k]);
  }
  return out;
}

/** Silkscreen corner brackets around a footprint, with a pin-1 dot. */
function cornerMarks(p: Painter, s: PcbSurfaces, x: number, z: number, w: number, d: number, len = 1.2, line = 0.12) {
  const x0 = x - w / 2;
  const x1 = x + w / 2;
  const z0 = z - d / 2;
  const z1 = z + d / 2;
  for (const [cx, cz, sx, sz] of [
    [x0, z0, 1, 1],
    [x1, z0, -1, 1],
    [x0, z1, 1, -1],
    [x1, z1, -1, -1],
  ] as const) {
    p.polyline(
      [
        [cx + sx * len, cz],
        [cx, cz],
        [cx, cz + sz * len],
      ],
      line,
      s.silk,
    );
  }
  p.circle(x0 - 0.35, z0 - 0.35, 0.16, s.silk);
}

function padsFor(p: Painter, s: PcbSurfaces, items: SmdItem[], size: keyof typeof SMD_DIMS, surface: Surface) {
  const [l, w] = SMD_DIMS[size];
  for (const [x, z, r = 0] of items) smdPads(p, s, x, z, l * 1.15, w * 1.05, r, surface);
}

/** QFN land: perimeter pads + exposed thermal pad with vias. */
function qfnLand(p: Painter, s: PcbSurfaces, x: number, z: number, w: number, d: number, pins: number, surface: Surface) {
  const pitchX = (w * 0.8) / pins;
  const pitchZ = (d * 0.8) / pins;
  for (let i = 0; i < pins; i++) {
    const ox = x - w * 0.4 + pitchX * (i + 0.5);
    const oz = z - d * 0.4 + pitchZ * (i + 0.5);
    p.rect(ox - 0.13, z - d / 2 - 0.15, 0.26, 0.6, surface);
    p.rect(ox - 0.13, z + d / 2 - 0.45, 0.26, 0.6, surface);
    p.rect(x - w / 2 - 0.15, oz - 0.13, 0.6, 0.26, surface);
    p.rect(x + w / 2 - 0.45, oz - 0.13, 0.6, 0.26, surface);
  }
  const ep = Math.min(w, d) * 0.6;
  p.rect(x - ep / 2, z - ep / 2, ep, ep, surface);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) p.circle(x + (i - 1) * ep * 0.32, z + (j - 1) * ep * 0.32, 0.11, s.hole);
}

/** Kinds of the top-side (odd) contacts of an M-key PCIe module. */
const TOP_GND = new Set([1, 3, 9, 15, 21, 27, 33, 39, 45, 51, 57, 71, 73, 75]);
/** Bottom-side (even) contacts: 3.3 V supply pins and used sideband signals. */
const BOT_3V3 = new Set([2, 4, 12, 14, 16, 18, 70, 72, 74]);
const BOT_SIGNAL = new Set([10, 40, 42, 44, 50, 52, 54, 68]);

const DARK_LAMINATE: Surface = { color: "#23241d", rough: 0.7, metal: 0, height: 0.22 };

// ---------------------------------------------------------------------------
// SSD — top side
// ---------------------------------------------------------------------------

export function paintSsdTop(p: Painter, s: PcbSurfaces) {
  const gold = s.gold;
  const rand = rng(41);

  // --- Ground pour with power islands cut into it -------------------------
  p.roundRect(-36.75, -10.62, 76.2, 21.24, 0.6, s.copper);
  // Island for the controller core rail (around the inductors).
  const island = (pts: Pt[]) => {
    p.polyline([...pts, pts[0]], 0.24, s.mask);
  };
  island([
    [-30.6, -10.62],
    [-16.6, -10.62],
    [-16.6, -6.35],
    [-29.1, -6.35],
    [-30.6, -7.6],
  ]);
  // NAND VCC / VCCQ islands in the bands beside the packages.
  for (const sz of [-1, 1]) {
    island([
      [-4.8, sz * 8.1],
      [33.4, sz * 8.1],
      [33.4, sz * 10.62],
      [-4.8, sz * 10.62],
    ]);
  }
  // Mask-free laminate between the gold fingers.
  p.rect(-39.6, -11, 2.25, 22, DARK_LAMINATE);

  // --- Board-edge stitching vias -----------------------------------------
  stitchRow(p, s, [[-36.3, -10.32], [36.0, -10.32]], 1.25, 0.11);
  stitchRow(p, s, [[-36.3, 10.32], [36.0, 10.32]], 1.25, 0.11);

  // --- Random vias in the pour ---------------------------------------------
  viaField(p, s, -30, -10, 66, 20, 260, 7, 0.11);

  // --- Contacts: gold under the finger meshes, stubs into the board -------
  for (const n of TOP_PINS) {
    const z = pinZ(n);
    p.rect(-39.5, z - PINS.padW / 2, PINS.topLen, PINS.padW, gold);
    if (TOP_GND.has(n)) {
      p.polyline([[-37.6, z], [-36.6, z]], 0.3, s.copper);
      const vx = n === 73 || n === 3 ? -36.05 : -36.45;
      p.circle(vx, z, 0.2, s.copper);
      p.circle(vx, z, 0.1, s.via);
    }
  }

  // --- PCIe lanes: tightly coupled pairs from the fingers to the controller -
  const xj = -32.3;
  const xEnd = CTRL.x - CTRL.sub / 2 + 0.9;
  for (const pr of PCIE_PAIRS) {
    const drop = pr.z - pr.target;
    const center: Pt[] = [
      [-36.65, pr.z],
      [xj, pr.z],
      [xj + Math.abs(drop), pr.target],
      [xEnd, pr.target],
    ];
    // Clearance channel through the ground pour.
    p.polyline(center, 0.62, s.mask);
    p.polyline([[-37.6, pr.z], [-36.4, pr.z]], 0.85, s.mask);
    for (const side of [1, -1]) {
      const pinZv = pr.z + side * 0.25;
      const lane = offsetLine(center, side * 0.12);
      p.polyline([[-37.6, pinZv], [-36.95, pinZv], [-36.65, pr.z + side * 0.12], ...lane.slice(1)], 0.09, s.copper);
    }
    // Pair terminates in the controller's ball field.
    p.circle(xEnd + 0.15, pr.target + 0.12, 0.13, s.via);
    p.circle(xEnd + 0.15, pr.target - 0.12, 0.13, s.via);
  }
  padsFor(p, s, AC_CAPS, "0201", gold);

  // --- Controller land pattern & fan-out -------------------------------------
  bgaFanout(p, s, CTRL.x, CTRL.z, 17, 17, CTRL.ballPitch);
  bgaLand(p, s, CTRL.x, CTRL.z, 17, 17, CTRL.ballPitch, 0.32, { surface: gold });
  cornerMarks(p, s, CTRL.x, CTRL.z, CTRL.sub + 0.7, CTRL.sub + 0.7, 1.6);
  silk(p, s, "U1", CTRL.x - CTRL.sub / 2 + 0.9, CTRL.z - CTRL.sub / 2 - 0.75, 0.75);

  // --- DRAM: land pattern, short bus to the controller ---------------------
  for (let i = 0; i < 14; i++) {
    const z = -4.3 + i * 0.66 + (i % 2) * 0.05;
    const zz = Math.round((z + 0.3) / 1.2) * 1.2 - 0.3; // squeeze between the 0201 caps
    p.polyline(
      [
        [CTRL.x + CTRL.sub / 2 - 0.9, z],
        [-16.2, z],
        [-15.85, zz],
        [-15.15, zz],
        [-14.8, z],
        [DRAM.x - DRAM.w / 2 + 0.7, z],
      ],
      0.08,
      s.copper,
    );
  }
  bgaFanout(p, s, DRAM.x, DRAM.z, 9, 11, 0.8);
  bgaLand(p, s, DRAM.x, DRAM.z, 9, 11, 0.8, 0.38, { surface: gold });
  cornerMarks(p, s, DRAM.x, DRAM.z, DRAM.w + 0.6, DRAM.d + 0.6, 1.2);
  silk(p, s, "U2", DRAM.x - DRAM.w / 2 + 0.6, DRAM.z - DRAM.d / 2 - 0.7, 0.75);

  // --- NAND channel buses in the bands above and below the DRAM ----------
  for (const sz of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      const zBand = sz * (7.79 - i * 0.18);
      const xs = -19.8 + i * 0.2;
      const zTurn = zBand - sz * 0.4;
      const toSecond = i >= 5;
      const xDive = toSecond ? NANDS[1].x - 7.6 + (i - 5) * 1.1 : NANDS[0].x - 7.4 + i * 1.1;
      const zDive = sz * 4.9;
      p.polyline(
        [
          [xs, sz * 4.6],
          [xs, zTurn],
          [xs + 0.4, zBand],
          [xDive - Math.abs(zBand - zDive), zBand],
          [xDive, zDive],
        ],
        0.075,
        s.copper,
      );
      p.circle(xDive, zDive, 0.14, s.copper);
      p.circle(xDive, zDive, 0.07, s.via);
    }
  }

  // --- NAND packages -----------------------------------------------------------
  NANDS.forEach((n, i) => {
    bgaFanout(p, s, n.x, n.z, 17, 11, 1.0);
    bgaLand(p, s, n.x, n.z, 17, 11, 1.0, 0.45, { surface: gold, hollow: 5 });
    cornerMarks(p, s, n.x, n.z, NAND_PKG.w + 0.6, NAND_PKG.d + 0.6, 1.6);
    silk(p, s, `U${3 + i}`, n.x - NAND_PKG.w / 2 + 0.7, n.z - NAND_PKG.d / 2 - 0.75, 0.75);
  });

  // --- Power: PMIC, inductors, crystal, sensor -------------------------------
  qfnLand(p, s, PMIC.x, PMIC.z, PMIC.w, PMIC.d, 6, gold);
  cornerMarks(p, s, PMIC.x, PMIC.z, PMIC.w + 0.8, PMIC.d + 0.8, 0.8);
  silk(p, s, "U5", PMIC.x + PMIC.w / 2 + 0.2, PMIC.z + PMIC.d / 2 + 0.75, 0.7, 0, "left");
  INDUCTORS.forEach((l, i) => {
    // Wide copper from the PMIC switch node to each inductor.
    p.polyline([[PMIC.x + 1.2, PMIC.z - 1.4], [l.x - 0.8, -10.1], [l.x - 0.8, l.z]], 0.5, s.copper);
    for (const sx of [-1, 1]) p.rect(l.x + sx * 0.72 - 0.32, l.z - 0.78, 0.64, 1.56, gold);
    silk(p, s, `L${i + 1}`, l.x, l.z - INDUCTOR.d / 2 - 0.55, 0.6);
  });
  for (const [dx, dz] of [
    [-0.55, -0.42],
    [0.55, -0.42],
    [-0.55, 0.42],
    [0.55, 0.42],
  ])
    p.rect(CRYSTAL.x + dx - 0.33, CRYSTAL.z + dz - 0.28, 0.66, 0.56, gold);
  silk(p, s, "Y1", CRYSTAL.x + 1.6, CRYSTAL.z, 0.6, 0, "left");
  for (let i = 0; i < 3; i++)
    for (const sz of [-1, 1]) p.rect(TSENSOR.x - 0.5 + i * 0.5 - 0.12, TSENSOR.z + sz * 0.45 - 0.17, 0.24, 0.34, gold);
  silk(p, s, "TH1", TSENSOR.x, TSENSOR.z + 1.15, 0.55);

  // --- Passive footprints --------------------------------------------------
  const P = SSD_PASSIVES;
  padsFor(p, s, P.c0201, "0201", gold);
  padsFor(p, s, P.r0201, "0201", gold);
  padsFor(p, s, P.c0402, "0402", gold);
  padsFor(p, s, P.r0402, "0402", gold);
  padsFor(p, s, P.c0603, "0603", gold);
  padsFor(p, s, P.c0805, "0805", gold);
  // A few reference designators, as on a real (crowded) board.
  const des: [string, number, number][] = [
    ["C1", -34.6, 8.55],
    ["C2", -32.0, 8.55],
    ["C7", -35.35, -5.85],
    ["R3", -32.8, -4.35],
    ["C41", -15.5, -5.55],
    ["C58", -5.5, -4.75],
    ["C77", 14.5, -5.75],
  ];
  for (const [t, x, z] of des) silk(p, s, t, x, z, 0.45);

  // --- Test pads & fiducials -------------------------------------------------
  TEST_POINTS.forEach(([x, z], i) => {
    p.circle(x, z, 0.47, gold);
    silk(p, s, `TP${i + 1}`, x + (x > 36 ? -0.05 : 0.0), z + (z > 0 ? -0.75 : 0.75), 0.36);
  });
  for (const [x, z] of [
    [-35.4, -10.0],
    [37.6, 9.7],
    [37.6, -9.7],
  ] as Pt[]) {
    p.circle(x, z, 0.75, DARK_LAMINATE);
    p.circle(x, z, 0.32, gold);
  }

  // --- Mounting notch ground pad (Ø5.5 plated) with via ring -------------
  p.circle(MOUNT.x, 0, MOUNT.padTop + 0.25, s.mask);
  p.circle(MOUNT.x, 0, MOUNT.padTop, gold);
  for (let k = 0; k < 7; k++) {
    const a = Math.PI / 2 + (k / 6) * Math.PI;
    p.circle(MOUNT.x + Math.cos(a) * 2.25, Math.sin(a) * 2.25, 0.13, s.hole);
  }

  // --- Silkscreen ------------------------------------------------------------
  // Key designation required by the M.2 spec, to the right of the key.
  silk(p, s, "M", -35.6, KEY_M.z + 1.25, 1.05, 90);
  silk(p, s, "1", -36.15, pinZ(1), 0.5, 90);
  silk(p, s, "75", -36.15, pinZ(75) - 0.05, 0.5, 90);
  p.text("PCIe 4.0 ×4", -31.2, 0.1, 0.62, s.silk, { font: FONT_COND, weight: 700, rotate: 90, align: "center", baseline: "middle" });
  p.text("SSD-N4-2280  REV 1.0", 6.5, -7.25, 0.62, s.silk, { font: FONT_SANS, weight: 700, letterSpacing: 0.06 });
  p.text("94V-0  E347615  2431", 21, -7.25, 0.55, s.silk, { font: FONT_COND, weight: 600 });
  p.text("M.2 2280-S3-M", 36.25, 0, 0.7, s.silk, { font: FONT_SANS, weight: 800, rotate: 90, align: "center", baseline: "middle" });

  // A little routing texture in the end zone.
  for (let i = 0; i < 5; i++) {
    const z = -3.4 + i * 1.7 + rand() * 0.2;
    p.polyline([[33.75, z], [34.25, z + 0.3]], 0.08, s.copper);
  }
}

// ---------------------------------------------------------------------------
// SSD — bottom side (seen from below; Board mirrors it automatically)
// ---------------------------------------------------------------------------

export function paintSsdBottom(p: Painter, s: PcbSurfaces) {
  const gold = s.gold;
  p.roundRect(-36.5, -10.6, 76, 21.2, 0.6, s.copper);
  // 3.3 V plane near the connector, fed by the supply contacts.
  p.polygon(
    [
      [-36.5, 3.2],
      [-27, 3.2],
      [-24, 6.2],
      [-24, 10.6],
      [-36.5, 10.6],
    ],
    { ...s.copper, color: "#202227" },
  );
  p.rect(-39.6, -11, 2.75, 22, DARK_LAMINATE);
  for (const n of BOTTOM_PINS) {
    const z = pinZ(n);
    p.rect(-39.5, z - PINS.padW / 2, PINS.bottomLen, PINS.padW, gold);
    if (BOT_3V3.has(n) || BOT_SIGNAL.has(n)) p.polyline([[-37.1, z], [-36.3, z]], BOT_3V3.has(n) ? 0.32 : 0.12, s.copper);
  }
  viaField(p, s, -34, -10, 72, 20, 180, 3, 0.14);
  // Factory test pads behind the controller.
  for (let i = 0; i < 5; i++)
    for (let j = 0; j < 3; j++) p.circle(CTRL.x - 4 + i * 2, CTRL.z - 2 + j * 2, 0.45, gold);
  p.circle(MOUNT.x, 0, MOUNT.padBottom, gold);
  p.text("SSD-N4-2280", -14, -2.0, 2.0, s.silk, { font: FONT_SANS, weight: 800, letterSpacing: 0.2, baseline: "middle" });
  p.text("NVMe  PCIe 4.0 ×4  ·  2TB  ·  2431", -14, 1.6, 1.1, s.silk, { font: FONT_COND, weight: 600, baseline: "middle" });
}

// ---------------------------------------------------------------------------
// Motherboard patch around the M.2 slot (world coordinates)
// ---------------------------------------------------------------------------

const MB_MASK: Surface = { color: "#0f1114", rough: 0.6, metal: 0, height: 0.3 };
const MB_COPPER: Surface = { color: "#15181c", rough: 0.55, metal: 0.05, height: 0.55 };
const MB_SILK: Surface = { color: "#c9cdd2", rough: 0.75, metal: 0, height: 0.68 };

export function paintMotherboard(p: Painter, s: PcbSurfaces) {
  p.rect(MB.x0, MB.z0, MB.x1 - MB.x0, MB.z1 - MB.z0, MB_MASK);
  p.roundRect(MB.x0 + 0.8, MB.z0 + 0.8, MB.x1 - MB.x0 - 1.6, MB.z1 - MB.z0 - 1.6, 1, MB_COPPER);
  const cs = { ...s, copper: MB_COPPER, mask: MB_MASK, silk: MB_SILK };

  // PCIe lanes and sideband signals leaving the socket toward the CPU.
  for (let k = 0; k < 9; k++) {
    const z = -8 + k * 2;
    const c: Pt[] = [
      [SOCKET.back - 1.6, z * 0.5],
      [SOCKET.back - 3.5, z * 0.5],
      [SOCKET.back - 3.5 - Math.abs(z * 0.5 - z * 1.25), z * 1.25],
      [MB.x0, z * 1.25],
    ];
    p.polyline(c, 0.8, MB_MASK);
    for (const side of [1, -1]) p.polyline(offsetLine(c, side * 0.16), 0.13, MB_COPPER);
  }
  viaField(p, cs, MB.x0 + 2, MB.z0 + 2, MB.x1 - MB.x0 - 4, MB.z1 - MB.z0 - 4, 220, 17, 0.16);
  stitchRow(p, cs, [[MB.x0 + 1.4, MB.z0 + 1.4], [MB.x1 - 1.4, MB.z0 + 1.4]], 2.4, 0.15);
  stitchRow(p, cs, [[MB.x0 + 1.4, MB.z1 - 1.4], [MB.x1 - 1.4, MB.z1 - 1.4]], 2.4, 0.15);

  // Socket footprint: staggered tail pads behind the housing, hold-down pads.
  const tin = s.tin;
  for (let n = 1; n <= 75; n++) {
    if (n >= 59 && n <= 66) continue;
    const z = pinZ(n);
    const odd = n % 2 === 1;
    p.rect(odd ? SOCKET.back - 1.75 : SOCKET.back - 1.05, z - 0.11, 0.7, 0.22, tin);
  }
  for (const sz of [-1, 1]) p.rect(SOCKET.back + 0.6, sz * (SOCKET.halfW - 0.2) - 0.9, 3.8, 1.8, tin);

  // Mounting positions for 2242 / 2260 / 2280 modules.
  for (const [len, x] of Object.entries(STANDOFF_X)) {
    p.circle(x, 0, 3.25, tin);
    p.circle(x, 0, 2.1, s.hole);
    p.text(len, x, 4.6, 1.3, MB_SILK, { font: FONT_SANS, weight: 700, align: "center", baseline: "middle" });
  }
  // Module keep-out outline (dashed).
  for (let x = M2.x0 + 2; x < M2.x1 - 2; x += 2.4) {
    for (const z of [M2.z0 - 0.9, M2.z1 + 0.9]) p.polyline([[x, z], [x + 1.3, z]], 0.16, MB_SILK);
  }
  p.text("M2_1", SOCKET.back - 3.6, -13.3, 1.5, MB_SILK, { font: FONT_SANS, weight: 800 });
  p.text("SOCKET 3 · KEY M · PCIe 4.0 ×4", -33, -13.2, 1.0, MB_SILK, { font: FONT_COND, weight: 700 });
  p.text("NVMe ONLY", -33, 14.2, 0.95, MB_SILK, { font: FONT_COND, weight: 700 });
}
