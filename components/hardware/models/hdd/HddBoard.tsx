"use client";

import { useMemo } from "react";
import { BoxGeometry, ExtrudeGeometry, Path, Shape, type Material } from "three";
import { FONT_COND, FONT_MONO, FONT_SANS, rng, type Painter } from "@/lib/three/painter";
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
import { Chip } from "../../kit/Chip";
import { cached, roundedBox } from "../../kit/geometry";
import { MAT } from "../../kit/materials";
import { Choke, SmdField, TantalumCap, gridOf, ringOf, rowOf, scatterIn, type SmdItem } from "../../kit/Passives";
import { TorxScrews } from "./Screws";
import { arcPts, merge, shapeOf, type Pt } from "./geom";
import { BOTTOM_HOLES, BRACKET, DRIVE, PCB, POCKET, SATA, SPINDLE, Y } from "./layout";
import { HM } from "./materials";

type Rect = [number, number, number, number];

// ---------------------------------------------------------------------------
// Layout of the controller board (board space = world X/Z of the assembled drive)
// ---------------------------------------------------------------------------

const SOC = { x: 21, z: -4, w: 13, d: 13 };
const DRAM = { x: 1.5, z: -25, w: 8, d: 13 };
const MOTOR_IC = { x: 9, z: 25, w: 9, d: 9 };
const FLASH = { x: 39, z: 21, w: 4.9, d: 3.9 };
const SHOCK = { x: 45, z: 33, w: 3, d: 3 };
const XTAL = { x: 35.5, z: -10.5, w: 3.2, d: 2.5 };
const HSA_CONN = { x: BRACKET.x, z: BRACKET.z, w: 3.6, d: 11 };
const CONTACTS = { x: -7.2, z: 18.5 };
const MOSFETS: [number, number][] = [
  [-3.5, 37.5],
  [6.5, 38.5],
];
const TVS: [number, number][] = [
  [59.5, -27],
  [59.5, -21.5],
];
const TANTS: [number, number][] = [
  [52.5, 14],
  [52.5, 20.5],
];
const CHOKES: [number, number][] = [
  [23, 33],
  [30.5, 33],
];
const SCREWS: [number, number][] = [
  [-5.5, 37.8],
  [-5.5, -38],
  [47.5, 43.5],
  [44.5, -43.5],
  [66.5, 36.5],
  [66.5, -40],
];

// ---------------------------------------------------------------------------
// Outline
// ---------------------------------------------------------------------------

function boardOutline(): Shape {
  const { x0, x1, z0, z1, tongueX, notchR } = PCB;
  const bossR = 4.2;
  const front = BOTTOM_HOLES.filter(([x]) => Math.abs(x - x0) < 2).map(([x, z]) => [x, z] as Pt);
  const mid = BOTTOM_HOLES.filter(([x]) => x > 20).map(([x]) => x)[0];
  const fx = front[0][0];
  const fdz = Math.sqrt(bossR * bossR - (x0 - fx) ** 2);
  const ndz = Math.sqrt(notchR * notchR - (x0 - SPINDLE.x) ** 2);
  const na = Math.atan2(ndz, x0 - SPINDLE.x);
  const cr = 5.5;
  const t0 = POCKET.z0 + 0.6;
  const t1 = POCKET.z1 - 0.6;
  const pts: Pt[] = [
    // bottom edge (z0), front → rear, around the bottom-hole bosses
    ...arcPts(fx, z0 - 0.02, bossR, Math.PI / 2 - 0.06, 0, 6),
    ...arcPts(mid, z0 - 0.02, bossR, Math.PI, 0, 14),
    ...arcPts(x1 - cr, z0 + cr, cr, -Math.PI / 2, 0, 6),
    // rear edge with the connector tongue
    [x1, t0],
    [tongueX, t0],
    [tongueX, t1],
    [x1, t1],
    ...arcPts(x1 - cr, z1 - cr, cr, 0, Math.PI / 2, 6),
    // top edge, rear → front
    ...arcPts(mid, z1 + 0.02, bossR, 0, -Math.PI, 14),
    ...arcPts(fx, z1 + 0.02, bossR, 0, -Math.PI / 2 + 0.06, 6),
    // front edge with the motor notch
    [x0, z1 - fdz],
    ...arcPts(SPINDLE.x, SPINDLE.z, notchR, na, -na, 30),
    [x0, z0 + fdz],
  ];
  const s = shapeOf(pts);
  for (const [x, z] of SCREWS) {
    const h = new Path();
    h.absarc(x, z, 1.3, 0, Math.PI * 2, true);
    s.holes.push(h);
  }
  return s;
}

