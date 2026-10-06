"use client";

import { useMemo } from "react";
import { CylinderGeometry, MeshPhysicalMaterial, type BufferGeometry } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { FONT_COND, FONT_SANS, rng, type Painter } from "@/lib/three/painter";
import {
  mountingRing,
  randomTraces,
  silk,
  smdPads,
  traceBus,
  viaField,
  type PcbSurfaces,
} from "@/lib/three/pcbPaint";
import { Board } from "../../kit/Board";
import { Chip } from "../../kit/Chip";
import { cached, circlePath, roundedBox } from "../../kit/geometry";
import { MAT } from "../../kit/materials";
import { Choke, PolymerCap, SmdField, gridOf, rowOf, scatterIn, type SmdItem } from "../../kit/Passives";
import { BACKPLATE, BOARD, BOARD_TOP, COOLER_HOLES, FRAME_SCREWS, INSULATOR_T, type Rect } from "./layout";
import { circlePoints, extrudeY, PanScrew, roundedRectPoints, shapeFrom, timedPaint } from "./shapes";

const H = BOARD.half;

// ---------------------------------------------------------------------------
// Layout of the board section
// ---------------------------------------------------------------------------

/** Six CPU power phases along the left edge: power stage + choke each. */
export const VRM_PHASES = [-32.5, -19.5, -6.5, 6.5, 19.5, 32.5].map((z) => ({ z, stageX: -34.5, chokeX: -46 }));
export const CHOKE = { w: 10, h: 7, d: 10 };
export const STAGE = { w: 5, h: 0.9, d: 6 };
export const BULK_CAPS: [number, number][] = [
  [-46.5, -46.5],
  [-38.4, -50.6],
  [-46.5, 46.5],
  [-38.4, 50.6],
];

/** Centre lines of the four DDR5 sub-channel buses running to the memory slots (+X). */
const MEM_BUSES = [-24, -10.5, 6.5, 20];
/** PCIe lane pairs heading to the graphics slot (+Z). */
const PCIE_PAIRS = Array.from({ length: 8 }, (_, i) => -10.5 + i * 3);

const KEEP_OUT: Rect[] = [
  [-27.8, -36.2, 55.6, 72.4],
  [27, -37, 10, 75],
  [-35, -51, 70, 12],
  [-35, 39, 70, 12],
  [-55, -40, 26.5, 80],
  ...BULK_CAPS.map(([x, z]): Rect => [x - 5, z - 5, 10, 10]),
  [27, -32, 28, 62],
  [-13, 35, 26, 20],
];

const BOARD_SMD = (() => {
  const c0402: SmdItem[] = [];
  const r0402: SmdItem[] = [];
  const c0603: SmdItem[] = [];
  const c0201: SmdItem[] = [];
  // Output MLCCs between the power stages and the socket.
  c0603.push(...rowOf(-29.6, -37, -29.6, 37, 27, 0));
  // Decoupling rows in front of and behind the retention frame.
  c0402.push(...rowOf(-25, 37.0, 25, 37.0, 32, 90));
  c0402.push(...rowOf(-25, -37.0, 25, -37.0, 32, 90));
  // Bootstrap capacitors and gate resistors beside each power stage.
  for (const ph of VRM_PHASES) {
    c0603.push([ph.stageX - 3.9, ph.z - 1.3, 90], [ph.stageX - 3.9, ph.z + 1.3, 90]);
    r0402.push([ph.stageX + 3.3, ph.z + 2.4, 90], [ph.stageX + 3.3, ph.z - 2.4, 90]);
  }
  // AC-coupling capacitors on every PCIe lane.
  for (const x of PCIE_PAIRS) c0201.push([x - 0.2, 52.4, 90], [x + 0.2, 52.4, 90]);
  // Termination resistor packs where the memory buses leave the section.
  for (const z of MEM_BUSES) r0402.push(...rowOf(53.4, z - 2.6, 53.4, z + 2.6, 5, 0));
  // Stragglers in the free corners, as on any real board.
  r0402.push(...scatterIn([-55, -55, 110, 110], 36, 3, KEEP_OUT, 1.2));
  c0402.push(...scatterIn([-55, -55, 110, 110], 44, 4, KEEP_OUT, 1.2));
  return { c0402, r0402, c0603, c0201 };
})();

/** The dense capacitor field directly under the socket, on the back. */
const BACK_MLCC: SmdItem[] = gridOf(0, 0, 13, 15, 1.75, 1.92, 90);
const BACK_BULK: SmdItem[] = gridOf(0, 0, 2, 2, 26, 32, 0);

const BOARD_SHAPE = (() => {
  const s = shapeFrom(roundedRectPoints(0, 0, H * 2, H * 2, 0.4, 2));
  for (const [x, z] of COOLER_HOLES) s.holes.push(circlePath(x, z, 2.0));
  return s;
})();

