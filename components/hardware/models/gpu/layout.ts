/**
 * Shared dimensions for the graphics card (mm). The card lies flat with the
 * fans facing +Y. X runs along the card (I/O bracket at −X), Z across it:
 * the top edge (power connector, light bar) faces +Z, the PCIe edge −Z.
 */

export const CARD = {
  length: 300,
  width: 124,
  /** Backplate sits on the floor. */
  backplateY: 0,
  backplateT: 2,
  /** PCB top surface height. */
  pcbTop: 6,
  pcbT: 1.6,
};

/** PCB outline (short board; the last fan blows straight through the cooler). */
export const PCB = {
  x0: -146,
  x1: 52,
  z0: -58,
  z1: 58,
  /** PCIe x16 tab on the −Z edge. */
  tab: { x0: -128, x1: -39, depth: 8.6, notchX: -114.9 },
};

export const GPU = {
  x: -46,
  z: 0,
  substrate: 50,
  substrateT: 1.25,
  die: [24.4, 0.78, 26.4] as [number, number, number],
};

/** Height of the top of the GPU die above the PCB top. */
export const DIE_TOP = 0.45 + GPU.substrateT + 0.05 + GPU.die[1];

export const MEM = { w: 12, d: 14, h: 1.1 };

/** 12 GDDR7 packages in a U around the GPU (x, z, rotated?). */
export const MEMORY_CHIPS: { x: number; z: number; rot: boolean }[] = [
  ...[-70.5, -53.5, -36.5, -19.5].map((x) => ({ x, z: -41, rot: false })),
  ...[-70.5, -53.5, -36.5, -19.5].map((x) => ({ x, z: 41, rot: false })),
  ...[-24.75, -8.25, 8.25, 24.75].map((z) => ({ x: -88, z, rot: true })),
];

/** Core VRM phases: power stage + choke pairs in two columns right of the GPU. */
export const VRM_PHASES: { stageX: number; chokeX: number; z: number }[] = [];
for (const col of [
  { stageX: -11, chokeX: 0.5, n: 8 },
  { stageX: 15, chokeX: 26.5, n: 7 },
]) {
  for (let i = 0; i < col.n; i++) VRM_PHASES.push({ stageX: col.stageX, chokeX: col.chokeX, z: -43.4 + i * 12.4 });
}

/** Memory VRM phases near the I/O bracket. */
export const MEM_VRM: { stageX: number; chokeX: number; z: number }[] = [
  { stageX: -128, chokeX: -117, z: -20 },
  { stageX: -128, chokeX: -117, z: -7.5 },
  { stageX: -128, chokeX: -117, z: 5 },
];

export const CHOKE = { w: 10.4, h: 7, d: 10.4 };
export const STAGE = { w: 5, h: 0.95, d: 6 };

export const POWER_CONN = { x: 36, z: 56.5 };
export const INPUT_CAPS: [number, number][] = [
  [41.5, 34],
  [41.5, 24],
  [41.5, 14],
  [41.5, 4],
  [41.5, -6],
  [41.5, -16],
];

/** Display outputs along the bracket (z positions), opening toward −X. */
export const PORTS: { kind: "dp" | "hdmi"; z: number }[] = [
  { kind: "dp", z: -36 },
  { kind: "dp", z: -14 },
  { kind: "dp", z: 8 },
  { kind: "hdmi", z: 31 },
];

/** Cooler mounting holes around the GPU (spring screws). */
export const GPU_HOLES: [number, number][] = [
  [GPU.x - 29, -29],
  [GPU.x + 29, -29],
  [GPU.x - 29, 29],
  [GPU.x + 29, 29],
];

/** Board-edge screw holes shared by the cooler, PCB and backplate. */
export const EDGE_HOLES: [number, number][] = [
  [-140, -52],
  [-140, 52],
  [-4, -53],
  [-4, 53],
  [46, -52],
  [46, 52],
];

export const FANS = [-98, 0, 98];
export const FAN = { radius: 44.6, ring: 46.8, depth: 11 };

/** Heights (absolute Y) of cooler layers. */
export const COOLER = {
  /** Base plate (midplate) underside / top. */
  baseBottom: CARD.pcbTop + 8.2,
  baseTop: CARD.pcbTop + 10.2,
  finBottom: CARD.pcbTop + 11.2,
  finTop: CARD.pcbTop + 43,
  fanBottom: CARD.pcbTop + 43.5,
  shroudTop: CARD.pcbTop + 56,
};