const BOARD_SHAPE = boardOutline();

// ---------------------------------------------------------------------------
// Painting
// ---------------------------------------------------------------------------

/** Footprints the random routing and scattered parts must avoid. */
const KEEP_OUT: Rect[] = [
  [SOC.x - SOC.w / 2 - 1.5, SOC.z - SOC.d / 2 - 1.5, SOC.w + 3, SOC.d + 3],
  [DRAM.x - DRAM.w / 2 - 1.5, DRAM.z - DRAM.d / 2 - 1.5, DRAM.w + 3, DRAM.d + 3],
  [MOTOR_IC.x - MOTOR_IC.w / 2 - 1.5, MOTOR_IC.z - MOTOR_IC.d / 2 - 1.5, MOTOR_IC.w + 3, MOTOR_IC.d + 3],
  [FLASH.x - 4, FLASH.z - 3.5, 8, 7],
  [HSA_CONN.x - 3, HSA_CONN.z - 6.5, 6, 13],
  [CONTACTS.x - 3, CONTACTS.z - 4, 6, 8],
  [62, POCKET.z0, 12, POCKET.z1 - POCKET.z0],
  ...MOSFETS.map(([x, z]): Rect => [x - 3.5, z - 4, 7, 8]),
  ...TVS.map(([x, z]): Rect => [x - 2.5, z - 2, 5, 4]),
  ...TANTS.map(([x, z]): Rect => [x - 3, z - 2.5, 6, 5]),
  ...CHOKES.map(([x, z]): Rect => [x - 3, z - 3, 6, 6]),
  ...SCREWS.map(([x, z]): Rect => [x - 2.5, z - 2.5, 5, 5]),
  [SHOCK.x - 2.5, SHOCK.z - 2.5, 5, 5],
  [XTAL.x - 2.5, XTAL.z - 2, 5, 4],
];

