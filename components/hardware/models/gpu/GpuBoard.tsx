"use client";

import { useMemo } from "react";
import { BoxGeometry, Shape } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { FONT_COND, FONT_SANS, rng, type Painter } from "@/lib/three/painter";
import { gpuDieShotMaterial } from "./dieMaterial";
import {
  bgaFanout,
  bgaLand,
  mountingRing,
  randomTraces,
  silk,
  silkOutline,
  smdPads,
  stitchRow,
  traceBus,
  viaField,
  type PcbSurfaces,
} from "@/lib/three/pcbPaint";
import { Part } from "../../Part";
import { Board } from "../../kit/Board";
import { Chip, FlipChip } from "../../kit/Chip";
import { DisplayPort, Hdmi, Power16Pin, WireHeader } from "../../kit/Connectors";
import { Screw } from "../../kit/Fasteners";
import { cached, circlePath, polygonShape } from "../../kit/geometry";
import { MAT } from "../../kit/materials";
import { Choke, PolymerCap, SmdField, TantalumCap, gridOf, ringOf, rowOf, scatterIn, type SmdItem } from "../../kit/Passives";
import {
  CHOKE,
  EDGE_HOLES,
  GPU,
  GPU_HOLES,
  INPUT_CAPS,
  MEM,
  MEMORY_CHIPS,
  MEM_VRM,
  PCB,
  PORTS,
  POWER_CONN,
  STAGE,
  VRM_PHASES,
} from "./layout";

type Rect = [number, number, number, number];

function pcbOutline() {
  const { x0, x1, z0, z1, tab } = PCB;
  const tz = z0 - tab.depth;
  const nx = tab.notchX;
  const s = polygonShape([
    [x0, z0 + 2],
    [x0 + 2, z0],
    [tab.x0 - 3, z0],
    [tab.x0 - 1, z0 - 2],
    [tab.x0, tz + 1],
    [tab.x0 + 1, tz],
    [nx - 0.95, tz],
    [nx - 0.95, z0 - 1.2],
    [nx + 0.95, z0 - 1.2],
    [nx + 0.95, tz],
    [tab.x1 - 1, tz],
    [tab.x1, tz + 1],
    [tab.x1 + 1, z0 - 2],
    [tab.x1 + 3, z0],
    [x1 - 2, z0],
    [x1, z0 + 2],
    [x1, z1 - 2],
    [x1 - 2, z1],
    [x0 + 2, z1],
    [x0, z1 - 2],
  ]);
  for (const [x, z] of [...GPU_HOLES, ...EDGE_HOLES]) s.holes.push(circlePath(x, z, 1.65));
  return s;
}

/** Footprints that random parts and traces must avoid. */
const KEEP_OUT: Rect[] = [
  [GPU.x - GPU.substrate / 2 - 1, GPU.z - GPU.substrate / 2 - 1, GPU.substrate + 2, GPU.substrate + 2],
  ...MEMORY_CHIPS.map(({ x, z, rot }): Rect => {
    const w = rot ? MEM.d : MEM.w;
    const d = rot ? MEM.w : MEM.d;
    return [x - w / 2 - 1, z - d / 2 - 1, w + 2, d + 2];
  }),
  ...[...VRM_PHASES, ...MEM_VRM].flatMap(({ stageX, chokeX, z }): Rect[] => [
    [stageX - STAGE.w / 2 - 1, z - STAGE.d / 2 - 1, STAGE.w + 2, STAGE.d + 2],
    [chokeX - CHOKE.w / 2 - 0.6, z - CHOKE.d / 2 - 0.6, CHOKE.w + 1.2, CHOKE.d + 1.2],
  ]),
  ...INPUT_CAPS.map(([x, z]): Rect => [x - 5, z - 5, 10, 10]),
  [POWER_CONN.x - 11, POWER_CONN.z - 11, 22, 13],
  ...PORTS.map(({ z }): Rect => [-147, z - 9.5, 16, 19]),
  [-14, -57, 48, 7],
  [-14, 50, 48, 7],
];

