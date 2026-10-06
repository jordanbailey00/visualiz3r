/**
 * Shared dimensions for the processor model (mm).
 *
 * World axes: X to the right, Y up, Z toward the viewer. A square section of
 * motherboard lies flat with the CPU socket centred on the origin. The load
 * plate hinges at the back (−Z) and the load lever runs along the right (+X)
 * side, latching near the front. The gold pin-1 triangle sits front-left.
 *
 * Heights follow the real stack: backplate on the floor, insulator, board,
 * socket (package seating plane 2.23 mm above the board) and a lidded
 * package whose heat-spreader top ends 7.98 mm above the board.
 */

export type Vec3 = [number, number, number];
/** Rectangle on a surface: x, z of the top-left corner, width, depth. */
export type Rect = [x: number, z: number, w: number, d: number];

// --- Base ------------------------------------------------------------------

/** Stamped steel backplate under the board (the bottom-most part). */
export const BACKPLATE = { halfX: 33.5, halfZ: 53, t: 1.5, r: 6, windowX: 15, windowZ: 18 };
export const INSULATOR_T = 0.2;
export const BOARD = { half: 55, t: 1.6 };
/** Height of the motherboard's top surface. */
export const BOARD_TOP = BACKPLATE.t + INSULATOR_T + BOARD.t;

/** Cooler mounting holes: the 54 × 90 mm pattern shared with the previous socket. */
export const COOLER_HOLES: [number, number][] = [
  [-27, -45],
  [27, -45],
  [-27, 45],
  [27, 45],
];
/** Screws that clamp the retention frame through the board into the backplate. */
export const FRAME_SCREWS: [number, number][] = [
  [-21, -30.2],
  [21, -30.2],
  [-21, 30.2],
  [21, 30.2],
];

// --- Socket (socket-local: y = 0 is the board's top surface) ---------------

export const SOCKET = {
  /** Outer half-size of the black plastic housing. */
  half: 23,
  /** Underside (sits on its solder balls) and top of the housing walls. */
  bottom: 0.35,
  top: 3.75,
  /** Half-size of the cavity the package drops into. */
  cavity: 20.15,
  /** Top of the contact carrier floor. */
  floor: 1.45,
  /** Package seating plane when the springs are compressed. */
  seat: 2.23,
  /** Orientation keys on the left/right cavity walls (z position). */
  keyZ: -10,
};

/** Stamped stainless stiffener frame around the housing. */
export const FRAME = { halfX: 26.5, halfZ: 35, inner: 23.6, t: 1.2 };

/** Hinged load plate (force frame), closed pose. */
export const PLATE = {
  halfX: 22.4,
  back: -29.6,
  front: 27.6,
  /** Half-size of the window the heat-spreader plateau pokes through. */
  window: 17.2,
  /** Underside rests on the heat-spreader legs. */
  y: 5.13,
  t: 1.2,
  hinge: { y: 5.9, z: -30.5 },
  curlR: 1.5,
  curls: [
    [-14, -6.5],
    [6.5, 14],
  ] as [number, number][],
  /** Tab on the right that the lever presses down. */
  tab: { x1: 30.8, z0: 16.4, z1: 22.6 },
};

/** Load lever: 2.5 mm stainless wire, pivoting about an axle at the back. */
export const LEVER = { y: PLATE.y + PLATE.t + 1.25, z: -33.6, x: 29.5, r: 1.25, axleX0: 22.4, front: 33.4 };

// --- Package (package-local: y = 0 is the land side / seating plane) -------

export const PKG = { half: 20, t: 1.2, keyZ: SOCKET.keyZ, keyR: 1 };

/**
 * Integrated heat spreader: a thick central plateau over a lower skirt whose
 * eight legs are glued to the substrate, with two cut-outs on every side for
 * the capacitors. Heights are package-local.
 */
export const IHS = {
  skirt: 18.5,
  plateau: 17,
  /** Recess under the lid for the dies. */
  cavity: 13.5,
  notchCenters: [-9, 9],
  notchW: 7,
  /** Distance of a cut-out's inner wall from the package centre. */
  notchInner: 14.7,
  feet: PKG.t + 0.05,
  ceiling: 2.23,
  skirtTop: PKG.t + 1.7,
  top: PKG.t + 4.55,
};

export const BUMP_H = 0.07;
export const DIE_T = 0.7;
export const TIM_T = 0.26;
/** Centre height of a die above the land side. */
export const DIE_Y = PKG.t + BUMP_H + DIE_T / 2;

export interface DieSpec {
  id: "ccd-0" | "ccd-1" | "io-die";
  x: number;
  z: number;
  w: number;
  d: number;
}

/** Two compute chiplets on the left, the larger I/O die right of centre. */
export const DIES: DieSpec[] = [
  { id: "ccd-0", x: -7.4, z: -4.3, w: 10.7, d: 6.6 },
  { id: "ccd-1", x: -7.4, z: 4.3, w: 10.7, d: 6.6 },
  { id: "io-die", x: 6.6, z: 0, w: 9.3, d: 12.5 },
];

// --- Exploded view ---------------------------------------------------------

/**
 * Choreography of the exploded view. Ranges are portions of the explode
 * slider; the sequence follows how you would take the real thing apart.
 */
export const EX = {
  lever: { rotate: -2.05, range: [0, 0.16] as [number, number] },
  plate: { rotate: -1.76, range: [0.06, 0.27] as [number, number] },
  cpu: { lift: 22, range: [0.2, 0.42] as [number, number] },
  ihs: { lift: 18, range: [0.36, 0.56] as [number, number] },
  tim: { lift: 11, range: [0.5, 0.64] as [number, number] },
  dieLift: { lift: 5, range: [0.58, 0.68] as [number, number] },
  dieFlip: { range: [0.68, 0.82] as [number, number] },
  /** Magnified compute-die floorplan grows out of compute die 0. */
  ccdPlan: { range: [0.78, 0.9] as [number, number], scale: 6, position: [-30, 88, -14] as Vec3, tilt: 0.62 },
  /** Magnified core grows out of core 4 of the floorplan. */
  corePlan: { range: [0.89, 0.98] as [number, number], scale: 16, position: [40, 88, -14] as Vec3, tilt: 0.62 },
  lines: { range: [0.97, 1] as [number, number] },
};

/** World position of a die centre, assembled or fully exploded. */
export function dieWorld(d: DieSpec, exploded: boolean): Vec3 {
  const lift = exploded ? EX.cpu.lift + EX.dieLift.lift : 0;
  return [d.x, BOARD_TOP + SOCKET.seat + DIE_Y + lift, d.z];
}