function paintTop(p: Painter, s: PcbSurfaces) {
  const r = rng(41);
  // Ground and power pours.
  p.roundRect(-11, -46.5, 33, 22, 2, s.copper);
  p.roundRect(40, -46, 29, 40, 2, s.copper);
  p.roundRect(-11, 30, 40, 16.5, 2, s.copper);
  stitchRow(p, s, [[-11.2, -46.8], [69, -46.8], [69.2, 46.8], [-4, 46.8]], 2.4);

  // BGA land patterns (visible when the packages lift off).
  bgaLand(p, s, SOC.x, SOC.z, 15, 15, 0.8, 0.4, { surface: s.tin, hollow: 5 });
  bgaFanout(p, s, SOC.x, SOC.z, 15, 15, 0.8);
  silkOutline(p, s, SOC.x - SOC.w / 2 - 0.6, SOC.z - SOC.d / 2 - 0.6, SOC.w + 1.2, SOC.d + 1.2, 0.18);
  silk(p, s, "U1", SOC.x - SOC.w / 2 + 1.5, SOC.z - SOC.d / 2 - 1.9, 1.3);
  bgaLand(p, s, DRAM.x, DRAM.z, 9, 16, 0.8, 0.38, { surface: s.tin });
  silkOutline(p, s, DRAM.x - DRAM.w / 2 - 0.5, DRAM.z - DRAM.d / 2 - 0.5, DRAM.w + 1, DRAM.d + 1, 0.15);
  silk(p, s, "U2", DRAM.x + DRAM.w / 2 + 2.2, DRAM.z - DRAM.d / 2 + 1, 1.2);

  // Memory bus between controller and DRAM; read-channel lines to the head-stack connector;
  // SATA differential pairs; motor-control lines.
  traceBus(p, s, [SOC.x - SOC.w / 2, SOC.z - 4], [DRAM.x + DRAM.w / 2, DRAM.z + 2], 16, 0.36, 0.11, true);
  traceBus(p, s, [SOC.x - 3, SOC.z - SOC.d / 2], [DRAM.x + 1, DRAM.z + DRAM.d / 2], 10, 0.36, 0.11, false);
  traceBus(p, s, [SOC.x + SOC.w / 2, SOC.z - 2], [HSA_CONN.x - 2, HSA_CONN.z], 12, 0.38, 0.12, true);
  for (let k = 0; k < 2; k++) {
    const z = SATA.data.z - 1.2 + k * 2.4;
    p.polyline([[SOC.x + SOC.w / 2, SOC.z + 3 + k * 1.2], [44, SOC.z + 3 + k * 1.2], [50, z], [66, z]], 0.14, s.copper);
    p.polyline([[SOC.x + SOC.w / 2, SOC.z + 3.35 + k * 1.2], [44, SOC.z + 3.35 + k * 1.2], [50, z + 0.35], [66, z + 0.35]], 0.14, s.copper);
  }
  traceBus(p, s, [SOC.x - 2, SOC.z + SOC.d / 2], [MOTOR_IC.x + 2, MOTOR_IC.z - MOTOR_IC.d / 2], 8, 0.4, 0.12, false);
  traceBus(p, s, [MOTOR_IC.x - MOTOR_IC.w / 2, MOTOR_IC.z], [CONTACTS.x + 2, CONTACTS.z], 4, 0.9, 0.5, true);
  traceBus(p, s, [MOTOR_IC.x + MOTOR_IC.w / 2, MOTOR_IC.z - 2], [HSA_CONN.x - 2, HSA_CONN.z + 4], 4, 0.8, 0.45, true);
  traceBus(p, s, [SOC.x + 2, SOC.z + SOC.d / 2], [FLASH.x - 2.5, FLASH.z], 4, 0.4, 0.12, false);

  // Footprints for the parts placed below.
  for (const [x, z] of TVS) smdPads(p, s, x, z, 3.6, 1.6, 0);
  for (const [x, z] of TANTS) smdPads(p, s, x, z, 3.8, 2.4, 0);
  for (const [x, z] of MOSFETS) p.rect(x - 2.4, z - 2.2, 4.8, 4.4, s.tin);
  for (const [x, z] of SCREWS) mountingRing(p, s, x, z, 1.3, 1.1, s.tin);
  for (const [x, z, rr] of [...BOARD_PASSIVES.c0402, ...BOARD_PASSIVES.r0402]) smdPads(p, s, x, z, 1, 0.5, rr ?? 0);
  for (const [x, z, rr] of BOARD_PASSIVES.c0603) smdPads(p, s, x, z, 1.6, 0.8, rr ?? 0);
  // Spindle-motor contact pads and the head-stack connector land.
  for (let i = 0; i < 4; i++) p.roundRect(CONTACTS.x - 1.2, CONTACTS.z - 3.3 + i * 1.75, 2.4, 1.2, 0.3, s.gold);
  for (let i = 0; i < 14; i++) p.rect(HSA_CONN.x - 1.6 + (i % 2) * 2.2, HSA_CONN.z - 5 + Math.floor(i / 2) * 1.5, 1.0, 0.7, s.tin);
  // SATA connector solder tails on the tongue.
  for (let i = 0; i < 22; i++) {
    const z = i < 7 ? SATA.data.z - 3.8 + i * 1.27 : SATA.power.z - 9 + (i - 7) * 1.27;
    p.rect(65.2, z - 0.3, 1.6, 0.6, s.tin);
  }
  // Test points along the edges (probed during manufacturing).
  for (let i = 0; i < 26; i++) p.circle(-8 + r() * 70, -44 + r() * 6, 0.45, s.gold);

  randomTraces(p, s, -10, -16, 22, 12, 22, 43);
  randomTraces(p, s, 30, 8, 26, 22, 22, 44);
  randomTraces(p, s, 14, -46, 34, 14, 20, 45);
  viaField(p, s, -11, -46, 80, 92, 520, 46, 0.17);

  // Silkscreen.
  p.text("HDA PCBA  2060-801734-A01  REV A", 14, 44.8, 1.7, s.silk, { font: FONT_SANS, weight: 700 });
  p.text("94V-0  E188923  2611", 14, 42.6, 1.05, s.silk, { font: FONT_COND, weight: 600 });
  silk(p, s, "U3", MOTOR_IC.x, MOTOR_IC.z - MOTOR_IC.d / 2 - 1.6, 1.2);
  silk(p, s, "U4", FLASH.x, FLASH.z + 3.4, 1.0);
  silk(p, s, "J1 SATA", 61.5, SATA.power.z + 9, 1.1, -90);
  silk(p, s, "J2 HDA", HSA_CONN.x - 3.6, HSA_CONN.z, 1.0, -90);
  silk(p, s, "SPM", CONTACTS.x, CONTACTS.z - 4.8, 1.0);
  silk(p, s, "Y1", XTAL.x, XTAL.z - 2.4, 0.9);
  silk(p, s, "SH1", SHOCK.x, SHOCK.z + 2.6, 0.9);
}