function paintTop(p: Painter, s: PcbSurfaces) {
  const rand = rng(7);
  const g = GPU;
  const half = g.substrate / 2;

  // --- Power planes (copper under mask) -----------------------------------
  p.roundRect(-17, -57, 69, 114, 2, s.copper);
  p.roundRect(-140, -30, 32, 50, 2, s.copper);
  // Clearance channels between VRM phases.
  for (const ph of VRM_PHASES) {
    p.rect(ph.chokeX - 7, ph.z + 6, 14, 0.5, s.mask);
  }
  p.rect(7.4, -57, 0.6, 114, s.mask);
  p.rect(33.6, -57, 0.6, 114, s.mask);

  // --- Board-edge stitching and mounting rings -----------------------------
  stitchRow(p, s, [[-144, -56.2], [PCB.tab.x0 - 3, -56.2]], 2.2);
  stitchRow(p, s, [[PCB.tab.x1 + 3, -56.2], [50, -56.2], [50.2, 56], [-144, 56.2], [-144.2, -54]], 2.2);
  for (const [x, z] of [...GPU_HOLES, ...EDGE_HOLES]) mountingRing(p, s, x, z, 1.65, 1.3, s.tin);

  // --- GPU land pattern & fan-out (visible when the package is lifted) -----
  bgaFanout(p, s, g.x, g.z, 47, 47, 1);
  bgaLand(p, s, g.x, g.z, 47, 47, 1, 0.5, { surface: s.tin });
  silkOutline(p, s, g.x - half - 0.8, g.z - half - 0.8, g.substrate + 1.6, g.substrate + 1.6, 0.2);
  silk(p, s, "U1", g.x - half + 3, g.z - half - 2.4, 1.6);

  // --- Memory buses + land patterns ---------------------------------------
  MEMORY_CHIPS.forEach((m, i) => {
    const w = m.rot ? MEM.d : MEM.w;
    const d = m.rot ? MEM.w : MEM.d;
    if (m.rot) {
      traceBus(p, s, [g.x - half, m.z * 0.8], [m.x + w / 2, m.z], 22, 0.36, 0.11, true);
    } else {
      const zEdge = m.z < 0 ? g.z - half : g.z + half;
      const zChip = m.z < 0 ? m.z + d / 2 : m.z - d / 2;
      const gx = Math.min(g.x + half - 3, Math.max(g.x - half + 3, g.x + (m.x - g.x) * 0.75));
      traceBus(p, s, [gx, zEdge], [m.x, zChip], 22, 0.36, 0.11, false);
    }
    bgaLand(p, s, m.x, m.z, m.rot ? 14 : 10, m.rot ? 10 : 14, 0.8, 0.42, { surface: s.tin, hollow: 0 });
    silkOutline(p, s, m.x - w / 2 - 0.6, m.z - d / 2 - 0.6, w + 1.2, d + 1.2, 0.15);
    const lx = m.rot ? m.x - w / 2 - 2.2 : m.x;
    const lz = m.rot ? m.z : m.z < 0 ? m.z - d / 2 - 1.8 : m.z + d / 2 + 1.8;
    silk(p, s, `M${i + 1}`, lx, lz, 1.2, m.rot ? -90 : 0);
  });

  // --- PCIe lanes from the GPU to the edge fingers --------------------------
  traceBus(p, s, [g.x - half, -18], [-77.5, -30], 16, 0.42, 0.11, true);
  for (let k = 0; k < 16; k++) {
    const o = (k - 7.5) * 0.42;
    const fx = -114 + k * 4.2;
    p.polyline(
      [
        [-77.5 + o, -30],
        [-77.5 + o, -50 - Math.abs(o) * 0.2],
        [fx, -53.5],
        [fx, -61.6],
      ],
      0.11,
      s.copper,
    );
    p.polyline(
      [
        [-77.5 + o + 0.2, -30],
        [-77.5 + o + 0.2, -50 - Math.abs(o) * 0.2],
        [fx + 1, -53.5],
        [fx + 1, -61.6],
      ],
      0.11,
      s.copper,
    );
  }

  // --- Display lanes to the outputs ---------------------------------------
  PORTS.forEach((port, i) => {
    traceBus(p, s, [-100, -30 + i * 20], [-134, port.z], 8, 0.38, 0.11, true);
    // Port footprint pads.
    for (let k = 0; k < 10; k++) p.rect(-138 + k * 0.6, port.z - 8.5, 0.32, 1.8, s.tin);
    silk(p, s, port.kind === "dp" ? `DP${i + 1}` : "HDMI1", -124, port.z + (i === 3 ? 10.5 : 9.5), 1.1);
  });

  // --- VRM footprints ---------------------------------------------------
  [...VRM_PHASES, ...MEM_VRM].forEach((ph, i) => {
    // Power stage: exposed pad + perimeter pads.
    p.rect(ph.stageX - 1.6, ph.z - 2, 3.2, 4, s.tin);
    for (let k = 0; k < 8; k++) {
      p.rect(ph.stageX - 2.4 + k * 0.62, ph.z - 3.3, 0.3, 0.7, s.tin);
      p.rect(ph.stageX - 2.4 + k * 0.62, ph.z + 2.6, 0.3, 0.7, s.tin);
    }
    // Choke: two large terminals.
    p.rect(ph.chokeX - 3, ph.z - CHOKE.d / 2 - 0.2, 6, 2.2, s.tin);
    p.rect(ph.chokeX - 3, ph.z + CHOKE.d / 2 - 2, 6, 2.2, s.tin);
    silk(p, s, `PL${i + 1}`, ph.chokeX + CHOKE.w / 2 + 1.6, ph.z, 0.9, -90);
    silk(p, s, `PQ${i + 1}`, ph.stageX, ph.z - 4.4, 0.75);
    viaField(p, s, ph.stageX - 2, ph.z - 2, 4, 4, 6, 100 + i, 0.18);
  });
  for (const [x, z] of INPUT_CAPS) {
    p.circle(x, z, 4.6, s.copper);
    p.rect(x - 4.4, z - 1.2, 2.6, 2.4, s.tin);
    p.rect(x + 1.8, z - 1.2, 2.6, 2.4, s.tin);
    silk(p, s, "+", x - 5.6, z - 3.4, 1.4);
  }

  // --- Scatter: random signal routing and vias in open areas -------------
  randomTraces(p, s, -144, -56, 50, 26, 40, 11);
  randomTraces(p, s, -144, 36, 50, 20, 30, 12);
  randomTraces(p, s, -70, 50, 50, 7, 14, 13);
  viaField(p, s, -144, -56, 196, 112, 900, 14, 0.18);

  // --- Passive footprints we actually place (see SmdField below) ---------
  for (const [x, z, r] of BOARD_PASSIVES.c0402) smdPads(p, s, x, z, 1, 0.5, r ?? 0);
  for (const [x, z, r] of BOARD_PASSIVES.r0402) smdPads(p, s, x, z, 1, 0.5, r ?? 0);

  // --- Silkscreen identity ----------------------------------------------
  p.text("PG-B136  REV 1.1", -78, 53.2, 2.3, s.silk, { font: FONT_SANS, weight: 800, letterSpacing: 0.3 });
  p.text("GDDR7 24GB 384-BIT  ·  E312789  94V-0  2431", -78, 56.2, 1.2, s.silk, { font: FONT_COND, weight: 600 });
  silk(p, s, "PCIE1", -84, -55, 1.3);
  silk(p, s, "J1  12V-2x6", POWER_CONN.x, POWER_CONN.z - 13.5, 1.2);
  silk(p, s, "BIOS", -104, -42.5, 1.1);
  silk(p, s, "FAN1", 44, -45, 1);
  silk(p, s, "FAN2", 35, -45, 1);
  // A few hand-drawn polarity marks and test points.
  for (let i = 0; i < 24; i++) {
    const x = -140 + rand() * 30;
    const z = -10 + rand() * 40;
    p.circle(x, z, 0.5, s.gold);
  }
}

