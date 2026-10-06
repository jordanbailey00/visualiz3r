"use client";

import { useMemo } from "react";
import {
  BoxGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  LatheGeometry,
  MeshPhysicalMaterial,
  Shape,
  Vector2,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { FONT_SANS, painted } from "@/lib/three/painter";
import { Fan } from "../../kit/Fan";
import { Screw } from "../../kit/Fasteners";
import { cached, circlePath, roundedBox, roundedRectShape } from "../../kit/geometry";
import { MAT, emissive } from "../../kit/materials";
import { FinStack, HeatPipe } from "../../kit/Thermal";
import {
  CARD,
  CHOKE,
  COOLER,
  DIE_TOP,
  EDGE_HOLES,
  FAN,
  FANS,
  GPU,
  MEM,
  MEMORY_CHIPS,
  MEM_VRM,
  PORTS,
  STAGE,
  VRM_PHASES,
} from "./layout";

type Vec3 = [number, number, number];

const PCB_TOP = CARD.pcbTop;
const DIE_Y = PCB_TOP + DIE_TOP;
const PASTE_T = 0.12;
const VC = { w: 66, d: 66, t: 4, pedestal: 0.8 };
const VC_BOTTOM = DIE_Y + PASTE_T + VC.pedestal;
const VC_TOP = VC_BOTTOM + VC.t;

/** Extrude a shape lying in XZ (shape y → +z) upward by `t` starting at y. */
function slab(shape: Shape, t: number) {
  const g = new ExtrudeGeometry(shape, { depth: t, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.3, bevelSegments: 2, curveSegments: 24 });
  g.rotateX(Math.PI / 2);
  g.translate(0, t, 0);
  return g;
}

// ---------------------------------------------------------------------------

export function ThermalPaste() {
  return (
    <mesh
      geometry={roundedBox(GPU.die[0] - 0.4, PASTE_T, GPU.die[2] - 0.4, 0.05)}
      material={MAT.thermalPaste}
      position={[GPU.x, DIE_Y + PASTE_T / 2, GPU.z]}
    />
  );
}

export function VaporChamber() {
  return (
    <group position={[GPU.x, 0, GPU.z]}>
      <mesh geometry={roundedBox(GPU.die[0] + 2, VC.pedestal, GPU.die[2] + 2, 0.2)} material={MAT.nickel} position-y={DIE_Y + PASTE_T + VC.pedestal / 2} castShadow receiveShadow />
      <mesh geometry={roundedBox(VC.w, VC.t, VC.d, 0.8)} material={MAT.nickel} position-y={VC_BOTTOM + VC.t / 2} castShadow receiveShadow />
    </group>
  );
}

/** Black aluminium base plate with milled pedestals over memory and VRM. */
export function Midplate() {
  const geo = useMemo(
    () =>
      cached("gpu-midplate", () => {
        const s = roundedRectShape(-146, -57, 198, 114, 3);
        const vc = roundedRectShape(GPU.x - VC.w / 2 - 2, GPU.z - VC.d / 2 - 2, VC.w + 4, VC.d + 4, 2);
        s.holes.push(vc);
        s.holes.push(roundedRectShape(25, 44, 22, 16, 1.5));
        for (const [x, z] of EDGE_HOLES) s.holes.push(circlePath(x, z, 2.2));
        return slab(s, COOLER.baseTop - COOLER.baseBottom);
      }),
    [],
  );
  const pedestals = useMemo(
    () =>
      cached("gpu-pedestals", () => {
        const parts: BoxGeometry[] = [];
        const memTop = PCB_TOP + 0.3 + MEM.h + 1.5;
        for (const m of MEMORY_CHIPS) {
          const h = COOLER.baseBottom - memTop;
          const b = new BoxGeometry(m.rot ? MEM.d : MEM.w, h, m.rot ? MEM.w : MEM.d);
          b.translate(m.x, memTop + h / 2, m.z);
          parts.push(b);
        }
        const stageTop = PCB_TOP + 0.05 + STAGE.h + 1.5;
        for (const x of [-11, 15, -128]) {
          const zs = [...VRM_PHASES, ...MEM_VRM].filter((p) => p.stageX === x).map((p) => p.z);
          const z0 = Math.min(...zs) - STAGE.d / 2;
          const z1 = Math.max(...zs) + STAGE.d / 2;
          const h = COOLER.baseBottom - stageTop;
          const b = new BoxGeometry(STAGE.w + 1, h, z1 - z0);
          b.translate(x, stageTop + h / 2, (z0 + z1) / 2);
          parts.push(b);
        }
        return mergeGeometries(parts)!;
      }),
    [],
  );
  return (
    <group>
      <mesh geometry={geo} material={MAT.aluminumBlack} position-y={COOLER.baseBottom} castShadow receiveShadow />
      <mesh geometry={pedestals} material={MAT.aluminumBlack} castShadow receiveShadow />
    </group>
  );
}

/** Soft thermally conductive pads that bridge memory and VRM to the base plate. */
export function ThermalPads() {
  const geo = useMemo(
    () =>
      cached("gpu-pads", () => {
        const parts: BoxGeometry[] = [];
        const memTop = PCB_TOP + 0.3 + MEM.h;
        for (const m of MEMORY_CHIPS) {
          const b = new BoxGeometry(m.rot ? MEM.d : MEM.w, 1.5, m.rot ? MEM.w : MEM.d);
          b.translate(m.x, memTop + 0.75, m.z);
          parts.push(b);
        }
        const stageTop = PCB_TOP + 0.05 + STAGE.h;
        const chokeTop = PCB_TOP + 0.05 + CHOKE.h;
        for (const [sx, cx] of [
          [-11, 0.5],
          [15, 26.5],
          [-128, -117],
        ]) {
          const zs = [...VRM_PHASES, ...MEM_VRM].filter((p) => p.stageX === sx).map((p) => p.z);
          const z0 = Math.min(...zs) - STAGE.d / 2;
          const z1 = Math.max(...zs) + STAGE.d / 2;
          const a = new BoxGeometry(STAGE.w + 1, 1.5, z1 - z0);
          a.translate(sx, stageTop + 0.75, (z0 + z1) / 2);
          parts.push(a);
          const ch = COOLER.baseBottom - chokeTop;
          const c = new BoxGeometry(CHOKE.w, ch, z1 - z0 + 4.4);
          c.translate(cx, chokeTop + ch / 2, (z0 + z1) / 2);
          parts.push(c);
        }
        return mergeGeometries(parts)!;
      }),
    [],
  );
  return <mesh geometry={geo} material={MAT.thermalPad} castShadow receiveShadow />;
}

const PIPE_R = 3;
const PIPE_Z = [-21, -15, -9, -3, 3, 9, 15, 21];
const LOW = VC_TOP + PIPE_R;
const RUN = COOLER.baseTop + PIPE_R + 0.6;

export function HeatPipes() {
  const paths = useMemo<Vec3[][]>(() => {
    const top = COOLER.finTop - 8;
    return PIPE_Z.map((z, i) => {
      const s = i % 2 === 0 ? -1 : 1;
      // Leave the vapor chamber, run to one end of the card along the bottom
      // of the fins, U-turn upward and run back along the top of the stack.
      const endX = s < 0 ? -143.5 : 145.5;
      const backX = s < 0 ? 141 : -130;
      return [
        [GPU.x - s * 28, LOW, z],
        [GPU.x + s * 30, LOW, z],
        [GPU.x + s * 40, RUN, z],
        [endX, RUN, z],
        [endX, top, z],
        [backX, top, z],
      ];
    });
  }, []);
  return (
    <group>
      {paths.map((pts, i) => (
        <HeatPipe key={i} points={pts} radius={PIPE_R} bend={10} />
      ))}
    </group>
  );
}

export function Fins() {
  return (
    <FinStack
      count={146}
      pitch={1.9}
      thickness={0.4}
      height={COOLER.finTop - COOLER.finBottom}
      depth={114}
      position={[2, COOLER.finBottom, 0]}
    />
  );
}

// --- Shroud -----------------------------------------------------------------

const shroudMats = new Map<string, MeshPhysicalMaterial>();
function shroudTopMaterial() {
  let m = shroudMats.get("top");
  if (m) return m;
  const maps = painted("gpu-shroud-top", 300, 124, 6, { color: "#3c4047", rough: 0.36, metal: 0.92, height: 0.5 }, (p) => {
    // Brushed-metal streaks along the length.
    for (let i = 0; i < 900; i++) {
      const y = (i * 124) / 900;
      const v = 0.5 + 0.08 * Math.sin(i * 12.9898) * Math.cos(i * 4.1);
      const c = Math.round(56 + v * 18);
      p.rect(0, y, 300, 0.14, { color: `rgb(${c},${c + 3},${c + 9})`, rough: 0.3 + v * 0.12, metal: 0.92 });
    }
    // Gloss black accent bands between the fans.
    for (const x of [150 - 48.5, 150 + 48.5]) {
      p.polygon(
        [
          [x - 2.5, 0],
          [x + 2.5, 0],
          [x + 6, 124],
          [x - 6, 124],
        ],
        { color: "#0d0e10", rough: 0.12, metal: 0.2, height: 0.55 },
      );
    }
    // Machined grooves: angled lines framing the fans.
    const groove = { color: "#24272c", rough: 0.5, metal: 0.9, height: 0.3 };
    for (const [x0, y0, x1, y1] of [
      [6, 10, 34, 2],
      [266, 2, 294, 10],
      [6, 114, 34, 122],
      [266, 122, 294, 114],
      [40, 3, 260, 3],
      [40, 121, 260, 121],
    ]) {
      p.polyline([[x0, y0], [x1, y1]], 0.7, groove);
    }
    p.text("AERO", 8, 116, 6, { color: "#c9ccd2", rough: 0.25, metal: 1, height: 0.6 }, { font: FONT_SANS, weight: 800, letterSpacing: 2 });
  });
  m = new MeshPhysicalMaterial({
    map: maps.map,
    roughnessMap: maps.rmMap,
    metalnessMap: maps.rmMap,
    bumpMap: maps.bumpMap,
    bumpScale: 0.4,
    roughness: 1,
    metalness: 1,
    clearcoat: 0.3,
    clearcoatRoughness: 0.35,
  });
  shroudMats.set("top", m);
  return m;
}

/**
 * Raised, chamfered bezel ring around a fan opening (lathe profile). The
 * profile runs counter-clockwise in (radius, y) — up the outside, in across
 * the top, down the bore — so LatheGeometry winds the faces outward.
 */
function bezelGeometry() {
  return cached("gpu-fan-bezel", () => {
    const r0 = FAN.ring;
    const pts = [
      new Vector2(r0 + 4.6, 0),
      new Vector2(r0 + 4.2, 0.6),
      new Vector2(r0 + 2.6, 2.2),
      new Vector2(r0 + 0.6, 2.2),
      new Vector2(r0 - 0.2, 1.4),
      new Vector2(r0 - 0.2, 0),
    ];
    return new LatheGeometry(pts, 96);
  });
}

export function ShroudFrame() {
  const top = useMemo(
    () =>
      cached("gpu-shroud-plate", () => {
        const s = roundedRectShape(-150, -62, 300, 124, 7);
        for (const x of FANS) s.holes.push(circlePath(x, 0, FAN.ring));
        const g = slab(s, 2.4);
        // Planar UVs over the plate (x: −150…150 → 0…1, z: −62…62 → 1…0).
        const pos = g.getAttribute("position");
        const uv = g.getAttribute("uv");
        for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + 150) / 300, 1 - (pos.getZ(i) + 62) / 124);
        uv.needsUpdate = true;
        return g;
      }),
    [],
  );
  const rings = useMemo(
    () =>
      cached("gpu-shroud-rings", () => {
        const parts = FANS.map((x) => {
          const g = new CylinderGeometry(FAN.ring + 0.8, FAN.ring + 0.8, COOLER.shroudTop - COOLER.fanBottom - 2.4, 96, 1, true);
          g.translate(x, COOLER.fanBottom + (COOLER.shroudTop - COOLER.fanBottom - 2.4) / 2, 0);
          return g;
        });
        return mergeGeometries(parts)!;
      }),
    [],
  );
  const struts = useMemo(
    () =>
      cached("gpu-fan-struts", () => {
        const parts: (BoxGeometry | CylinderGeometry)[] = [];
        for (const x of FANS) {
          for (let k = 0; k < 3; k++) {
            const a = (k / 3) * Math.PI * 2 + 0.4;
            const b = new BoxGeometry(FAN.ring - 15, 1.6, 3.2);
            b.translate((FAN.ring + 15) / 2, 0, 0);
            b.rotateY(a);
            b.translate(x, COOLER.fanBottom - 0.6, 0);
            parts.push(b);
          }
          const motor = new CylinderGeometry(16, 16, 2.4, 40);
          motor.translate(x, COOLER.fanBottom - 0.6, 0);
          parts.push(motor);
        }
        return mergeGeometries(parts)!;
      }),
    [],
  );
  const skirts = useMemo(
    () =>
      cached("gpu-shroud-skirts", () => {
        const h = COOLER.shroudTop - 2.4 - (COOLER.finTop - 1);
        const parts: BoxGeometry[] = [];
        for (const z of [-61, 61]) {
          const b = new BoxGeometry(298, h, 2);
          b.translate(0, COOLER.finTop - 1 + h / 2, z);
          parts.push(b);
        }
        for (const x of [-149, 149]) {
          const hh = COOLER.shroudTop - 2.4 - (PCB_TOP + 7);
          const b = new BoxGeometry(2, hh, 120);
          b.translate(x, PCB_TOP + 7 + hh / 2, 0);
          parts.push(b);
        }
        return mergeGeometries(parts)!;
      }),
    [],
  );
  return (
    <group>
      <mesh geometry={top} material={shroudTopMaterial()} position-y={COOLER.shroudTop - 2.4} castShadow receiveShadow />
      {FANS.map((x) => (
        <mesh key={x} geometry={bezelGeometry()} material={MAT.aluminumGunmetal} position={[x, COOLER.shroudTop - 0.1, 0]} castShadow receiveShadow />
      ))}
      <mesh geometry={rings} material={MAT.plasticSatin} castShadow receiveShadow />
      <mesh geometry={struts} material={MAT.plasticSatin} castShadow receiveShadow />
      <mesh geometry={skirts} material={MAT.aluminumGunmetal} castShadow receiveShadow />
    </group>
  );
}