function paintBottom(p: Painter, s: PcbSurfaces) {
  const r = rng(52);
  p.roundRect(-11, -46.5, 80, 93, 3, s.copper);
  viaField(p, s, -11, -46, 80, 92, 700, 53, 0.17);
  for (const [x, z] of SCREWS) mountingRing(p, s, x, z, 1.3, 1.1, s.tin);
  // Rows of test pads used by the factory's bed-of-nails tester.
  for (let i = 0; i < 90; i++) {
    const x = -6 + (i % 15) * 4.3 + r() * 0.6;
    const z = -32 + Math.floor(i / 15) * 7.5 + r() * 0.6;
    p.circle(x, z, 0.65, s.gold);
  }
  // Serial-number sticker with a barcode.
  const lx = 26;
  const lz = 18;
  p.roundRect(lx, lz, 34, 14, 0.6, { color: "#f2f1ec", rough: 0.6, metal: 0, height: 0.75 });
  const ink = { color: "#121212", rough: 0.6, metal: 0, height: 0.76 };
  p.text("PCBA S/N  B26T0447A9", lx + 2, lz + 3.4, 1.8, ink, { font: FONT_MONO, weight: 600 });
  let bx = lx + 2;
  while (bx < lx + 32) {
    const bw = 0.2 + r() * 0.5;
    p.rect(bx, lz + 5, bw, 7, ink);
    bx += bw + 0.18 + r() * 0.4;
  }
}

// Passive positions shared by painting (pads) and 3D (parts).
const BOARD_PASSIVES = (() => {
  const c0402: SmdItem[] = [];
  const r0402: SmdItem[] = [];
  const c0603: SmdItem[] = [];
  c0402.push(...ringOf(SOC.x, SOC.z, SOC.w + 3.4, SOC.d + 3.4, 7));
  c0402.push(...rowOf(DRAM.x - DRAM.w / 2 - 1.6, DRAM.z - 5, DRAM.x - DRAM.w / 2 - 1.6, DRAM.z + 5, 6, 0));
  c0402.push(...rowOf(MOTOR_IC.x - 4, MOTOR_IC.z + MOTOR_IC.d / 2 + 1.6, MOTOR_IC.x + 4, MOTOR_IC.z + MOTOR_IC.d / 2 + 1.6, 6, 90));
  c0603.push(...rowOf(MOTOR_IC.x + MOTOR_IC.w / 2 + 1.8, MOTOR_IC.z - 3.5, MOTOR_IC.x + MOTOR_IC.w / 2 + 1.8, MOTOR_IC.z + 3.5, 5, 0));
  c0402.push(...rowOf(FLASH.x - 3, FLASH.z - 3.2, FLASH.x + 3, FLASH.z - 3.2, 3, 90));
  r0402.push(...rowOf(HSA_CONN.x - 3.4, HSA_CONN.z - 4.5, HSA_CONN.x - 3.4, HSA_CONN.z + 4.5, 6, 0));
  c0603.push(...gridOf(56.5, -12.5, 2, 4, 2.0, 1.6, 90));
  c0402.push(...gridOf(XTAL.x + 3.6, XTAL.z, 1, 3, 1.4, 1.2, 90));
  const avoid: Rect[] = [...KEEP_OUT, [10, 40, 30, 7]];
  r0402.push(...scatterIn([-10, -45, 70, 90], 34, 7, avoid, 1.0));
  c0402.push(...scatterIn([-10, -45, 70, 90], 46, 8, avoid, 1.0));
  return { c0402, r0402, c0603 };
})();