function paintBottom(p: Painter, s: PcbSurfaces) {
  const g = GPU;
  p.roundRect(-140, -56, 190, 112, 2, s.copper);
  viaField(p, s, -144, -56, 196, 112, 1500, 21, 0.18);
  // Via array behind the GPU and the MLCC field.
  bgaFanout(p, s, g.x, g.z, 47, 47, 1);
  for (const [x, z] of BACK_MLCC) smdPads(p, s, x, z, 1, 0.5, 90);
  silkOutline(p, s, g.x - 14, g.z - 14, 28, 28, 0.2, false);
  // Retention bracket outline.
  p.polyline([[g.x - 32, -32], [g.x + 32, 32]], 0.25, s.silk);
  p.polyline([[g.x - 32, 32], [g.x + 32, -32]], 0.25, s.silk);
  for (const [x, z] of [...GPU_HOLES, ...EDGE_HOLES]) mountingRing(p, s, x, z, 1.65, 1.3, s.tin);
  // PCIe fingers are separate meshes; sticker with serial number & barcode.
  const lx = 10;
  const lz = -20;
  p.roundRect(lx, lz, 34, 16, 0.6, { color: "#f2f1ec", rough: 0.6, metal: 0, height: 0.75 });
  const ink = { color: "#111", rough: 0.6, metal: 0, height: 0.76 };
  p.text("S/N  2431A0089321", lx + 2, lz + 3.6, 2, ink, { font: FONT_COND, weight: 700 });
  const r = rng(5);
  let bx = lx + 2;
  while (bx < lx + 32) {
    const bw = 0.2 + r() * 0.6;
    p.rect(bx, lz + 5.5, bw, 6.5, ink);
    bx += bw + 0.2 + r() * 0.5;
  }
  p.text("MADE IN TAIWAN", lx + 2, lz + 14.5, 1.4, ink, { font: FONT_SANS, weight: 700 });
}

