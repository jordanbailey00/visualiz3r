import { gridOf, ringOf, rowOf, scatterIn, type SmdItem } from "../../kit/Passives";
import {
  CORE_INDUCTORS,
  HDMI_X,
  KEEP_OUT,
  PHY,
  PMIC,
  RAM,
  RP1,
  SOC,
  WIFI,
  blocked,
  type Rect,
} from "./layout";

/**
 * Surface-mount passives, in drawing coordinates (x from the left edge, z from
 * the GPIO edge). Computed once and used both to paint their solder pads into
 * the board texture and to place the instanced 3D parts.
 */
export interface PassiveSet {
  c0201: SmdItem[];
  r0201: SmdItem[];
  c0402: SmdItem[];
  r0402: SmdItem[];
  c0603: SmdItem[];
  c0805: SmdItem[];
}

/** Hard keep-outs for deliberate rows (connectors and chips only). */
const HARD: Rect[] = KEEP_OUT.filter((r) => r[2] * r[3] > 10);

function clean(items: SmdItem[], rects: Rect[] = HARD, margin = 0.15): SmdItem[] {
  return items.filter(([x, z]) => !blocked(x, z, margin, rects));
}

/** Rotate a set of items about a centre (for the 45° Ethernet PHY). */
function rotated(items: SmdItem[], cx: number, cz: number, deg: number): SmdItem[] {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return items.map(([x, z, r = 0]) => {
    const dx = x - cx;
    const dz = z - cz;
    return [cx + dx * c - dz * s, cz + dx * s + dz * c, r + deg];
  });
}

