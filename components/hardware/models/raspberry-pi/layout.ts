/**
 * Raspberry Pi 5 dimensions (mm), measured from the official mechanical
 * drawing (board 85 × 56 mm, Active Cooler 63.5 × 42.5 mm).
 *
 * Positions are written in **drawing coordinates**, exactly as on the
 * datasheet: `x` from the board's left edge (microSD / PCIe side) and `z`
 * from the top edge (GPIO header side). `wx`/`wz` map them to world space,
 * where the board is centred on the origin:
 *
 *   −Z  GPIO header edge            +X  USB / Ethernet edge
 *   +Z  USB-C / micro-HDMI edge     −X  microSD / PCIe edge
 *
 * Inside the board group y = 0 is the top copper surface.
 */

export const PCB = { w: 85, d: 56, t: 1.45, r: 3 };
/** Brass standoffs lift the board off the desk (and keep its underside visible). */
export const STANDOFF_H = 5;
/** World height of the board's top surface. */
export const BOARD_TOP = STANDOFF_H + PCB.t;

/** Drawing → world (x). */
export const wx = (x: number) => x - PCB.w / 2;
/** Drawing → world (z). */
export const wz = (z: number) => z - PCB.d / 2;

export type Rect = [x: number, z: number, w: number, d: number];

/** HAT-standard mounting holes, Ø2.7 mm on a 58 × 49 mm pattern. */
export const MOUNT_HOLES: [number, number][] = [
  [3.5, 3.5],
  [61.5, 3.5],
  [3.5, 52.5],
  [61.5, 52.5],
];
export const MOUNT_HOLE_R = 1.35;
/** Two extra Ø3 holes, diagonally opposite, for the Active Cooler's push pins. */
export const COOLER_HOLES: [number, number][] = [
  [61.5, 9.5],
  [3.5, 46.5],
];
export const COOLER_HOLE_R = 1.5;

// --- Chips ------------------------------------------------------------------

/** 40-pin header: pin 1 is on the inner row at the left end. */
export const GPIO = { x: 32.5, z: 3.5, pitch: 2.54, cols: 20 };
/** BCM2712: 17 mm FCBGA with a stamped "top-hat" heat spreader. */
export const SOC = {
  x: 33.1,
  z: 33.15,
  size: 17,
  ballH: 0.25,
  substrateT: 0.45,
  /** C1-stepping die, 8.63 × 6.47 mm (long side along x). */
  die: { w: 8.63, t: 0.45, d: 6.47 },
  bump: 0.06,
  timT: 0.05,
  lid: { w: 16.6, t: 0.3, plateau: 4.9, flange: 6.0, halfD: 8.3 },
};
/** Heights inside the SoC package, from the board surface. */
export const SOC_Y = (() => {
  const substrateTop = SOC.ballH + SOC.substrateT;
  const dieBottom = substrateTop + SOC.bump;
  const dieTop = dieBottom + SOC.die.t;
  const lidInner = dieTop + SOC.timT;
  const lidTop = lidInner + SOC.lid.t;
  return { substrateTop, dieBottom, dieTop, lidInner, lidTop, flangeTop: substrateTop + SOC.lid.t };
})();

export const RAM = { x: 33.15, z: 16.93, w: 14.5, d: 10, h: 0.95 };
export const RP1 = { x: 58.37, z: 20.95, size: 12, h: 1.15 };
/** Ethernet PHY, rotated 45° (a first for a Raspberry Pi). */
export const PHY = { x: 63.98, z: 32.5, size: 6, h: 0.85 };
export const WIFI = { x: 12.45, z: 13.68, w: 10.6, d: 13.1, h: 1.45 };
export const PMIC = { x: 11.22, z: 40.8, size: 6, h: 0.85 };
/** Quad-phase core supply inductors above the PMIC. */
export const CORE_INDUCTORS: [number, number][] = [
  [6.65, 34.08],
  [9.15, 34.08],
  [13.33, 34.08],
  [15.83, 34.08],
];
export const INDUCTOR = { w: 2.1, d: 2.8, h: 1.0 };
export const BOOT_FLASH = { x: 56.1, z: 8.04, w: 1.7, d: 3.0, h: 0.55 };
/** Crystals: SoC (54 MHz), RP1 (50 MHz), Ethernet PHY (25 MHz). */
export const CRYSTALS: { x: number; z: number; w: number; d: number; label: string }[] = [
  { x: 42.87, z: 44.63, w: 2.0, d: 2.5, label: "54.0" },
  { x: 49.4, z: 12.6, w: 2.5, d: 2.0, label: "50.0" },
  { x: 68.4, z: 29.4, w: 2.0, d: 2.5, label: "25.0" },
];

// --- Connectors -------------------------------------------------------------