/** Small support ICs (level shifters, sensors, controllers) with their own decoupling. */
const SMALL_ICS: { x: number; z: number; kind: "qfn" | "sot" | "soic"; size: [number, number, number]; lines: string[] }[] = [
  { x: -110, z: 28, kind: "qfn", size: [4, 0.8, 4], lines: ["PS8461", "2431"] },
  { x: -110, z: -28, kind: "qfn", size: [4, 0.8, 4], lines: ["PS8461", "2431"] },
  { x: -124, z: 44, kind: "qfn", size: [5, 0.8, 5], lines: ["HDMI", "RTMR"] },
  { x: -132, z: -44, kind: "sot", size: [2.9, 1.1, 1.6], lines: ["A7W"] },
  { x: 38, z: -40, kind: "qfn", size: [4, 0.8, 4], lines: ["ITE", "8915"] },
  { x: -30, z: 52, kind: "sot", size: [2.9, 1.1, 1.6], lines: ["L4"] },
  { x: -92, z: -50, kind: "soic", size: [4.9, 1.45, 3.9], lines: ["24C02", "EEP"] },
];

// Passive positions are computed once and used for both painting and 3D.
const BOARD_PASSIVES = (() => {
  const g = GPU;
  const c0402: SmdItem[] = [];
  const r0402: SmdItem[] = [];
  const c0603: SmdItem[] = [];
  // Decoupling ring around the GPU package.
  c0402.push(...ringOf(g.x, g.z, g.substrate + 5, g.substrate + 5, 14));
  // Caps along the outer edge of each memory chip.
  for (const m of MEMORY_CHIPS) {
    if (m.rot) c0402.push(...rowOf(m.x - MEM.d / 2 - 2, m.z - 5, m.x - MEM.d / 2 - 2, m.z + 5, 5, 0));
    else {
      const z = m.z < 0 ? m.z - MEM.d / 2 - 1.6 : m.z + MEM.d / 2 + 1.6;
      c0402.push(...rowOf(m.x - 4.5, z, m.x + 4.5, z, 4, 90));
    }
  }
  // Bootstrap caps / gate resistors at each power stage.
  for (const ph of [...VRM_PHASES, ...MEM_VRM]) {
    c0603.push([ph.stageX - 3.7, ph.z - 1.2, 90], [ph.stageX - 3.7, ph.z + 1.4, 90]);
    r0402.push([ph.stageX + 3.4, ph.z + 2, 90]);
  }
  // Each small IC gets a neat cluster of decoupling caps and pull-up resistors.
  SMALL_ICS.forEach((ic, i) => {
    const off = ic.size[0] / 2 + 1.4;
    c0402.push(...rowOf(ic.x - off, ic.z - 1.5, ic.x - off, ic.z + 1.5, 3, 0));
    r0402.push(...rowOf(ic.x + off, ic.z - 1, ic.x + off, ic.z + 1, 2 + (i % 2), 0));
  });
  // Tidy rows of filtering caps along the memory power plane and the bracket.
  c0402.push(...gridOf(-106, 15, 2, 6, 1.4, 1.3, 90));
  c0402.push(...gridOf(-136, 30, 3, 4, 1.4, 1.3, 90));
  r0402.push(...gridOf(-136, -30, 3, 4, 1.4, 1.3, 90));
  c0603.push(...rowOf(-120, -40, -100, -40, 8, 90));
  c0603.push(...rowOf(-6, 46.5, 30, 46.5, 12, 90));
  c0603.push(...rowOf(-6, -46.5, 30, -46.5, 12, 90));
  // A sprinkling of stragglers, as on any real board.
  const avoid: Rect[] = [
    ...KEEP_OUT,
    ...SMALL_ICS.map((ic): Rect => [ic.x - ic.size[0] / 2 - 3, ic.z - ic.size[2] / 2 - 2, ic.size[0] + 6, ic.size[2] + 4]),
    [-104 - 3.5, -47 - 3, 7, 6],
    [-80, 50, 50, 8],
  ];
  r0402.push(...scatterIn([-144, -56, 196, 112], 40, 3, avoid, 1.2));
  c0402.push(...scatterIn([-144, -56, 196, 112], 50, 4, avoid, 1.2));
  return { c0402, r0402, c0603 };
})();

