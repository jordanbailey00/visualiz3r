/**
 * Shared dimensions for the 3.5-inch hard disk drive (mm), after the SFF-8301
 * form factor (147 × 101.6 × 26.1 mm, 6-32 UNC mounting holes).
 *
 * The drive lies label-up on the floor. X runs along its length: the front
 * end at −X, the connector end (SATA ports) at +X. Z runs across it. Seen from
 * above, the platters sit toward the front and spin counter-clockwise; the
 * actuator pivots near the connector end, its voice-coil motor fills the
 * (+X, +Z) corner, and the heads park on a ramp at the disks' (+X, −Z) edge.
 */

export const DRIVE = {
  length: 147,
  width: 101.6,
  height: 26.1,
  halfL: 73.5,
  halfW: 50.8,
  /** Outer corner radius of the casting. */
  cornerR: 3,
};

/** Absolute heights (Y) of the drive's layers. */
export const Y = {
  /** Controller board, recessed into the underside of the casting. */
  pcbBottom: 0.9,
  pcbTop: 1.9,
  /** Ceiling of the board recess (underside of the floor). */
  recess: 3.7,
  /** Top of the casting floor inside the sealed enclosure. */
  floor: 5.0,
  /** Machined top face of the walls. */
  wallTop: 25.0,
  gasketTop: 25.2,
  coverTop: 26.0,
  labelTop: 26.1,
};

/** Inner faces of the casting walls (the sealed cavity). */
export const CAVITY = { x0: -71.0, x1: 70.8, z0: -48.4, z1: 48.4, r: 5 };

/**
 * Pocket under the rear wall that holds the SATA connectors: open to the rear
 * and to the bottom, with the interior floor raised above it.
 */
export const POCKET = { x0: 62.5, z0: -32, z1: 7, top: 8.0, shelf: 9.5, step: 61.0 };

/** Spindle axis. */
export const SPINDLE = { x: -22, z: 0 };

/** 95 mm platters: aluminium substrate, 1.27 mm thick, 25 mm centre hole. */
export const DISK = {
  r: 47.5,
  ri: 12.5,
  t: 1.27,
  count: 5,
  /** Vertical spacing between platters (spacer thickness + platter). */
  pitch: 3.72,
  /** Height of the clear gap between neighbouring platters. */
  gap: 2.45,
  /** Underside of the lowest platter (top of the hub flange). */
  bottom: 7.0,
  /** Data zone: inner and outer recording radius. */
  dataIn: 18.5,
  dataOut: 45.8,
};

export const diskBottom = (i: number) => DISK.bottom + i * DISK.pitch;
export const diskTop = (i: number) => diskBottom(i) + DISK.t;

/** Hub (rotor) of the spindle motor; the disks slide over it. */
export const HUB = { r: DISK.ri, flangeR: 15.6, flangeBottom: 5.6, top: diskTop(DISK.count - 1) + 0.25 };

/** Spacer rings between platters. */
export const SPACER = { ri: DISK.ri, ro: 15.6 };

/** Disk clamp: spring-steel ring pressed onto the top platter by 6 screws. */
export const CLAMP = { ro: 16.2, screwR: 8.2, screws: 6, top: diskTop(DISK.count - 1) + 0.95 };

// ---------------------------------------------------------------------------
// Actuator (head stack assembly)
// ---------------------------------------------------------------------------

export const PIVOT = { x: 35.8, z: 4.8 };

export const ACT = {
  /** Pivot axis → read/write element of each head. */
  reach: 47.5,
  /** Pivot axis → tip of the lift tab that rides up the ramp. */
  tab: 50.2,
  /** Pivot axis → swage hole at the tip of each arm. */
  swage: 32.5,
  armT: 0.8,
  /** Coil sector (pivot-centred radii) and half-angle. */
  coilIn: 11,
  coilOut: 31,
  coilHalf: (22 * Math.PI) / 180,
  coilBottom: 10.6,
  coilTop: 15.4,
  /** E-block bore (pivot cartridge sleeve fits inside). */
  boreR: 5.6,
  bodyR: 8.2,
  bottom: 5.5,
  top: diskTop(DISK.count - 1) + 1.45,
};

/** Arm centre heights: one below the stack, one between each pair of disks, one on top. */
export const ARM_Y: number[] = [
  diskBottom(0) - 1.1,
  ...[0, 1, 2, 3].map((i) => diskTop(i) + DISK.gap / 2),
  diskTop(DISK.count - 1) + 1.05,
];