export function LightBar() {
  return (
    <group>
      <mesh geometry={roundedBox(150, 2.2, 0.8, 0.3)} material={emissive("#cfe6ff", 1.4)} position={[-20, COOLER.shroudTop - 7, 62.2]} />
      <mesh geometry={roundedBox(154, 4.2, 0.6, 0.3)} material={MAT.plasticGloss} position={[-20, COOLER.shroudTop - 7, 61.9]} />
    </group>
  );
}

export function GpuFans() {
  return (
    <group>
      {FANS.map((x, i) => (
        <group key={x} position={[x, COOLER.fanBottom, 0]}>
          <Fan radius={FAN.radius} hubRadius={18} blades={11} depth={FAN.depth} direction={i === 1 ? -1 : 1} rps={0.55} />
        </group>
      ))}
    </group>
  );
}

// --- Backplate & bracket ----------------------------------------------------

const backMats = new Map<string, MeshPhysicalMaterial>();
function backplateMaterial() {
  let m = backMats.get("b");
  if (m) return m;
  const maps = painted("gpu-backplate", 300, 124, 5, { color: "#1b1d21", rough: 0.45, metal: 0.85, height: 0.5 }, (p) => {
    const ink = { color: "#4b4f57", rough: 0.3, metal: 0.9, height: 0.45 };
    // Seen from below: text reads with x mirrored, so we draw mirrored.
    p.c.save();
    p.m.save();
    p.hgt.save();
    for (const ctx of [p.c, p.m, p.hgt]) {
      ctx.translate(300, 0);
      ctx.scale(-1, 1);
    }
    p.text("24 GB  ·  GDDR7  ·  384-BIT", 18, 108, 4.4, ink, { font: FONT_SANS, weight: 700, letterSpacing: 1.2 });
    p.polyline([[18, 98], [130, 98]], 0.5, ink);
    p.c.restore();
    p.m.restore();
    p.hgt.restore();
  });
  m = new MeshPhysicalMaterial({
    map: maps.map,
    roughnessMap: maps.rmMap,
    metalnessMap: maps.rmMap,
    bumpMap: maps.bumpMap,
    bumpScale: 0.4,
    roughness: 1,
    metalness: 1,
    clearcoat: 0.2,
  });
  backMats.set("b", m);
  return m;
}