const BACK_MLCC: SmdItem[] = [
  ...gridOf(GPU.x, GPU.z, 13, 11, 1.6, 1.9, 90),
  ...gridOf(GPU.x, GPU.z - 19.5, 10, 2, 1.6, 1.6, 90),
  ...gridOf(GPU.x, GPU.z + 19.5, 10, 2, 1.6, 1.6, 90),
];

const BOARD_SHAPE = pcbOutline();



/** PCIe x16 gold fingers on both faces of the tab. */
function PcieFingers() {
  const geo = useMemo(
    () =>
      cached("pcie-fingers", () => {
        const parts: BoxGeometry[] = [];
        const tz = PCB.z0 - PCB.tab.depth;
        const add = (x: number, long: boolean) => {
          const len = long ? 4.2 : 3.2;
          for (const y of [0.02, -1.62]) {
            const b = new BoxGeometry(0.7, 0.04, len);
            b.translate(x, y, tz + 0.6 + len / 2);
            parts.push(b);
          }
        };
        for (let i = 0; i < 11; i++) add(-126.5 + i, i % 3 !== 1);
        for (let i = 0; i < 71; i++) add(-113.3 + i, i % 4 !== 2);
        return mergeGeometries(parts)!;
      }),
    [],
  );
  return <mesh geometry={geo} material={MAT.gold} />;
}

