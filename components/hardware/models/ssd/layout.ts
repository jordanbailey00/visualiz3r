/**
 * Shared dimensions for the M.2 2280 NVMe SSD (mm).
 *
 * The drive lies flat along X: the M-key edge connector is at −X, the
 * half-moon mounting notch at +X. Z runs across the 22 mm width. Board
 * coordinates put the PCB top surface at y = 0 (the whole drive group is
 * raised to `DRIVE_Y` in the world, where it sits in a motherboard slot).
 *
 * Card-edge numbers follow the PCI Express M.2 specification: 0.5 mm contact
 * pitch per side, the bottom row staggered by 0.25 mm, pin 1 on the right of
 * the top side when the connector faces you, key M = pins 59–66.
 */

type Vec3 = [number, number, number];

/** The module itself. */
export const M2 = {
  x0: -40,
  x1: 40,
  z0: -11,
  z1: 11,
  /** PCB thickness (0.8 ± 0.08 per spec). */
  t: 0.8,
  corner: 0.5,
  /** Length of the 20° lead-in chamfer on the connector edge. */
  bevel: 0.45,
};

/** Gold contacts of the card-edge connector. */
export const PINS = {
  pitch: 0.5,
  padW: 0.35,
  /** Top-side pads are 2.0 mm long, bottom-side pads 2.5 mm. */
  topLen: 2.0,
  bottomLen: 2.5,
  /** Card edge → leading edge of the pads (≤ 0.55 mm). */
  lead: 0.5,
};

/** Z of contact n in the top view (pin 1 toward +Z, pin 75 toward −Z). */
export const pinZ = (n: number) => (38 - n) * 0.25;

/** Contacts that exist on an M-key module (pins 59–66 are the notch). */
export const TOP_PINS = Array.from({ length: 38 }, (_, i) => 2 * i + 1).filter((n) => n < 59 || n > 66);
export const BOTTOM_PINS = Array.from({ length: 37 }, (_, i) => 2 * i + 2).filter((n) => n < 59 || n > 66);

/** The M key: a 1.2 mm slot with a full-radius end, 3.5 mm deep. */
export const KEY_M = { z: pinZ(62.5), w: 1.2, depth: 3.5 };

/** Half-moon notch for the retention screw and its plated ground pads. */
export const MOUNT = { x: 40, r: 1.75, padTop: 2.75, padBottom: 3.0 };

/** Component zone starts 4 mm from the card edge on the top side. */
export const TOP_ZONE_X = M2.x0 + 4;

// --- Components (board coordinates) ---------------------------------------

/** NVMe controller: FCBGA with a nickel-plated heat-spreader lid. */
export const CTRL = {
  x: -22.5,
  z: 0,
  sub: 12,
  subT: 0.36,
  die: [5.6, 0.25, 5.0] as Vec3,
  lid: 10.6,
  lidT: 0.22,
  ballPitch: 0.65,
};
/** FlipChip kit constants: ball standoff and the die stack-up. */
export const CTRL_SO = 0.45;
export const CTRL_DIE_TOP = CTRL_SO + CTRL.subT + 0.05 + CTRL.die[1];
export const CTRL_LID_TOP = CTRL_DIE_TOP + 0.03 + CTRL.lidT;

/** LPDDR4 DRAM cache (FBGA). */
export const DRAM = { x: -10.5, z: 0, w: 8, d: 10, h: 0.75, so: 0.25 };

/** NAND flash packages: 18 × 12 mm BGA, eight 1 Tb dies each. */
export const NAND_PKG = { w: 18, d: 12, h: 1.05, so: 0.25, subT: 0.21 };
export const NANDS: { x: number; z: number }[] = [
  { x: 4.5, z: 0 },
  { x: 24.5, z: 0 },
];

/** Die stack inside a NAND package (package-local coordinates). */
export const STACK = {
  dies: 8,
  dieW: 11,
  dieD: 6.2,
  dieT: 0.075,
  dafT: 0.015,
  /** Each die is set back by this much so the bond pads below stay exposed. */
  step: 0.36,
  /** Front (bond-pad) edge of the lowest die. */
  front0: 3.9,
  wiresPerDie: 14,
};
export const STACK_BASE = NAND_PKG.so + NAND_PKG.subT;
export const dieY = (k: number) => STACK_BASE + STACK.dafT + k * (STACK.dieT + STACK.dafT) + STACK.dieT / 2;
export const dieZ = (k: number) => STACK.front0 - k * STACK.step - STACK.dieD / 2;

