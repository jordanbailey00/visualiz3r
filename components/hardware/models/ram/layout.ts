/**
 * Shared dimensions for the DDR5 desktop memory module (mm).
 *
 * The module stands upright on its edge connector, as it would in a
 * motherboard slot. X runs along the module (pin 1 at −X seen from the front),
 * Y is up (the lowest point of the contact edge touches y = 0) and Z is the
 * thickness axis: the front face — rank 0 and the PMIC — looks toward +Z.
 *
 * Board figures follow the JEDEC 288-pin DDR5 UDIMM outline (MO-329):
 * 133.35 × 31.25 × 1.27 mm, 0.85 mm contact pitch, 75 contacts left of the key
 * and 69 right of it, the key 1.425 mm right of centre.
 */

export const PCB = {
  length: 133.35,
  height: 31.25,
  thickness: 1.27,
  /** The contact edge rises by 0.5 mm toward both ends (lower insertion force). */
  edgeRise: 0.5,
  /** |x| where the rise starts and where it is complete. */
  edgeTaper: [22.5, 34] as [number, number],
  /** Polarisation key (notch) in the contact edge. */
  key: { x: 1.425, width: 1.5, depth: 3.85 },
  /** Latch notches on both short edges: [bottom, top] heights above the edge. */
  sideNotches: [
    [8.0, 11.0],
    [14.6, 17.6],
  ] as [number, number][],
  sideNotchDepth: 1.9,
  /** Chamfer on every board edge (the contact edge most visibly). */
  bevel: 0.2,
};

export const HALF_L = PCB.length / 2;
/** Half the board thickness: the front copper is at +T2, the back at −T2. */
export const T2 = PCB.thickness / 2;

/** Gold contacts: 144 per side. */
export const PINS = {
  pitch: 0.85,
  /** Pad width / top edge / gap above the board edge. */
  padW: 0.6,
  padTop: 2.85,
  padGap: 0.25,
};

/** X of contact i (0…143, front view; the back mirrors it, pin 145 behind pin 1). */
export function pinX(i: number) {
  return i < 75 ? -63.325 + i * PINS.pitch : 5.525 + (i - 75) * PINS.pitch;
}

/** Height of the contact edge at x (0 in the middle, rising to 0.5 at the ends). */
export function edgeY(x: number) {
  const a = Math.abs(x);
  const [t0, t1] = PCB.edgeTaper;
  if (a <= t0) return 0;
  if (a >= t1) return PCB.edgeRise;
  return ((a - t0) / (t1 - t0)) * PCB.edgeRise;
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

/**
 * 16 Gbit x8 DDR5 SDRAM in an 82-ball FBGA (9 × 11 mm, 0.8 mm ball pitch).
 * Eight per side: four for sub-channel A (left half), four for B (right half).
 */
export const DRAM = {
  w: 9.0,
  h: 11.0,
  /** Organic substrate and moulded body thickness. */
  substrate: 0.21,
  mold: 0.68,
  /** Solder-ball standoff between board and package. */
  standoff: 0.26,
  y: 12.6,
  xs: [-56.5, -43, -29.5, -16, 16, 29.5, 43, 56.5],
};
/** Height of a DRAM package top above the board surface. */
export const DRAM_TOP = DRAM.standoff + DRAM.substrate + DRAM.mold;

/** Index into DRAM.xs of the front chip that is opened up in the exploded view. */
export const OPEN_CHIP = 2;

/** On-module power: PMIC, its three buck inductors and capacitors (front, centre). */
export const PMIC = { x: -2.2, y: 14.6, size: 3.5, t: 0.85 };
export const INDUCTORS: { x: number; y: number; w: number; h: number; t: number; rot: boolean; label: string }[] = [
  { x: -8.4, y: 16.1, w: 2.5, h: 2.0, t: 1.2, rot: false, label: "R47" },
  { x: -8.4, y: 12.9, w: 2.5, h: 2.0, t: 1.2, rot: false, label: "R47" },
  { x: 3.0, y: 18.4, w: 2.0, h: 1.6, t: 1.0, rot: false, label: "1R0" },
];
export const SPD_HUB = { x: -12.6, y: 9.4, w: 2.0, h: 2.0, t: 0.55 };
export const RGB_MCU = { x: 7.6, y: 25.4, size: 3.0, t: 0.8 };

// ---------------------------------------------------------------------------
// Heat spreader and light bar
// ---------------------------------------------------------------------------

export const HS = {
  x0: -64.6,
  x1: 64.6,
  y0: 5.5,
  y1: 38.5,
  /** Inner face of each half (|z|), plate thickness and raised relief. */
  inner: 2.4,
  plate: 0.8,
  relief: 1.0,
};

/** Thermal interface tape between the chips and each heat-spreader half. */
export const PAD = { x0: -62.2, x1: 62.2, y0: 6.1, y1: 19.6 };

export const LIGHT = {
  /** Diffuser: frosted bar sitting between the halves, standing proud above them. */
  x0: -63.2,
  x1: 63.2,
  y0: 33.7,
  y1: 43.4,
  halfZ: 2.15,
  /** Small LED board resting on the PCB's top edge. */
  stripT: 0.8,
  leds: 12,
};