// ---------------------------------------------------------------------------
// SATA connectors
// ---------------------------------------------------------------------------

/**
 * Serial-ATA device plug: a black shroud open to the rear with an L-keyed
 * tongue carrying the gold contacts. Built opening toward +X at x = 0, sitting
 * on y = 0, centred on z.
 */
function SataPlug({ width, pins, position, keyLeft }: { width: number; pins: number; position: [number, number, number]; keyLeft: boolean }) {
  const h = 5.4;
  const depth = 7.2;
  const geos = useMemo(
    () => ({
      shell: cached(`hdd-sata-shell:${width}`, () => {
        // Front outline with the mating cavity, extruded back from the face.
        const o = new Shape();
        o.moveTo(-width / 2, 0);
        o.lineTo(width / 2, 0);
        o.lineTo(width / 2, h);
        o.lineTo(-width / 2, h);
        o.closePath();
        const cav = new Path();
        cav.moveTo(-width / 2 + 0.9, 0.9);
        cav.lineTo(-width / 2 + 0.9, h - 0.9);
        cav.lineTo(width / 2 - 0.9, h - 0.9);
        cav.lineTo(width / 2 - 0.9, 0.9);
        cav.closePath();
        o.holes.push(cav);
        const g = new ExtrudeGeometry(o, { depth: depth - 1.2, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.2, bevelOffset: -0.2, bevelSegments: 1 });
        g.translate(0, 0, -(depth - 1.2) - 0.2);
        return g;
      }),
      back: cached(`hdd-sata-back:${width}`, () => new BoxGeometry(width, h, 1.4).translate(0, h / 2, -depth + 0.7)),
      tongue: cached(`hdd-sata-tongue:${width}:${keyLeft}`, () => {
        const t = new BoxGeometry(width - 3.4, 1.1, depth - 1.6).translate(0, h * 0.6, -(depth - 1.6) / 2 - 0.5);
        // The "L": a short leg at one end that keys the cable the right way round.
        const k = new BoxGeometry(1.1, 1.7, depth - 1.6).translate((keyLeft ? -1 : 1) * ((width - 3.4) / 2 - 0.55), h * 0.6 - 1.2, -(depth - 1.6) / 2 - 0.5);
        return merge([t, k]);
      }),
      contacts: cached(`hdd-sata-contacts:${width}:${pins}`, () => {
        const parts = [];
        const pitch = 1.27;
        for (let i = 0; i < pins; i++) {
          const long = i === 0 || i === 3 || i === pins - 1;
          const b = new BoxGeometry(0.65, 0.05, long ? 4.6 : 3.8);
          b.translate((i - (pins - 1) / 2) * pitch, h * 0.6 - 0.58, -(long ? 2.6 : 3.0));
          parts.push(b);
        }
        return merge(parts);
      }),
    }),
    [width, pins, keyLeft],
  );
  return (
    <group position={position} rotation={[0, Math.PI / 2, 0]}>
      <mesh geometry={geos.shell} material={MAT.plasticBlack} castShadow receiveShadow />
      <mesh geometry={geos.back} material={MAT.plasticBlack} castShadow />
      <mesh geometry={geos.tongue} material={MAT.plasticBlack} />
      <mesh geometry={geos.contacts} material={MAT.gold} />
    </group>
  );
}