/** Cross-shaped spring bracket on the back that clamps the cooler to the GPU. */
function RetentionBracket() {
  const geo = useMemo(
    () =>
      cached("x-bracket", () => {
        const parts: BoxGeometry[] = [];
        // Open square frame around the MLCC field…
        for (const [w, d, x, z] of [
          [32, 3.5, 0, -14.25],
          [32, 3.5, 0, 14.25],
          [3.5, 25, -14.25, 0],
          [3.5, 25, 14.25, 0],
        ]) {
          const b = new BoxGeometry(w, 1.2, d);
          b.translate(x, 0, z);
          parts.push(b);
        }
        // …and four sprung arms out to the screw holes.
        for (const [sx, sz] of [
          [1, 1],
          [1, -1],
          [-1, 1],
          [-1, -1],
        ]) {
          const arm = new BoxGeometry(22, 1.2, 6);
          arm.rotateY(Math.atan2(-sz, sx));
          arm.translate(sx * 22, 0, sz * 22);
          parts.push(arm);
        }
        return mergeGeometries(parts)!;
      }),
    [],
  );
  return (
    <group position={[GPU.x, -1.6 - 0.7, GPU.z]}>
      <mesh geometry={geo} material={MAT.steelDark} castShadow receiveShadow />
      {GPU_HOLES.map(([x, z], i) => (
        <Screw key={i} position={[x - GPU.x, -0.6, z - GPU.z]} rotation={[Math.PI, 0, 0]} diameter={6} height={2.2} />
      ))}
    </group>
  );
}