export function Backplate() {
  const geo = useMemo(
    () =>
      cached("gpu-backplate", () => {
        const s = roundedRectShape(-148, -62, 298, 124, 5);
        s.holes.push(roundedRectShape(66, -46, 70, 92, 6));
        for (const [x, z] of EDGE_HOLES) s.holes.push(circlePath(x, z, 1.8));
        const g = slab(s, CARD.backplateT);
        const pos = g.getAttribute("position");
        const uv = g.getAttribute("uv");
        for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + 150) / 300, 1 - (pos.getZ(i) + 62) / 124);
        uv.needsUpdate = true;
        return g;
      }),
    [],
  );
  const grille = useMemo(
    () =>
      cached("gpu-backplate-grille", () => {
        // Diagonal slats clipped to the flow-through cut-out (x 66…136, z −46…46).
        const [x0, x1, z0, z1] = [66.6, 135.4, -45.4, 45.4];
        const dir = { x: Math.cos(0.6), z: Math.sin(0.6) };
        const parts: BoxGeometry[] = [];
        for (let k = -20; k <= 20; k++) {
          // Slat line: passes through (cx, 0) with direction dir.
          const cx = 101 + k * 4.6 / dir.z;
          let tMin = -Infinity;
          let tMax = Infinity;
          for (const [p, d, lo, hi] of [
            [cx, dir.x, x0, x1],
            [0, dir.z, z0, z1],
          ] as const) {
            const a = (lo - p) / d;
            const b = (hi - p) / d;
            tMin = Math.max(tMin, Math.min(a, b));
            tMax = Math.min(tMax, Math.max(a, b));
          }
          const len = tMax - tMin;
          if (len < 2) continue;
          const tc = (tMin + tMax) / 2;
          const b = new BoxGeometry(len, CARD.backplateT * 0.8, 1.4);
          b.rotateY(-0.6);
          b.translate(cx + dir.x * tc, CARD.backplateT / 2, dir.z * tc);
          parts.push(b);
        }
        return mergeGeometries(parts)!;
      }),
    [],
  );
  return (
    <group>
      <mesh geometry={geo} material={backplateMaterial()} castShadow receiveShadow />
      <mesh geometry={grille} material={MAT.aluminumBlack} castShadow receiveShadow />
      {/* VRM back-side thermal pads on the inner face */}
      <mesh geometry={roundedBox(40, 1.2, 96, 0.3)} material={MAT.thermalPadPink} position={[8, CARD.backplateT + 0.6, 0]} />
      <mesh geometry={roundedBox(28, 1.2, 28, 0.3)} material={MAT.thermalPadPink} position={[GPU.x, CARD.backplateT + 0.6, GPU.z]} />
      {EDGE_HOLES.map(([x, z], i) => (
        <Screw key={i} position={[x, 0, z]} rotation={[Math.PI, 0, 0]} diameter={4.6} height={1.4} />
      ))}
    </group>
  );
}