/** Spring-finger contacts that touch the spindle motor's flex tail through the floor. */
function SpindleContacts() {
  const geo = useMemo(
    () =>
      cached("hdd-spindle-contacts", () => {
        const parts = [];
        for (let i = 0; i < 4; i++) {
          const z = CONTACTS.z - 2.7 + i * 1.75;
          parts.push(new BoxGeometry(1.8, 0.12, 0.8).translate(CONTACTS.x, 0.06, z));
          const arm = new BoxGeometry(2.0, 0.1, 0.6);
          arm.rotateZ(0.55);
          arm.translate(CONTACTS.x + 0.6, 0.6, z);
          parts.push(arm);
        }
        return merge(parts);
      }),
    [],
  );
  return (
    <group>
      <mesh geometry={roundedBox(3.4, 0.8, 8.4, 0.25)} material={MAT.plasticWhite} position={[CONTACTS.x - 0.9, 0.4, CONTACTS.z - 0.1]} castShadow />
      <mesh geometry={geo} material={MAT.gold} />
    </group>
  );
}

/** Board-side half of the head-stack connector (mates with the bracket through the floor). */
function HsaConnector() {
  return (
    <group position={[HSA_CONN.x, 0, HSA_CONN.z]}>
      <mesh geometry={roundedBox(HSA_CONN.w, 1.6, HSA_CONN.d, 0.3)} material={MAT.plasticBlack} position-y={0.8} castShadow receiveShadow />
      <mesh
        geometry={cached("hdd-hsa-conn-pins", () => {
          const parts = [];
          for (let i = 0; i < 14; i++) parts.push(new BoxGeometry(0.4, 0.3, 0.45).translate(i % 2 ? 0.7 : -0.7, 1.7, -4.6 + Math.floor(i / 2) * 1.5));
          return merge(parts);
        })}
        material={MAT.gold}
      />
    </group>
  );
}

function Mosfet({ position, label }: { position: [number, number, number]; label: string }) {
  return (
    <Chip
      kind="qfn"
      size={[5.0, 1.0, 6.0]}
      position={position}
      pins={4}
      marking={{ lines: [label, "N-CH"], scale: 1.1 }}
    />
  );
}