// ---------------------------------------------------------------------------
// Painting
// ---------------------------------------------------------------------------

/** A bundle of traces that fans out to make room for length-matching meanders. */
function memoryBus(p: Painter, s: PcbSurfaces, zc: number, count: number, seed: number) {
  const rand = rng(seed);
  const pitchAt = (x: number) => {
    const ramp = (a: number, b: number) => Math.min(1, Math.max(0, (x - a) / (b - a)));
    return 0.3 + 0.62 * (ramp(31, 36) - ramp(48, 53));
  };
  for (let k = 0; k < count; k++) {
    const o = k - (count - 1) / 2;
    const meander = k % 2 === 1 || rand() > 0.7;
    const pts: [number, number][] = [];
    for (let x = 26.8; x <= 55.2; x += 0.1) {
      let z = zc + o * pitchAt(x);
      if (meander && x > 38.4 && x < 46.6) {
        const phase = Math.floor((x - 38.4) / 0.82);
        z += (phase % 2 === 0 ? 1 : -1) * 0.3;
      }
      pts.push([x, z]);
    }
    p.polyline(pts, 0.11, s.copper);
  }
}

function paintTop(p: Painter, s: PcbSurfaces) {
  // --- Power planes ---------------------------------------------------------
  p.roundRect(-55, -40, 26.5, 80, 1, s.copper);
  for (const ph of VRM_PHASES.slice(0, -1)) p.rect(-55, ph.z + 6.25, 26.5, 0.5, s.mask);
  p.roundRect(-27.6, -35.8, 55.2, 71.6, 2.5, s.copper);

  // --- VRM footprints -------------------------------------------------------
  VRM_PHASES.forEach((ph, i) => {
    p.rect(ph.stageX - 1.7, ph.z - 2.1, 3.4, 4.2, s.tin);
    for (let k = 0; k < 8; k++) {
      p.rect(ph.stageX - 2.3 + k * 0.62, ph.z - 3.35, 0.3, 0.7, s.tin);
      p.rect(ph.stageX - 2.3 + k * 0.62, ph.z + 2.65, 0.3, 0.7, s.tin);
    }
    p.rect(ph.chokeX - 3, ph.z - CHOKE.d / 2 - 0.25, 6, 2.2, s.tin);
    p.rect(ph.chokeX - 3, ph.z + CHOKE.d / 2 - 1.95, 6, 2.2, s.tin);
    viaField(p, s, ph.stageX + 2.4, ph.z - 2.4, 1.6, 4.8, 8, 200 + i, 0.16);
    silk(p, s, `PL${i + 1}`, ph.chokeX + CHOKE.w / 2 + 1.4, ph.z, 0.95, -90);
    silk(p, s, `PQ${i + 1}`, ph.stageX, ph.z - 4.3, 0.8);
  });
  for (const [x, z] of BULK_CAPS) {
    p.circle(x, z, 4.6, s.copper);
    p.rect(x - 4.2, z - 1.2, 2.6, 2.4, s.tin);
    p.rect(x + 1.6, z - 1.2, 2.6, 2.4, s.tin);
    silk(p, s, "+", x - 5.3, z - 3.4, 1.4);
  }

  // --- DDR5 buses to the memory slots, with length-matching meanders --------
  MEM_BUSES.forEach((z, i) => memoryBus(p, s, z, 12, 40 + i));
  // --- PCIe lanes to the graphics slot -------------------------------------
  for (const x of PCIE_PAIRS) {
    for (const o of [-0.2, 0.2]) {
      p.polyline(
        [
          [x * 0.7 + o, 35.5],
          [x * 0.7 + o, 38],
          [x + o, 41],
          [x + o, 55.2],
        ],
        0.12,
        s.copper,
      );
    }
  }
  // --- Misc traces toward the back (USB, fan, debug) ------------------------
  traceBus(p, s, [-6, -35.5], [-14, -55.2], 10, 0.4, 0.11, false);
  traceBus(p, s, [12, -35.5], [20, -55.2], 6, 0.4, 0.11, false);
  randomTraces(p, s, -27, 40, 12, 14, 10, 11);
  randomTraces(p, s, 14, 40, 13, 14, 10, 12);
  randomTraces(p, s, -27, -54, 12, 14, 10, 13);
  randomTraces(p, s, 34, -54, 20, 18, 12, 14);
  randomTraces(p, s, 34, 38, 20, 16, 12, 15);

  // --- Vias, mounting rings, keep-outs -------------------------------------
  viaField(p, s, -55, -55, 110, 110, 700, 16, 0.16);
  for (const [x, z] of COOLER_HOLES) {
    mountingRing(p, s, x, z, 2.0, 1.7, s.tin);
    p.ring(x, z, 5.3, 0.16, s.silk);
  }

  // --- Passive footprints ---------------------------------------------------
  for (const [x, z, r] of BOARD_SMD.c0402) smdPads(p, s, x, z, 1, 0.5, r ?? 0);
  for (const [x, z, r] of BOARD_SMD.r0402) smdPads(p, s, x, z, 1, 0.5, r ?? 0);
  for (const [x, z, r] of BOARD_SMD.c0603) smdPads(p, s, x, z, 1.6, 0.8, r ?? 0);

  // --- Silkscreen -----------------------------------------------------------
  p.shape((ctx) => ctx.roundRect(-27.4, -35.9, 54.8, 71.8, 3.2), s.silk, "stroke", 0.18);
  p.polygon(
    [
      [-29.6, 39.6],
      [-29.6, 37.4],
      [-27.4, 39.6],
    ],
    s.silk,
  );
  p.text("CPU1  ·  LGA1718", -26.2, 38.9, 1.05, s.silk, { font: FONT_SANS, weight: 700, baseline: "middle" });
  p.text("MB-X1  REV 1.02", 31.5, 53.3, 1.6, s.silk, { font: FONT_SANS, weight: 800, letterSpacing: 0.25 });
  p.text("E481173  94V-0  2504", 31.5, 50.7, 0.9, s.silk, { font: FONT_COND, weight: 600 });
  silk(p, s, "DDR5_A", 44, -33.4, 1.0);
  silk(p, s, "DDR5_B", 44, 30.2, 1.0);
  silk(p, s, "PCIE_X16", 15.8, 53.6, 0.95);
}