/** Power-management IC beside the connector (fed from the 3.3 V pins). */
export const PMIC = { x: -32.6, z: -7.5, w: 4, d: 4, h: 0.75 };
/** 2016-size power inductors (2.0 × 1.6 × 1.0 mm), one per buck converter. */
export const INDUCTORS: { x: number; z: number; label: string }[] = [
  { x: -28.3, z: -9.0, label: "R47" },
  { x: -25.3, z: -9.0, label: "R47" },
  { x: -22.3, z: -9.0, label: "1R0" },
];
export const INDUCTOR = { w: 2.0, h: 1.0, d: 1.6 };
export const CRYSTAL = { x: -20.4, z: 8.3, w: 2.0, d: 1.6, h: 0.55 };
export const TSENSOR = { x: 14.5, z: 8.7, w: 1.6, d: 1.2, h: 0.5 };

/** Test pads used at the factory (programming, UART, ROM-mode strap). */
export const TEST_POINTS: [number, number][] = [
  [35.2, -9.0],
  [35.2, -7.4],
  [35.2, -5.8],
  [36.8, -8.2],
  [36.8, -6.6],
  [35.2, 5.8],
  [35.2, 7.4],
  [35.2, 9.0],
  [36.8, 6.6],
  [36.8, 8.2],
  [-28.5, 9.7],
  [-27.3, 9.7],
];

/** Sticker covering the components: printed film over a copper foil. */
export const LABEL = {
  x0: -29.4,
  x1: 34.1,
  z0: -10.75,
  z1: 10.75,
  copperT: 0.05,
  filmT: 0.07,
};
export const LABEL_Y = CTRL_LID_TOP + 0.01;

// --- Motherboard slot (world coordinates) ----------------------------------

export const MB = { x0: -49.5, x1: 46.5, z0: -15.5, z1: 15.5, t: 1.6 };
export const MB_TOP = MB.t;
/** Clearance under the module (single-sided module, top-mount socket). */
export const MODULE_GAP = 2.4;
/** World height of the drive's PCB top surface. */
export const DRIVE_Y = MB_TOP + MODULE_GAP + M2.t;

/** Top-mount M.2 socket (world coordinates). */
export const SOCKET = {
  back: -42.4,
  front: -36.4,
  halfW: 12.3,
  top: MB_TOP + 4.2,
  /** Slot opening (module bottom − 0.15 … module top + 0.15). */
  slotLow: MB_TOP + MODULE_GAP - 0.15,
  slotHigh: DRIVE_Y + 0.15,
  slotHalfW: 11.2,
  slotBack: -40.25,
};

/** Standoff positions for 2242 / 2260 / 2280 modules (x of the screw). */
export const STANDOFF_X = { "2242": 2, "2260": 20, "2280": 40 } as const;
export const STANDOFF = { r: 2.25, h: MODULE_GAP };

// --- Exploded-view choreography ---------------------------------------------

type Range = [number, number];
type Move = { range: Range; move?: Vec3; rotate?: Vec3 };

/** How far the module rises out of its slot when fully exploded. */
export const DRIVE_LIFT = 14;

/**
 * The deep dive into NAND package U4: it leaves the board, its mould cap
 * hinges open to show the die stack, a copy of the top die floats up and
 * grows into a labelled floorplan, and the highlighted erase block opens
 * into a 3D cut-away of the memory array with one string pulled out.
 * Targets (`at`) are world positions at full explode; the components work
 * out the local offsets from them.
 */
export const DEEP = {
  pkgLift: { range: [0.44, 0.58], move: [0, 8, 0] } as Move,
  pkgTravel: [0.54, 0.74] as Range,
  /** World position of the package origin (PCB surface under its centre). */
  pkgAt: [54, 28, -2] as Vec3,
  mold: {
    hinge: [0, NAND_PKG.so + NAND_PKG.h, -NAND_PKG.d / 2] as Vec3,
    rotate: [-1.95, 0, 0] as Vec3,
    explode: [0, 0.3, -0.2] as Vec3,
    range: [0.64, 0.8] as Range,
  },
  die: { range: [0.72, 0.9] as Range, mag: 3.2, at: [36, 56, -36] as Vec3, tilt: [0.8, 0.35, 0] as Vec3 },
  /** World position of the 3D block's origin (bottom of its front face). */
  block: { range: [0.86, 1] as Range, at: [-10, 62, -56] as Vec3, scale: 0.85 },
  /** The pulled-out string, in block coordinates (it starts as a front-row channel). */
  string: { from: [0, 0, 7.2] as Vec3, to: [27, 0, 8] as Vec3, range: [0.92, 1] as Range, scale: 1.5 },
};

/** U4's path in board coordinates: lift off its balls, then fly to `pkgAt`. */
export function packagePath(): Move[] {
  const n = NANDS[1];
  const lift = DEEP.pkgLift.move!;
  const travel: Vec3 = [
    DEEP.pkgAt[0] - n.x - lift[0],
    DEEP.pkgAt[1] - (DRIVE_Y + DRIVE_LIFT) - lift[1],
    DEEP.pkgAt[2] - n.z - lift[2],
  ];
  return [DEEP.pkgLift, { range: DEEP.pkgTravel, move: travel }];
}