/** Components that fit under the casting: no part may be taller than the recess. */
export function ControllerBoard({ partLift = true }: { partLift?: boolean }) {
  const lift = (h: number): [number, number, number] | undefined => (partLift ? [0, h, 0] : undefined);
  const screwPts = useMemo(() => SCREWS.map(([x, z]): [number, number, number] => [x, -(Y.pcbTop - Y.pcbBottom), z]), []);
  const sataY = 0;
  const material: Material = HM.screwDark;
  return (
    <>
      <Board id="hdd-pcb" outline={BOARD_SHAPE} thickness={Y.pcbTop - Y.pcbBottom} mask="green" ppm={12} paintTop={paintTop} paintBottom={paintBottom} bump={0.5} />

      <Part id="soc" explode={lift(7)} explodeRange={[0.72, 1]}>
        <Chip
          size={[SOC.w, 1.15, SOC.d]}
          position={[SOC.x, 0, SOC.z]}
          marking={{ lines: ["HDC-9M4", "ARM R5 · 2611", "TW 7Q41A2"], logo: "triangle" }}
          balls={{ pitch: 0.8 }}
        />
      </Part>
      <Part id="dram" explode={lift(6)} explodeRange={[0.74, 1]}>
        <Chip
          size={[DRAM.w, 1.0, DRAM.d]}
          position={[DRAM.x, 0, DRAM.z]}
          marking={{ lines: ["D4 2Gb", "256MB x16", "2609 KR"], logo: "dot-ring" }}
          balls={{ pitch: 0.8 }}
        />
      </Part>
      <Part id="motor-driver" explode={lift(6)} explodeRange={[0.74, 1]}>
        <Chip kind="qfn" size={[MOTOR_IC.w, 0.9, MOTOR_IC.d]} position={[MOTOR_IC.x, 0, MOTOR_IC.z]} pins={12} marking={{ lines: ["SMC-77", "SPM/VCM", "2610"], logo: "wave" }} />
        <Mosfet position={[MOSFETS[0][0], 0, MOSFETS[0][1]]} label="Q1" />
        <Mosfet position={[MOSFETS[1][0], 0, MOSFETS[1][1]]} label="Q2" />
        {CHOKES.map(([x, z], i) => (
          <Choke key={i} position={[x, 0, z]} size={[4.2, 1.5, 4.2]} label={i ? "1R0" : "2R2"} />
        ))}
      </Part>
      <Part id="serial-flash" explode={lift(5)} explodeRange={[0.76, 1]}>
        <Chip kind="soic" size={[FLASH.w, 1.35, FLASH.d]} position={[FLASH.x, 0, FLASH.z]} pins={4} marking={{ lines: ["25Q32", "SPI 4MB"], logo: "wave", scale: 1.1 }} />
      </Part>
      <Part id="shock-sensor" explode={lift(5)} explodeRange={[0.76, 1]}>
        <Chip kind="lga" size={[SHOCK.w, 0.9, SHOCK.d]} position={[SHOCK.x, 0, SHOCK.z]} marking={{ lines: ["SHK"], scale: 1.3 }} />
      </Part>
      <Part id="crystal" explode={lift(5)} explodeRange={[0.76, 1]}>
        <mesh geometry={roundedBox(XTAL.w, 0.8, XTAL.d, 0.2)} material={MAT.nickel} position={[XTAL.x, 0.45, XTAL.z]} castShadow />
        <mesh geometry={roundedBox(XTAL.w + 0.1, 0.1, XTAL.d + 0.1, 0.05)} material={MAT.ceramic} position={[XTAL.x, 0.05, XTAL.z]} />
      </Part>
      <Part id="power-protection" explode={lift(5)} explodeRange={[0.76, 1]}>
        {TVS.map(([x, z], i) => (
          <Chip key={i} kind="sot" size={[2.8, 1.0, 1.8]} position={[x, 0, z]} pins={1} marking={{ lines: ["SMF12A"], scale: 1.2, pin1: false }} />
        ))}
        {TANTS.map(([x, z], i) => (
          <TantalumCap key={i} position={[x, 0, z]} size={[3.6, 1.2, 2.6]} label={["107", "16V"]} />
        ))}
      </Part>
      <Part id="hsa-connector" explode={lift(5)} explodeRange={[0.74, 1]}>
        <HsaConnector />
      </Part>
      <Part id="spindle-contacts" explode={lift(4)} explodeRange={[0.74, 1]}>
        <SpindleContacts />
      </Part>
      <Part id="sata-data" explode={partLift ? [6, 0, 0] : undefined} explodeRange={[0.7, 1]}>
        <SataPlug width={SATA.data.w} pins={7} position={[DRIVE.halfL - 0.05, sataY, SATA.data.z]} keyLeft />
      </Part>
      <Part id="sata-power" explode={partLift ? [6, 0, 0] : undefined} explodeRange={[0.7, 1]}>
        <SataPlug width={SATA.power.w} pins={15} position={[DRIVE.halfL - 0.05, sataY, SATA.power.z]} keyLeft={false} />
      </Part>
      <Part id="pcb-passives">
        <SmdField items={BOARD_PASSIVES.c0402} size="0402" kind="cap" />
        <SmdField items={BOARD_PASSIVES.r0402} size="0402" kind="res" />
        <SmdField items={BOARD_PASSIVES.c0603} size="0603" kind="cap" />
      </Part>
      <Part id="pcb-screws">
        <TorxScrews points={screwPts} d={3.6} h={0.65} material={material} down />
      </Part>
    </>
  );
}

export { BOARD_SHAPE };