export function IoBracket() {
  const geo = useMemo(
    () =>
      cached("gpu-bracket", () => {
        // Shape in (z, y) — later rotated into the YZ plane at the −X end.
        const s = new Shape();
        s.moveTo(-72, -1.5);
        s.lineTo(62.5, -1.5);
        s.lineTo(62.5, 61);
        s.lineTo(-68, 61);
        s.lineTo(-72, 57);
        s.closePath();
        for (const port of PORTS) {
          const w = port.kind === "dp" ? 17.4 : 16;
          s.holes.push(roundedRectShape(port.z - w / 2, PCB_TOP - 0.4, w, 7, 0.6));
        }
        // Vent slots above the ports.
        for (let row = 0; row < 3; row++)
          for (let k = 0; k < 6; k++) {
            const z = -54 + k * 20 + (row % 2) * 9;
            s.holes.push(roundedRectShape(z, 20 + row * 13, 15, 8, 3.5));
          }
        const g = new ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
        g.rotateY(-Math.PI / 2);
        return g;
      }),
    [],
  );
  return (
    <group position={[-149.2, 0, 0]}>
      <mesh geometry={geo} material={MAT.steel} castShadow receiveShadow />
      {/* bent mounting tabs (one per slot) at the top edge */}
      {[10, 30, 50].map((y) => (
        <mesh key={y} geometry={roundedBox(10, 15, 1, 0.3)} material={MAT.steel} position={[-5.5, y, 62]} castShadow />
      ))}
    </group>
  );
}