export const USB2 = { z: 9.07 };
export const USB3 = { z: 26.96 };
export const USB_STACK = { x0: 70.86, front: 88.3, w: 13.0, h: 15.6 };
export const ETH = { x0: 66.73, front: 88.05, z: 45.8, w: 16.0, h: 13.8 };
export const HDMI_X = [25.8, 39.2];
export const HDMI = { w: 6.5, h: 3.4, z0: 49.15, front: 57.6 };
export const USBC = { x: 11.24, z0: 50.0, front: 57.45, h: 3.2 };
export const MIPI_X = [48.72, 54.91];
export const MIPI = { z: 47.54, w: 3.0, d: 15.6, h: 4.1 };
export const PCIE_FPC = { x: 2.75, z: 26.04, w: 3.13, d: 10.6, h: 2.0 };
export const FAN_CONN = { x: 66.76, z: 3.94, pins: 4 };
export const BAT_CONN = { x: 19.03, z: 51.27, pins: 2 };
export const UART_CONN = { x: 32.33, z: 52.14, pins: 3 };
export const J2_PADS: [number, number][] = [
  [17.75, 54.45],
  [20.29, 54.45],
];
export const POE = { x: 61.49, z: 46.48 };
export const POWER_BUTTON = { x: 1.7, z: 37.6 };
export const STATUS_LED = { x: 0.9, z: 42.72 };
/** microSD socket on the underside; the card pokes 1.7 mm past the left edge. */
export const MICROSD = { z: 27.9, socketW: 14.0, socketD: 12.4, cardOut: 1.74 };
/** The Wi-Fi antenna's radiating copper element (an L-shaped patch with a tap). */
export const ANTENNA_POLY: [number, number][] = [
  [0.8, 7.4],
  [2.3, 7.4],
  [2.3, 12.2],
  [3.4, 12.2],
  [3.4, 13.4],
  [2.3, 13.4],
  [2.3, 19.4],
  [0.8, 19.4],
];
/** The antenna's four little tuning parts: [x, z, rotation°]. */
export const ANTENNA_PARTS: [number, number, number][] = [
  [4.2, 12.8, 0],
  [5.0, 13.4, 45],
  [5.9, 14.1, 90],
  [6.4, 15.2, 0],
];
/** Small part beside the fan connector (USB power switch area). */
export const USB_SWITCH = { x: 67.5, z: 11.98 };

// --- Active Cooler (drawing coordinates, mapped from its own drawing) ----------

export const COOLER = {
  /** Underside of the base plate above the board surface. */
  baseBottom: 1.95,
  baseT: 1.45,
  finH: 7.75,
  fan: { x0: 27.5, x1: 57.56, z0: 8.0, z1: 37.95, h: 6.8, lift: 0.95 },
  intake: { x: 41.81, z: 22.28, r: 10.58 },
  fanScrews: [
    [31.53, 9.67],
    [54.52, 10.43],
    [54.52, 35.49],
  ] as [number, number][],
  /** 6 × 9 cross-cut pin fins. */
  finCols: [7.52, 10.91, 14.3, 17.69, 21.08, 24.51],
  finRows: [6.92, 11.6, 16.26, 20.92, 25.58, 30.23, 34.89, 39.55, 44.21],
  finW: 2.03,
  finD: 2.75,
};
export const COOLER_TOP = COOLER.baseBottom + COOLER.baseT;

/** Footprints (drawing coords) that random passives and traces must avoid. */
export const KEEP_OUT: Rect[] = [
  [7.1, 0.9, 50.8, 5.1], // GPIO header
  [SOC.x - 9, SOC.z - 9, 18, 18],
  [RAM.x - RAM.w / 2 - 0.4, RAM.z - RAM.d / 2 - 0.4, RAM.w + 0.8, RAM.d + 0.8],
  [RP1.x - 6.4, RP1.z - 6.4, 12.8, 12.8],
  [PHY.x - 4.6, PHY.z - 4.6, 9.2, 9.2],
  [WIFI.x - WIFI.w / 2 - 0.4, WIFI.z - WIFI.d / 2 - 0.4, WIFI.w + 0.8, WIFI.d + 0.8],
  [PMIC.x - 3.5, PMIC.z - 3.5, 7, 7],
  [5.2, 32.3, 12.2, 3.6], // core inductors
  [0, 6.5, 7, 13.8], // antenna keep-out
  [USB_STACK.x0 - 0.5, 1.5, 18, 15], // USB 2
  [USB_STACK.x0 - 0.5, 19.4, 18, 15], // USB 3
  [ETH.x0 - 0.5, 37.3, 22, 17], // Ethernet
  [HDMI_X[0] - 3.8, 48.6, 7.6, 7.4],
  [HDMI_X[1] - 3.8, 48.6, 7.6, 7.4],
  [6.3, 49.4, 9.9, 6.6], // USB-C
  [MIPI_X[0] - 2, 39.2, 4, 16.6],
  [MIPI_X[1] - 2, 39.2, 4, 16.6],
  [0.6, 20.2, 4.6, 11.6], // PCIe FPC
  [64.6, 0.4, 4.3, 7.2], // fan connector
  [16.4, 49.2, 5.3, 4.2], // BAT
  [29.1, 50, 6.4, 4.3], // UART
  [58.4, 43.4, 6.2, 6.2], // PoE
  [0, 34.6, 3.8, 10.4], // power button + LED
  [BOOT_FLASH.x - 1.3, BOOT_FLASH.z - 1.9, 2.6, 3.8],
  [USB_SWITCH.x - 2.4, USB_SWITCH.z - 3.9, 4.8, 7.8],
  ...CRYSTALS.map((c): Rect => [c.x - c.w / 2 - 0.5, c.z - c.d / 2 - 0.5, c.w + 1, c.d + 1]),
  ...[...MOUNT_HOLES, ...COOLER_HOLES].map(([x, z]): Rect => [x - 3.2, z - 3.2, 6.4, 6.4]),
  [17.2, 42.2, 20.6, 3.8], // "Raspberry Pi 5" silkscreen
];

/** True when the point (drawing coords) lies inside any keep-out (with margin). */
export function blocked(x: number, z: number, margin = 0.5, rects: Rect[] = KEEP_OUT) {
  if (x < 1 || z < 1 || x > PCB.w - 1 || z > PCB.d - 1) return true;
  return rects.some(([rx, rz, rw, rd]) => x > rx - margin && x < rx + rw + margin && z > rz - margin && z < rz + rd + margin);
}