export function GpuBoard() {
  return (
    <>
      <Board id="gpu-pcb" outline={BOARD_SHAPE} mask="black" ppm={10} paintTop={paintTop} paintBottom={paintBottom} bump={0.5} />

      <Part id="gpu-package" position={[GPU.x, 0, GPU.z]} explode={[0, 14, 0]} explodeRange={[0.5, 1]}>
        <FlipChip
          substrate={[GPU.substrate, GPU.substrateT, GPU.substrate]}
          die={GPU.die}
          dieMarking={["GPU-102-A1", "TAIWAN 2431", "A07B2H.00"]}
          ballPitch={1}
          dieId="gpu-die"
          substrateId="gpu-substrate"
          dieShot={gpuDieShotMaterial()}
          dieExplode={{ lift: 16, flip: true, range: [0.6, 1] }}
        />
        <group position-y={0.45 + GPU.substrateT}>
          <SmdField items={ringOf(0, 0, GPU.die[0] + 4, GPU.die[2] + 4, 9)} size="0201" />
          <SmdField items={ringOf(0, 0, 44, 44, 6)} size="0402" />
        </group>
      </Part>

      <Part id="vram" explode={[0, 8, 0]} explodeRange={[0.5, 1]}>
        {MEMORY_CHIPS.map((m, i) => (
          <Chip
            key={i}
            size={[MEM.w, MEM.h, MEM.d]}
            position={[m.x, 0, m.z]}
            rotation={m.rot ? [0, Math.PI / 2, 0] : undefined}
            marking={{ lines: ["G7 16Gb", "x32 32Gbps", `2431 ${String.fromCharCode(65 + i)}${i + 3}`], logo: "dot-ring" }}
            balls={{ pitch: 0.8 }}
          />
        ))}
      </Part>

      <Part id="vrm">
        <Part id="power-stages" explode={[0, 6, 0]} explodeRange={[0.5, 1]}>
          {[...VRM_PHASES, ...MEM_VRM].map((ph, i) => (
            <Chip
              key={i}
              kind="qfn"
              size={[STAGE.w, STAGE.h, STAGE.d]}
              position={[ph.stageX, 0, ph.z]}
              pins={6}
              marking={{ lines: ["70A", "SPS"], pin1: true, scale: 1.1 }}
            />
          ))}
        </Part>
        <Part id="chokes" explode={[0, 10, 0]} explodeRange={[0.5, 1]}>
          {[...VRM_PHASES, ...MEM_VRM].map((ph, i) => (
            <Choke key={i} position={[ph.chokeX, 0, ph.z]} size={[CHOKE.w, CHOKE.h, CHOKE.d]} label="R22" />
          ))}
        </Part>
        <Part id="output-caps" explode={[0, 7, 0]} explodeRange={[0.5, 1]}>
          {rowOf(-9, -53.3, 29, -53.3, 5).map(([x, z], i) => (
            <TantalumCap key={`a${i}`} position={[x, 0, z]} label={["470", "2.5V"]} />
          ))}
          {rowOf(-9, 53.3, 29, 53.3, 5).map(([x, z], i) => (
            <TantalumCap key={`b${i}`} position={[x, 0, z]} label={["470", "2.5V"]} />
          ))}
        </Part>
        <Part id="input-caps" explode={[0, 9, 0]} explodeRange={[0.5, 1]}>
          {INPUT_CAPS.map(([x, z], i) => (
            <PolymerCap key={i} position={[x, 0, z]} radius={4} height={7.6} stripe="#4a2a7a" label="270" />
          ))}
        </Part>
        <Part id="pwm-controller" explode={[0, 6, 0]} explodeRange={[0.5, 1]}>
          <Chip kind="qfn" size={[6, 0.9, 6]} position={[45, 0, -30]} pins={10} marking={{ lines: ["uP9512", "R2431"], logo: "triangle" }} />
        </Part>
      </Part>

      <Part id="power-connector" explode={[0, 6, 6]} explodeRange={[0.5, 1]}>
        <Power16Pin position={[POWER_CONN.x, 0, 58.2]} />
      </Part>

      <Part id="pcie-connector">
        <PcieFingers />
      </Part>

      <Part id="display-outputs" explode={[-10, 0, 0]} explodeRange={[0.5, 1]}>
        {PORTS.map((port, i) =>
          port.kind === "dp" ? (
            <DisplayPort key={i} position={[-149.4, 0, port.z]} rotation={[0, -Math.PI / 2, 0]} />
          ) : (
            <Hdmi key={i} position={[-149.4, 0, port.z]} rotation={[0, -Math.PI / 2, 0]} />
          ),
        )}
      </Part>

      <Part id="bios-chip" explode={[0, 5, 0]} explodeRange={[0.5, 1]}>
        <Chip kind="soic" size={[4.9, 1.45, 3.9]} position={[-104, 0, -47]} pins={4} marking={{ lines: ["25Q16", "2431"], logo: "wave", scale: 1.1 }} />
      </Part>

      <Part id="fan-headers" explode={[0, 5, 0]} explodeRange={[0.5, 1]}>
        <WireHeader pins={4} position={[44, 0, -49]} />
        <WireHeader pins={4} position={[35, 0, -49]} />
        <WireHeader pins={3} position={[44, 0, -40]} material={MAT.plasticBlack} />
      </Part>

      <Part id="support-ics" explode={[0, 5, 0]} explodeRange={[0.5, 1]}>
        {SMALL_ICS.map((ic, i) => (
          <Chip key={i} kind={ic.kind} size={ic.size} position={[ic.x, 0, ic.z]} pins={ic.kind === "soic" ? 4 : ic.kind === "sot" ? 2 : 5} marking={{ lines: ic.lines, scale: 1.2 }} />
        ))}
      </Part>

      <Part id="smd-passives">
        <SmdField items={BOARD_PASSIVES.c0402} size="0402" kind="cap" />
        <SmdField items={BOARD_PASSIVES.r0402} size="0402" kind="res" />
        <SmdField items={BOARD_PASSIVES.c0603} size="0603" kind="cap" />
      </Part>

      <Part id="back-mlcc">
        <group position-y={-1.6} rotation-x={Math.PI}>
          <SmdField items={BACK_MLCC.map(([x, z, r]) => [x, -z, r])} size="0402" kind="cap" />
        </group>
      </Part>

      <Part id="retention-bracket" explode={[0, -8, 0]} explodeRange={[0.5, 1]}>
        <RetentionBracket />
      </Part>
    </>
  );
}

export { BOARD_SHAPE };
export type { Shape };
