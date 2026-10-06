import { rowOf, type SmdItem } from "../../kit/Passives";
import { CTRL, DRAM, NANDS, NAND_PKG } from "./layout";

/**
 * Every passive on the SSD's top side, placed once and used both for the 3D
 * parts (SmdField) and for the solder pads painted underneath them.
 */
export const SSD_PASSIVES = (() => {
  const c0201: SmdItem[] = [];
  const r0201: SmdItem[] = [];
  const c0402: SmdItem[] = [];
  const r0402: SmdItem[] = [];
  const c0603: SmdItem[] = [];
  const c0805: SmdItem[] = [];

  // --- Power section next to the connector -------------------------------
  // Bulk input capacitors on the 3.3 V rail.
  c0805.push([-34.6, 9.6, 0], [-32.0, 9.6, 0]);
  c0603.push([-29.9, 9.6, 0]);
  // PMIC input/output caps and feedback dividers.
  c0603.push([-35.35, -7.1, 90], [-35.35, -9.4, 90]);
  c0402.push([-29.9, -6.2, 90], [-29.9, -8.2, 90], [-29.9, -10.0, 0]);
  r0201.push(...rowOf(-34.6, -5.0, -31.0, -5.0, 5, 0));
  // Output capacitors beside each inductor (L1–L3 sit at z = −9).
  c0603.push([-28.3, -7.15, 0], [-25.3, -7.15, 0], [-22.3, -7.15, 0]);
  c0402.push([-26.8, -9.0, 90], [-23.8, -9.0, 90], [-20.6, -9.0, 90], [-19.4, -9.0, 90]);
  c0201.push(...rowOf(-18.4, -9.6, -17.0, -9.6, 3, 90));

  // --- Controller -----------------------------------------------------------
  const cx = CTRL.x;
  const half = CTRL.sub / 2;
  // Column of 0201 decoupling caps in the gap between controller and DRAM.
  c0201.push(...rowOf(cx + half + 1.0, -4.8, cx + half + 1.0, 4.8, 9, 90));
  // Rows in the band above the controller.
  c0402.push(...rowOf(-27.8, 7.0, -23.0, 7.0, 4, 0));
  r0201.push(...rowOf(-26.0, 9.7, -23.0, 9.7, 4, 0));
  c0201.push(...rowOf(-26.0, 8.4, -23.6, 8.4, 3, 0));
  // Crystal load capacitors.
  c0201.push([-22.0, 7.9, 90], [-22.0, 8.75, 90]);
  c0603.push([-18.0, 9.5, 0]);
  c0402.push([-18.0, 8.6, 0]);

  // --- DRAM -------------------------------------------------------------------
  for (const s of [-1, 1]) {
    c0201.push(...rowOf(DRAM.x - 3, s * (DRAM.d / 2 + 0.6), DRAM.x + 3, s * (DRAM.d / 2 + 0.6), 5, 0));
    c0402.push(...rowOf(DRAM.x - 3, s * 8.6, DRAM.x + 1, s * 8.6, 3, 0));
    c0603.push([DRAM.x + 3.2, s * 9.8, 0], [DRAM.x - 1.6, s * 9.9, 0]);
  }
  // Gap between DRAM and the first NAND package.
  c0201.push(...rowOf(DRAM.x + DRAM.w / 2 + 1.0, -4.0, DRAM.x + DRAM.w / 2 + 1.0, 4.0, 5, 90));

  // --- NAND packages ---------------------------------------------------------
  for (const n of NANDS) {
    for (const s of [-1, 1]) {
      c0402.push(...rowOf(n.x - 7.5, s * 8.6, n.x + 6.5, s * 8.6, 8, 0));
      c0603.push(...rowOf(n.x - 6.5, s * 9.9, n.x + 5.5, s * 9.9, 4, 0));
    }
  }
  // Between the two packages.
  const gapX = (NANDS[0].x + NAND_PKG.w / 2 + NANDS[1].x - NAND_PKG.w / 2) / 2;
  c0201.push(...rowOf(gapX, -5.0, gapX, 5.0, 6, 90));
  c0201.push([gapX, 10.15, 0]);

  // --- End of the board: strap resistors next to the test pads -------------
  r0201.push(...rowOf(34.55, -2.4, 34.55, 2.4, 5, 90));
  r0402.push([33.9, -4.4, 90], [33.9, 4.4, 90]);

  return { c0201, r0201, c0402, r0402, c0603, c0805 };
})();

/**
 * PCIe lanes leaving the gold fingers: each pair's centre z at the fingers
 * and where it lands on the controller's ball grid. `tx` pairs carry the
 * drive's transmitter and get series AC-coupling capacitors.
 */
export const PCIE_PAIRS: { pins: [number, number]; z: number; target: number; tx: boolean; name: string }[] = [
  { pins: [5, 7], z: 8.0, target: 4.4, tx: true, name: "PET3" },
  { pins: [11, 13], z: 6.5, target: 3.3, tx: false, name: "PER3" },
  { pins: [17, 19], z: 5.0, target: 2.2, tx: true, name: "PET2" },
  { pins: [23, 25], z: 3.5, target: 1.1, tx: false, name: "PER2" },
  { pins: [29, 31], z: 2.0, target: 0.0, tx: true, name: "PET1" },
  { pins: [35, 37], z: 0.5, target: -1.1, tx: false, name: "PER1" },
  { pins: [41, 43], z: -1.0, target: -2.2, tx: true, name: "PET0" },
  { pins: [47, 49], z: -2.5, target: -3.3, tx: false, name: "PER0" },
  { pins: [53, 55], z: -4.0, target: -4.4, tx: false, name: "REFCLK" },
];

/** Two staggered 0201 capacitors per transmit pair. */
export const AC_CAPS: SmdItem[] = PCIE_PAIRS.filter((p) => p.tx).flatMap((p): SmdItem[] => [
  [-33.6, p.z + 0.12, 0],
  [-32.8, p.z - 0.12, 0],
]);