/**
 * One head per recording surface: `up` heads read the underside of the disk
 * above their arm, `down` heads the top of the disk below.
 */
export const HEADS: { arm: number; up: boolean; surface: number }[] = [];
ARM_Y.forEach((_, a) => {
  if (a > 0) HEADS.push({ arm: a, up: false, surface: diskTop(a - 1) });
  if (a < DISK.count) HEADS.push({ arm: a, up: true, surface: diskBottom(a) });
});

const PS = { x: SPINDLE.x - PIVOT.x, z: SPINDLE.z - PIVOT.z };
/** Distance between the pivot and the spindle axes. */
export const PIVOT_TO_SPINDLE = Math.hypot(PS.x, PS.z);
const BETA = Math.atan2(PS.z, PS.x);

/**
 * Actuator angle (radians: direction from pivot to head in the XZ plane, with
 * x = cos, z = sin) that puts the heads over disk radius `r`.
 */
export function armAngle(r: number) {
  const d = PIVOT_TO_SPINDLE;
  const l = ACT.reach;
  const c = (d * d + l * l - r * r) / (2 * d * l);
  return BETA + Math.acos(Math.min(1, Math.max(-1, c)));
}

const deg = (d: number) => (d * Math.PI) / 180;

export const ALPHA = {
  id: armAngle(DISK.dataIn),
  od: armAngle(DISK.dataOut),
  /** Parked: lift tabs resting in the ramp's detent, heads off the disks. */
  park: deg(-114),
  /** Lift-tab positions spanned by the ramp (tip over the disk → park end). */
  rampTip: deg(-124.3),
  rampEnd: deg(-110.8),
};

/** Point at `dist` from the pivot along actuator angle `a`. */
export function fromPivot(a: number, dist: number): [number, number] {
  return [PIVOT.x + Math.cos(a) * dist, PIVOT.z + Math.sin(a) * dist];
}

/** Voice-coil motor magnets: pivot-centred sector covering the coil's swing. */
export const VCM = {
  a0: deg(-4),
  a1: deg(91),
  rIn: 10.2,
  rOut: 32.5,
  plateA0: deg(-15),
  plateA1: deg(104),
  plateIn: 8.9,
  plateOut: 34.5,
  bottomPlate: [Y.floor, 7.2] as [number, number],
  bottomMagnet: [7.2, 10.0] as [number, number],
  topMagnet: [16.0, 18.8] as [number, number],
  topPlate: [18.8, 21.0] as [number, number],
  /** Crash-stop posts (pivot-centred angle, radius). */
  stops: [
    { a: deg(-10.5), r: 21 },
    { a: deg(99.5), r: 21 },
  ],
};

/** Flex-cable bracket: where the head-stack flex passes through the floor to the board. */
export const BRACKET = { x: 55, z: -8, w: 11.5, d: 6.5 };

/** Recirculation filter (in a slot of the disk shroud) and breather filter. */
export const RECIRC = { theta: deg(141) };
export const BREATHER = { x: 50, z: -37 };

/** Cover screws: perimeter, plus the spindle shaft and pivot shaft. */
export const COVER_SCREWS: [number, number][] = [
  [-68.6, -45.6],
  [-68.6, 45.6],
  [68.3, -45.4],
  [68.3, 45.4],
  [8, 46.0],
  [30, -46.0],
];

/** SFF-8301 bottom holes (A4/A5/A6/A7/A13) and side holes (A8/A9/A10). */
export const BOTTOM_HOLES: [number, number][] = [32.22, -12.23, -43.98].flatMap((x) => [
  [x, -47.62] as [number, number],
  [x, 47.62] as [number, number],
]);
export const SIDE_HOLES = { xs: [45.0, -56.6], y: 6.35 };

/** SATA connectors on the board's rear tongue (centre z, width). */
export const SATA = {
  power: { z: -19, w: 22.2 },
  data: { z: -0.4, w: 11.2 },
};

/** Controller-board outline limits. */
export const PCB = { x0: -12.0, x1: 70.3, tongueX: 73.2, z0: -47.6, z1: 47.6, notchR: 17.6 };

/** Heights of the voice-coil motor parts in one place for the explode logic. */
export const STACK_TOP = CLAMP.top;