function paintBottom(p: Painter, s: PcbSurfaces) {
  p.roundRect(-54, -54, 108, 108, 2, s.copper);
  viaField(p, s, -55, -55, 110, 110, 1200, 21, 0.16);
  // Via farm feeding the socket's power and ground contacts.
  for (let z = -18; z <= 18; z += 0.94) for (let x = -18; x <= 18; x += 0.81) p.circle(x, z, 0.14, s.via);
  for (const [x, z, r] of BACK_MLCC) smdPads(p, s, x, z, 1, 0.5, r ?? 90);
  for (const [x, z, r] of BACK_BULK) smdPads(p, s, x, z, 2, 1.25, r ?? 0);
  p.shape((ctx) => ctx.roundRect(-BACKPLATE.halfX - 0.6, -BACKPLATE.halfZ - 0.6, BACKPLATE.halfX * 2 + 1.2, BACKPLATE.halfZ * 2 + 1.2, 6), s.silk, "stroke", 0.2);
  p.text("BACKPLATE", -9, 47, 1.6, s.silk, { font: FONT_SANS, weight: 800, letterSpacing: 0.4 });
  for (const [x, z] of COOLER_HOLES) mountingRing(p, s, x, z, 2.0, 1.7, s.tin);
}

const PAINT_TOP = (p: Painter, s: PcbSurfaces) => timedPaint("cpu-mobo:top", () => paintTop(p, s));
const PAINT_BOTTOM = (p: Painter, s: PcbSurfaces) => timedPaint("cpu-mobo:bottom", () => paintBottom(p, s));

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

/** The board itself and its small passives (both faces). */
export function BoardSection() {
  return (
    <group position-y={BOARD_TOP}>
      <Board id="cpu-mobo" outline={BOARD_SHAPE} thickness={BOARD.t} mask="black" ppm={12} paintTop={PAINT_TOP} paintBottom={PAINT_BOTTOM} bump={0.45} />
    </group>
  );
}

export function BoardPassives() {
  return (
    <group>
      <group position-y={BOARD_TOP}>
        <SmdField items={BOARD_SMD.c0402} size="0402" kind="cap" />
        <SmdField items={BOARD_SMD.r0402} size="0402" kind="res" />
        <SmdField items={BOARD_SMD.c0603} size="0603" kind="cap" />
        <SmdField items={BOARD_SMD.c0201} size="0201" kind="cap" />
      </group>
      <group position-y={BOARD_TOP - BOARD.t} rotation-x={Math.PI}>
        <SmdField items={BACK_MLCC.map(([x, z, r]) => [x, -z, r] as SmdItem)} size="0402" kind="cap" />
        <SmdField items={BACK_BULK.map(([x, z, r]) => [x, -z, r] as SmdItem)} size="0805" kind="cap" />
      </group>
    </group>
  );
}

export function VrmStages() {
  return (
    <group position-y={BOARD_TOP}>
      {VRM_PHASES.map((ph, i) => (
        <Chip
          key={i}
          kind="qfn"
          size={[STAGE.w, STAGE.h, STAGE.d]}
          position={[ph.stageX, 0, ph.z]}
          pins={6}
          marking={{ lines: ["80A", "SPS"], pin1: true, scale: 1.1 }}
        />
      ))}
    </group>
  );
}