export const TOP_PASSIVES: PassiveSet = (() => {
  const c0201: SmdItem[] = [];
  const r0201: SmdItem[] = [];
  const c0402: SmdItem[] = [];
  const r0402: SmdItem[] = [];
  const c0603: SmdItem[] = [];
  const c0805: SmdItem[] = [];

  // SoC: decoupling ring just outside the package.
  c0402.push(...ringOf(SOC.x, SOC.z, SOC.size + 1.9, SOC.size + 1.9, 11));
  c0201.push(...ringOf(SOC.x, SOC.z, SOC.size + 3.3, SOC.size + 3.3, 9).filter((_, i) => i % 3 !== 1));

  // SDRAM: a row along its top edge and a few at each end.
  c0402.push(...rowOf(RAM.x - 6.6, RAM.z - RAM.d / 2 - 0.85, RAM.x + 6.6, RAM.z - RAM.d / 2 - 0.85, 14, 90));
  c0201.push(...rowOf(RAM.x - RAM.w / 2 - 0.7, RAM.z - 3.6, RAM.x - RAM.w / 2 - 0.7, RAM.z + 3.6, 7, 0));
  c0201.push(...rowOf(RAM.x + RAM.w / 2 + 0.7, RAM.z - 3.6, RAM.x + RAM.w / 2 + 0.7, RAM.z + 3.6, 7, 0));

  // RP1: ring of decoupling caps; pull resistors on its GPIO side.
  c0402.push(...ringOf(RP1.x, RP1.z, RP1.size + 1.8, RP1.size + 1.8, 8));
  r0201.push(...rowOf(RP1.x - 5, RP1.z - RP1.size / 2 - 2.0, RP1.x + 3, RP1.z - RP1.size / 2 - 2.0, 9, 90));

  // Ethernet PHY: caps around the rotated package.
  c0402.push(...rotated(ringOf(PHY.x, PHY.z, PHY.size + 2, PHY.size + 2, 3), PHY.x, PHY.z, 45));

  // Wi-Fi radio: caps along the shield fence.
  c0201.push(...rowOf(WIFI.x + WIFI.w / 2 + 0.9, WIFI.z - 5.5, WIFI.x + WIFI.w / 2 + 0.9, WIFI.z + 5.5, 8, 0));

  // PMIC: the large 0805 bulk caps drawn on the datasheet, plus small decoupling.
  c0805.push([5.4, 38.72, 0], [5.4, 42.17, 0], [17.04, 38.72, 0], [17.04, 42.17, 0]);
  c0805.push([8.4, 46.7, 90], [11.8, 46.7, 90], [14.35, 46.7, 90]);
  c0402.push(...rowOf(PMIC.x - 2.6, PMIC.z - 3.9, PMIC.x + 2.6, PMIC.z - 3.9, 5, 90));
  c0402.push(...rowOf(4.2, 36.6, 4.2, 44.0, 6, 0));
  c0603.push(...rowOf(CORE_INDUCTORS[0][0] - 0.2, 31.4, CORE_INDUCTORS[3][0] + 0.2, 31.4, 6, 0));
  r0402.push([18.6, 36.2, 90], [18.6, 37.6, 90], [18.6, 44.6, 0]);

  // HDMI: ESD/termination parts behind each port.
  for (const x of HDMI_X) {
    c0201.push(...rowOf(x - 2.6, 47.4, x + 2.6, 47.4, 6, 90));
    r0201.push([x - 3.2, 46.2, 0], [x + 3.2, 46.2, 0]);
  }
  // USB-C: CC pull-downs and input bulk caps.
  r0402.push([7.6, 48.2, 90], [8.6, 48.2, 90]);
  c0603.push([14.6, 48.0, 90], [16.0, 48.0, 90]);
  // USB ports: VBUS caps and filters along the backs of the stacks.
  c0603.push(...rowOf(69.6, 3.2, 69.6, 6.6, 3, 0));
  c0402.push(...rowOf(69.8, 17.0, 69.8, 19.0, 3, 0));
  c0402.push(...rowOf(69.8, 34.4, 69.8, 36.6, 3, 0));
  // MIPI and PCIe lanes: AC-coupling capacitor pairs.
  for (let i = 0; i < 4; i++) c0201.push([46.4, 27.6 + i * 1.05, 0], [46.4, 27.95 + i * 1.05, 0]);
  c0201.push([8.6, 25.25, 0], [8.6, 25.6, 0], [8.6, 26.45, 0], [8.6, 26.8, 0]);
  // GPIO: series resistors fanning out from RP1 toward the header.
  r0201.push(...rowOf(20.5, 7.4, 46.5, 7.4, 22, 90).filter((_, i) => i % 4 !== 3));
  // Fan connector & USB power switch area.
  c0402.push([64.4, 12.2, 0], [64.4, 13.4, 0]);

  // A believable sprinkling of stragglers in the open areas.
  const area: Rect = [1.2, 1.2, 82.6, 53.6];
  c0201.push(...scatterIn(area, 70, 31, KEEP_OUT, 0.7));
  r0201.push(...scatterIn(area, 40, 32, KEEP_OUT, 0.7));
  c0402.push(...scatterIn(area, 26, 33, KEEP_OUT, 0.8));
  r0402.push(...scatterIn(area, 18, 34, KEEP_OUT, 0.8));

  return {
    c0201: clean(c0201),
    r0201: clean(r0201),
    c0402: clean(c0402),
    r0402: clean(r0402),
    c0603: clean(c0603),
    c0805,
  };
})();

/** Underside: a dense MLCC array right below the SoC and RP1 power balls. */
export const BOTTOM_PASSIVES: PassiveSet = (() => {
  const c0201 = [...gridOf(SOC.x, SOC.z, 12, 10, 1.05, 1.15, 90), ...gridOf(RP1.x, RP1.z, 7, 6, 1.1, 1.2, 90)];
  const c0402 = [
    ...rowOf(SOC.x - 7, SOC.z - 7.6, SOC.x + 7, SOC.z - 7.6, 10, 90),
    ...rowOf(SOC.x - 7, SOC.z + 7.6, SOC.x + 7, SOC.z + 7.6, 10, 90),
    ...rowOf(RAM.x - 6, RAM.z, RAM.x + 6, RAM.z, 9, 90),
  ];
  const c0603 = [...rowOf(PMIC.x - 3, PMIC.z + 1, PMIC.x + 3, PMIC.z + 1, 4, 90), ...rowOf(26, 46, 40, 46, 6, 90)];
  const r0402 = scatterIn([2, 2, 81, 52], 40, 41, [[0, 20, 16, 16]], 0.6);
  const r0201 = scatterIn([2, 2, 81, 52], 60, 42, [[0, 20, 16, 16]], 0.6);
  return { c0201, r0201, c0402, r0402, c0603, c0805: [] };
})();