export function VrmChokes() {
  return (
    <group position-y={BOARD_TOP}>
      {VRM_PHASES.map((ph, i) => (
        <Choke key={i} position={[ph.chokeX, 0, ph.z]} size={[CHOKE.w, CHOKE.h, CHOKE.d]} label="R15" style="metal" />
      ))}
    </group>
  );
}

export function VrmCaps() {
  return (
    <group position-y={BOARD_TOP}>
      {BULK_CAPS.map(([x, z], i) => (
        <PolymerCap key={i} position={[x, 0, z]} radius={4} height={7.2} stripe="#3a3f8f" label="560" />
      ))}
    </group>
  );
}

/** Black plastic brackets that clip-on coolers hook onto (54 × 90 mm holes). */
export function CoolerBrackets() {
  const geo = useMemo(
    () =>
      cached("cpu-cooler-brackets", () => {
        const one: BufferGeometry[] = [];
        const add = (g: BufferGeometry) => one.push(g.index ? g.toNonIndexed() : g);
        add(roundedBox(67, 2.8, 9, 0.8).clone().translate(0, 1.4, -45));
        for (const x of [-27, 27]) {
          const boss = new CylinderGeometry(4.2, 4.4, 4.6, 28);
          boss.translate(x, 2.3, -45);
          add(boss);
        }
        // Centre tab with an outward catch for clip-on coolers.
        add(roundedBox(15, 8.4, 2.4, 0.5).clone().translate(0, 4.2, -48.3));
        add(roundedBox(10, 1.6, 1.6, 0.45).clone().translate(0, 7.0, -49.9));
        for (const x of [-6.6, 6.6]) add(roundedBox(1.4, 4.6, 4.6, 0.3).clone().translate(x, 2.3, -45.6));
        for (const x of [-18, -12, 12, 18]) add(roundedBox(1.2, 1.2, 8, 0.3).clone().translate(x, 3.0, -45));
        const back = mergeGeometries(one)!;
        const front = back.clone();
        front.rotateY(Math.PI);
        return mergeGeometries([back, front])!;
      }),
    [],
  );
  return (
    <group position-y={BOARD_TOP}>
      <mesh geometry={geo} material={MAT.plasticSatin} castShadow receiveShadow />
      {COOLER_HOLES.map(([x, z], i) => (
        <PanScrew key={i} position={[x, 4.6, z]} diameter={6.2} height={1.8} drive="phillips" material={MAT.steelDark} />
      ))}
    </group>
  );
}

let backplateMat: MeshPhysicalMaterial | null = null;

/** Steel backplate (bottom-most part) and the insulating sheet above it. */
export function Backplate() {
  const geo = useMemo(() => {
    const outline = roundedRectPoints(0, 0, BACKPLATE.halfX * 2, BACKPLATE.halfZ * 2, BACKPLATE.r);
    const window = roundedRectPoints(0, 0, BACKPLATE.windowX * 2, BACKPLATE.windowZ * 2, 2.5);
    const holes = [
      window,
      ...COOLER_HOLES.map(([x, z]) => circlePoints(x, z, 1.8, 20)),
      ...FRAME_SCREWS.map(([x, z]) => circlePoints(x, z, 1.3, 16)),
    ];
    return {
      plate: cached("cpu-backplate", () => extrudeY(shapeFrom(outline, holes), 0, BACKPLATE.t, 0.4)),
      sheet: cached("cpu-insulator", () =>
        extrudeY(
          shapeFrom(roundedRectPoints(0, 0, BACKPLATE.halfX * 2 - 1, BACKPLATE.halfZ * 2 - 1, BACKPLATE.r - 0.5), [window]),
          BACKPLATE.t,
          BACKPLATE.t + INSULATOR_T,
          0,
        ),
      ),
    };
  }, []);
  if (!backplateMat) {
    backplateMat = new MeshPhysicalMaterial({ color: "#1a1b1e", metalness: 0.55, roughness: 0.48, clearcoat: 0.3, clearcoatRoughness: 0.5 });
  }
  return (
    <group>
      <mesh geometry={geo.plate} material={backplateMat} castShadow receiveShadow />
      <mesh geometry={geo.sheet} material={MAT.plasticGloss} receiveShadow />
      {/* Threaded bosses for the cooler screws. */}
      {COOLER_HOLES.map(([x, z], i) => (
        <mesh key={i} geometry={boss()} material={backplateMat!} position={[x, BACKPLATE.t, z]} castShadow />
      ))}
    </group>
  );
}

function boss() {
  return cached("cpu-backplate-boss", () => {
    const g = new CylinderGeometry(1.95, 1.95, BOARD.t + INSULATOR_T, 20, 1, true);
    g.translate(0, (BOARD.t + INSULATOR_T) / 2, 0);
    return g;
  });
}
