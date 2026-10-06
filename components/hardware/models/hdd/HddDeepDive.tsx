"use client";

import { Billboard, Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  CatmullRomCurve3,
  ConeGeometry,
  type Group,
} from "three";
import { useExplorer } from "@/lib/hardware/store";
import { rng } from "@/lib/three/painter";
import { explodeProgress } from "../../explode";
import { Part } from "../../Part";
import { cached, roundedBox } from "../../kit/geometry";
import { MAT } from "../../kit/materials";
import { smooth } from "./HddDisks";
import { beam, crease, extrudeZ, filletPts, merge, offsetPts, roundedRectPts, shapeOf, slab, type Pt } from "./geom";
import { HM } from "./materials";

/*
 * Deep-dive frame ("dd"): origin at the read/write element on the slider's
 * trailing edge, at the air-bearing surface. +X points down-track (the way
 * the disk surface moves under the slider), +Y away from the disk, +Z across
 * the track toward the viewer.
 */

const FONT = "/fonts/inter-latin-600-normal.woff";

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

const mats = new Map<string, MeshPhysicalMaterial | MeshStandardMaterial>();
function mat<T extends MeshPhysicalMaterial | MeshStandardMaterial>(key: string, make: () => T): T {
  let m = mats.get(key);
  if (!m) {
    m = make();
    m.name = `hdd-dd:${key}`;
    mats.set(key, m);
  }
  return m as T;
}

const DM = {
  mirror: () => mat("mirror", () => new MeshPhysicalMaterial({ color: "#d4d7dc", metalness: 1, roughness: 0.035, clearcoat: 0.3, clearcoatRoughness: 0.03 })),
  absPad: () =>
    mat("absPad", () => new MeshPhysicalMaterial({ color: "#4d5566", metalness: 0.6, roughness: 0.16, iridescence: 0.55, iridescenceIOR: 1.9, iridescenceThicknessRange: [300, 520] })),
  absStep: () => mat("absStep", () => new MeshPhysicalMaterial({ color: "#5b5d63", metalness: 0.45, roughness: 0.42 })),
  overcoat: () => mat("overcoat", () => new MeshPhysicalMaterial({ color: "#c49a5a", metalness: 0.1, roughness: 0.18, transmission: 0, clearcoat: 0.8 })),
  shield: () => mat("shield", () => new MeshPhysicalMaterial({ color: "#a2abb8", metalness: 1, roughness: 0.28 })),
  pole: () => mat("pole", () => new MeshPhysicalMaterial({ color: "#d3d8df", metalness: 1, roughness: 0.18, emissive: new Color("#000000") })),
  pinned: () => mat("pinned", () => new MeshPhysicalMaterial({ color: "#c9824a", metalness: 0.9, roughness: 0.3 })),
  barrier: () => mat("barrier", () => new MeshPhysicalMaterial({ color: "#9fdcff", metalness: 0.1, roughness: 0.2, emissive: new Color("#2a6f99"), emissiveIntensity: 0.6 })),
  free: () => mat("free", () => new MeshPhysicalMaterial({ color: "#7fd09a", metalness: 0.7, roughness: 0.28 })),
  heater: () => mat("heater", () => new MeshStandardMaterial({ color: "#5a2a10", emissive: new Color("#ff7a2e"), emissiveIntensity: 1.6, roughness: 0.4 })),
  alumina: () =>
    mat("alumina", () => new MeshPhysicalMaterial({ color: "#efe3c8", metalness: 0, roughness: 0.25, transparent: true, opacity: 0.1, depthWrite: false, side: DoubleSide })),
  carbon: () => mat("carbon", () => new MeshPhysicalMaterial({ color: "#2a2b30", metalness: 0.2, roughness: 0.3, transparent: true, opacity: 0.38, depthWrite: false })),
  ru: () => mat("ru", () => new MeshPhysicalMaterial({ color: "#cfc8bc", metalness: 1, roughness: 0.3 })),
  sul: () => mat("sul", () => new MeshPhysicalMaterial({ color: "#6e6259", metalness: 0.8, roughness: 0.38 })),
  substrate: () => mat("substrate", () => new MeshPhysicalMaterial({ color: "#b4b9bf", metalness: 1, roughness: 0.42 })),
  grain: () => mat("grain", () => new MeshStandardMaterial({ color: "#ffffff", metalness: 0.15, roughness: 0.42 })),
  flux: () => mat("flux", () => new MeshStandardMaterial({ color: "#123445", emissive: new Color("#6fd2ff"), emissiveIntensity: 1.25, roughness: 0.5 })),
  callout: () => mat("callout", () => new MeshStandardMaterial({ color: "#0d2433", emissive: new Color("#7cc8f0"), emissiveIntensity: 0.9, roughness: 0.6 })),
  marker: () => mat("marker", () => new MeshStandardMaterial({ color: "#3a1206", emissive: new Color("#ffb347"), emissiveIntensity: 2.2 })),
};

/** A camera-facing caption with an optional leader line to the thing it names. */
function Label({
  at,
  to,
  size = 2.2,
  children,
  color = "#e8eef7",
}: {
  at: [number, number, number];
  to?: [number, number, number];
  size?: number;
  children: string;
  color?: string;
}) {
  const line = useMemo(
    () => (to ? cached(`hdd-dd-leader:${at.join(",")}:${to.join(",")}`, () => beam(at, to, size * 0.035, 6)) : null),
    [at, to, size],
  );
  return (
    <group>
      {line && <mesh geometry={line} material={DM.callout()} />}
      <Billboard position={at}>
        <Text font={FONT} fontSize={size} color={color} anchorX="center" anchorY="middle" outlineWidth={size * 0.09} outlineColor="#081019" maxWidth={size * 18} textAlign="center">
          {children}
        </Text>
      </Billboard>
    </group>
  );
}

/** Grows its children from nothing as the explode slider nears the end. */
function Reveal({ range, children }: { range: [number, number]; children: ReactNode }) {
  const ref = useRef<Group>(null);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const t = smooth(range[0], range[1], explodeProgress.value);
    g.scale.setScalar(Math.max(1e-3, t));
    g.visible = t > 0.004;
  });
  return (
    <group ref={ref} scale={1e-3} visible={false}>
      {children}
    </group>
  );
}

// ---------------------------------------------------------------------------
// ×60: slider and air-bearing surface
// ---------------------------------------------------------------------------

/** Slider at ×60: 0.85 × 0.70 × 0.23 mm "femto" slider → 51 × 42 × 13.8. */
const SL = { len: 51, w: 42, abs: 0.6, step: 1.4, cavity: 2.0, back: 14.4, overcoat: 1.8 };

/** Air-bearing surface pattern (slider space XZ, trailing edge at x = 0). */
function absShapes() {
  const half = SL.w / 2;
  // Leading-edge "U": crossbar plus two side arms that trap a sub-ambient pocket.
  const lead: Pt[] = [
    [-SL.len + 4.5, -half + 2.2],
    [-SL.len + 11, -half + 2.2],
    [-SL.len + 11, -half + 6.5],
    [-22, -half + 6.5],
    [-20, -half + 2.2],
    [-17.5, -half + 2.2],
    [-17.5, -half + 0.01],
    [-SL.len + 2.6, -half + 0.01],
  ];
  const leadPts = (s: number): Pt[] => lead.map(([x, z]) => [x, s * z]);
  const cross: Pt[] = [
    [-SL.len + 4.5, -half + 2.2],
    [-SL.len + 11, -half + 2.2],
    [-SL.len + 11, half - 2.2],
    [-SL.len + 4.5, half - 2.2],
  ];
  const sidePad = (s: number): Pt[] => [
    [-14, s * (half - 7.5)],
    [-4.5, s * (half - 6.0)],
    [-4.5, s * (half - 1.8)],
    [-14, s * (half - 1.8)],
  ];
  const center: Pt[] = [
    [-10.5, -4.2],
    [-0.01, -3.2],
    [-0.01, 3.2],
    [-10.5, 4.2],
  ];
  const pads = [leadPts(1), leadPts(-1), cross, sidePad(1), sidePad(-1), center].map((p) => filletPts(p, 0.7, 3));
  return pads;
}

function sliderGeos() {
  return {
    body: cached("hdd-dd-slider-body", () => {
      const g = roundedBox(SL.len - SL.overcoat, SL.back - SL.cavity, SL.w, 0.6).clone();
      g.translate(-(SL.len + SL.overcoat) / 2, (SL.back + SL.cavity) / 2, 0);
      return g;
    }),
    overcoat: cached("hdd-dd-slider-overcoat", () => {
      const g = roundedBox(SL.overcoat, SL.back - SL.cavity, SL.w, 0.3).clone();
      g.translate(-SL.overcoat / 2, (SL.back + SL.cavity) / 2, 0);
      return g;
    }),
    pads: cached("hdd-dd-abs-pads", () => merge(absShapes().map((p) => slab(shapeOf(p), SL.abs, SL.step + 0.01, 0.12)))),
    steps: cached("hdd-dd-abs-steps", () => merge(absShapes().map((p) => slab(shapeOf(offsetPts(p, 1.4)), SL.step, SL.cavity + 0.01, 0.1)))),
    pads8: cached("hdd-dd-bondpads", () => {
      const parts = [];
      for (let i = 0; i < 8; i++) parts.push(new BoxGeometry(0.25, 2.2, 2.7).translate(0.12, 9.8, -16.45 + i * 4.7));
      return merge(parts);
    }),
  };
}

function Slider() {
  const g = useMemo(sliderGeos, []);
  return (
    <group>
      <mesh geometry={g.body} material={HM.altic} castShadow receiveShadow />
      <mesh geometry={g.overcoat} material={DM.overcoat()} castShadow />
      <mesh geometry={g.steps} material={DM.absStep()} />
      <mesh geometry={g.pads} material={DM.absPad()} />
      <mesh geometry={g.pads8} material={MAT.gold} />
    </group>
  );
}

/** Gimbal, flexure traces, load-beam tip with its dimple and the lift tab, at ×60. */
function Gimbal() {
  const g = useMemo(
    () => ({
      steel: cached("hdd-dd-gimbal-steel", () => {
        const parts = [];
        // Gimbal tongue bonded to the slider's back.
        parts.push(slab(shapeOf(roundedRectPts(-44, -15, -9, 15, 2.5, 4)), SL.back, SL.back + 1.4, 0.3));
        // Flexure frame: outriggers either side of the slider joined behind it.
        parts.push(slab(shapeOf(roundedRectPts(-68, -26, -40, 26, 3, 4), [roundedRectPts(-62, -16, -46, 16, 2, 3)]), SL.back + 1.8, SL.back + 2.8, 0.25));
        for (const s of [-1, 1]) parts.push(roundedBox(40, 1.0, 2.6, 0.4).clone().translate(-24, SL.back + 2.3, s * 24.2));
        parts.push(roundedBox(3, 1.0, 51, 0.4).clone().translate(-4.6, SL.back + 2.3, 0));
        // Load beam tip (cut away behind), its formed rails and the lift tab.
        const beamPts: Pt[] = [
          [-72, -24.5],
          [-6, -11],
          [2, -4.2],
          [31, -3.2],
          [31, 3.2],
          [2, 4.2],
          [-6, 11],
          [-72, 24.5],
        ];
        parts.push(slab(shapeOf(filletPts(beamPts, 2.2, 3)), SL.back + 4.4, SL.back + 8.0, 0.4));
        for (const s of [-1, 1]) {
          const r = new BoxGeometry(56, 4.5, 1.4);
          r.rotateY(-s * Math.atan2(13.5, 66));
          r.translate(-42, SL.back + 9.3, s * 17.4);
          parts.push(r);
        }
        // Curl at the end of the lift tab.
        const curl = new BoxGeometry(9, 3.6, 6.4);
        curl.translate(4.5, 0, 0);
        curl.rotateZ(0.45);
        curl.translate(30, SL.back + 6.2, 0);
        parts.push(curl);
        // Dimple: the load beam presses on the gimbal through a single point.
        const dimple = new SphereGeometry(2.4, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
        dimple.scale(1, 1.25, 1);
        dimple.translate(-25.5, SL.back + 4.4, 0);
        parts.push(crease(dimple));
        return merge(parts);
      }),
      traces: cached("hdd-dd-gimbal-traces", () => {
        const parts = [];
        // Polyimide carrier along the side, and across the trailing end.
        parts.push(roundedBox(66, 0.8, 7.5, 0.3).clone().translate(-37, SL.back + 3.3, 30.5));
        parts.push(roundedBox(6, 0.8, 41, 0.3).clone().translate(-2.4, SL.back + 0.5, 3.5));
        return merge(parts);
      }),
      copper: cached("hdd-dd-gimbal-copper", () => {
        const parts = [];
        for (let i = 0; i < 6; i++) parts.push(new BoxGeometry(66, 0.25, 0.7).translate(-37, SL.back + 3.8, 27.6 + i * 1.15));
        // Each trace drops down the trailing face to its bond pad, ending in a solder ball.
        for (let i = 0; i < 8; i++) {
          const z = -16.45 + i * 4.7;
          parts.push(new BoxGeometry(0.35, 5.0, 1.0).translate(0.6, SL.back - 1.2, z));
          parts.push(new BoxGeometry(5.6, 0.25, 1.0).translate(-2.4, SL.back + 1.0, z));
        }
        return merge(parts);
      }),
      balls: cached("hdd-dd-solder-balls", () => {
        const parts = [];
        for (let i = 0; i < 8; i++) parts.push(new SphereGeometry(1.15, 14, 10).translate(0.9, 10.6, -16.45 + i * 4.7));
        return merge(parts);
      }),
    }),
    [],
  );
  return (
    <group>
      <mesh geometry={g.steel} material={HM.suspension} castShadow receiveShadow />
      <mesh geometry={g.traces} material={HM.polyimide} castShadow />
      <mesh geometry={g.copper} material={MAT.copper} />
      <mesh geometry={g.balls} material={MAT.tin} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// ≈×250,000 schematic: read/write head over the recording medium
// ---------------------------------------------------------------------------

/** mm per nanometre in the close-up. */
const K = 0.25;
const HEAD = { abs: 0.8, top: 34 };
const MEDIA = { x0: -37.8, x1: 37.8, z: 24, grainPitch: 2.1, lube: -0.75, rec: -4.5, ru: -6.5, sul: -13, sub: -17 };
const TRACK = { pitch: 64 * K, written: 13.2 };
const BIT = 12 * K;
/**
 * Down-track positions (mm) of the head's thin-film layers, leading → trailing.
 * Real reader–writer spacing is a few micrometres; it is squeezed here.
 */
const X = {
  s1: [-34, -24.3],
  tmr: [-23.4, -20.6],
  s2: [-19.7, -8.5],
  heater: [-6.2, -0.4],
  ret: [1.5, 8],
  coil: [10.8, 15.4],
  pole: [19, 24],
  shield: [28.5, 35],
};
const POLE = { lead: X.pole[0], trail: X.pole[1], wLead: 8, wTrail: 11 };
const WRITE_X = POLE.trail;
const SCROLL = 3.2; // mm/s at this scale — about one bit per second

function hash(a: number, b: number) {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2f);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

const UP = new Color("#e4583f");
const DOWN = new Color("#3f78e4");
const tmpC = new Color();

interface GrainInfo {
  x0: number;
  z: number;
  track: number;
  guard: boolean;
  rot: number;
  s: number;
  rnd: number;
}

function grainLayout(): GrainInfo[] {
  const r = rng(77);
  const out: GrainInfo[] = [];
  const p = MEDIA.grainPitch;
  const rows = Math.floor((2 * MEDIA.z) / (p * 0.866));
  const cols = Math.round((MEDIA.x1 - MEDIA.x0) / p);
  for (let j = 0; j < rows; j++) {
    const z = -MEDIA.z + (j + 0.5) * p * 0.866;
    for (let i = 0; i < cols; i++) {
      const x = MEDIA.x0 + (i + (j % 2 ? 0.5 : 0)) * p;
      const jz = z + (r() - 0.5) * 0.35;
      const track = Math.max(-1, Math.min(1, Math.round(jz / TRACK.pitch)));
      out.push({
        x0: x + (r() - 0.5) * 0.35,
        z: jz,
        track,
        guard: Math.abs(jz - track * TRACK.pitch) > TRACK.written / 2,
        rot: r() * Math.PI,
        s: 0.82 + r() * 0.26,
        rnd: r(),
      });
    }
  }
  return out;
}

/** Magnetisation of a grain: data bit of its track at disk coordinate `s`. */
function grainUp(g: GrainInfo, s: number, written: boolean) {
  if (g.guard) return g.rnd > 0.5;
  const bit = Math.floor(s / BIT);
  return hash(bit, g.track * 7 + (written ? 101 : 0)) > 0.5;
}

const dummy = new Object3D();

/**
 * The recording layer: columnar CoCrPt grains about 8 nm across, red when
 * magnetised up, blue when down. Bits are runs of grains along a track. While
 * animating, the disk slides under the head and the write pole re-writes the
 * centre track as it passes.
 */
function Grains({ poleMat }: { poleMat: MeshPhysicalMaterial }) {
  const ref = useRef<InstancedMesh>(null);
  const grains = useMemo(grainLayout, []);
  const geo = useMemo(
    () =>
      cached("hdd-dd-grain", () => {
        const g = new CylinderGeometry(0.93, 0.99, MEDIA.lube - MEDIA.rec - 0.05, 6, 1);
        return crease(g);
      }),
    [],
  );
  const state = useRef({ t: 0, last: -1 });
  const len = MEDIA.x1 - MEDIA.x0;

  const apply = (t: number) => {
    const m = ref.current;
    if (!m) return;
    const shift = SCROLL * t;
    grains.forEach((g, i) => {
      let x = g.x0 + shift;
      x = MEDIA.x0 + ((((x - MEDIA.x0) % len) + len) % len);
      const s = x - shift; // disk coordinate (fixed to the medium)
      const written = g.track === 0 && x > WRITE_X;
      dummy.position.set(x, (MEDIA.lube + MEDIA.rec) / 2, g.z);
      dummy.rotation.set(0, g.rot, 0);
      dummy.scale.set(g.s, 1, g.s);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      const up = grainUp(g, s, written);
      tmpC.copy(up ? UP : DOWN);
      if (g.guard) tmpC.multiplyScalar(0.55);
      m.setColorAt(i, tmpC);
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    // The write pole glows with the polarity it is writing right now.
    const sPole = WRITE_X - shift;
    const bitUp = hash(Math.floor(sPole / BIT), 101) > 0.5;
    poleMat.emissive.copy(bitUp ? UP : DOWN).multiplyScalar(0.55);
  };

  useLayoutEffect(() => {
    apply(state.current.t);
    ref.current?.computeBoundingSphere();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame((_, dt) => {
    if (!useExplorer.getState().animate || explodeProgress.value < 0.6) return;
    state.current.t += Math.min(dt, 0.1);
    apply(state.current.t);
  });

  return <instancedMesh ref={ref} args={[geo, DM.grain(), grains.length]} castShadow receiveShadow />;
}

function useMediaLayers() {
  const geos = useMemo(() => {
    const box = (y0: number, y1: number) => roundedBox(MEDIA.x1 - MEDIA.x0, y1 - y0, 2 * MEDIA.z, 0.15).clone().translate(0, (y0 + y1) / 2, 0);
    return {
      carbon: cached("hdd-dd-carbon", () => box(MEDIA.lube, 0)),
      ru: cached("hdd-dd-ru", () => box(MEDIA.ru, MEDIA.rec)),
      sul: cached("hdd-dd-sul", () => box(MEDIA.sul, MEDIA.ru)),
      sub: cached("hdd-dd-sub", () => box(MEDIA.sub, MEDIA.sul)),
    };
  }, []);
  return { geos };
}

/** Head elements in the close-up frame (x down-track, y up from the medium surface). */
function headGeos() {
  const h0 = HEAD.abs;
  const top = HEAD.top;
  const W = 40;
  const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, r = 0.4) =>
    roundedBox(x1 - x0, y1 - y0, z1 - z0, r).clone().translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  const [t0, t1] = X.tmr;
  const tw = (t1 - t0) / 3;
  return {
    shields: cached("hdd-dd-shields", () => merge([box(X.s1[0], X.s1[1], h0, top, -W / 2, W / 2), box(X.s2[0], X.s2[1], h0, top, -W / 2, W / 2)])),
    // TMR stack: pinned layer / MgO tunnel barrier / free layer, about 30 nm wide.
    pinned: cached("hdd-dd-tmr-pinned", () => box(t0, t0 + tw * 1.3, h0, h0 + 7.5, -3.75, 3.75, 0.1)),
    barrier: cached("hdd-dd-tmr-barrier", () => box(t0 + tw * 1.3, t0 + tw * 1.7, h0, h0 + 7.5, -3.75, 3.75, 0.05)),
    free: cached("hdd-dd-tmr-free", () => box(t0 + tw * 1.7, t1, h0, h0 + 7.5, -3.75, 3.75, 0.1)),
    bias: cached("hdd-dd-tmr-bias", () => merge([box(t0, t1, h0, h0 + 7.5, -15, -4.6, 0.2), box(t0, t1, h0, h0 + 7.5, 4.6, 15, 0.2)])),
    // Writer: return pole and back gap; the main pole ends in a small trapezoid at the ABS.
    returnPole: cached("hdd-dd-return", () => merge([box(X.ret[0], X.ret[1], h0, top, -W / 2, W / 2), box(X.ret[0], X.pole[1] + 1, top - 5, top, -9, 9)])),
    pole: cached("hdd-dd-pole", () => {
      const tip = extrudeZ(
        shapeOf([
          [POLE.lead, h0],
          [POLE.trail, h0],
          [POLE.trail + 0.4, h0 + 6],
          [POLE.trail + 1.0, top - 5],
          [POLE.lead - 5, top - 5],
          [POLE.lead - 0.4, h0 + 6],
        ]),
        -1,
        1,
      );
      // Taper across the track: narrow trapezoid at the ABS, flaring wide above it.
      const pos = tip.getAttribute("position");
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        const f = Math.min(1, Math.max(0, (y - h0 - 4) / 8));
        const tAlong = Math.min(1, Math.max(0, (x - POLE.lead) / (POLE.trail - POLE.lead)));
        const wAbs = POLE.wLead + (POLE.wTrail - POLE.wLead) * tAlong;
        const w = wAbs + (26 - wAbs) * f;
        pos.setZ(i, (z * w) / 2);
      }
      tip.computeVertexNormals();
      return crease(tip);
    }),
    trailing: cached("hdd-dd-trailing", () =>
      merge([
        box(X.shield[0], X.shield[1], h0, 12.5, -W / 2, W / 2),
        // side shields wrapping the pole tip
        box(POLE.lead - 3, X.shield[0], h0, 7, -W / 2, -7.6),
        box(POLE.lead - 3, X.shield[0], h0, 7, 7.6, W / 2),
      ]),
    ),
    coil: cached("hdd-dd-coil", () => {
      const parts = [];
      for (const [x, y] of [
        [X.coil[0], 12.5],
        [X.coil[1], 12.5],
        [X.coil[0], 19.5],
        [X.coil[1], 19.5],
        [X.coil[0], 26.5],
      ]) parts.push(box(x - 1.8, x + 1.8, y - 2.2, y + 2.2, -22, 22, 0.5));
      return merge(parts);
    }),
    heater: cached("hdd-dd-heater", () => {
      const [a, b] = X.heater;
      const parts = [];
      const n = 5;
      const step = (b - a) / n;
      for (let i = 0; i < n; i++) parts.push(box(a + i * step, a + i * step + step * 0.5, 17, 22, -8, 8, 0.1));
      parts.push(box(a, b - step * 0.5, 21.6, 22.3, -8, 8, 0.1));
      return merge(parts);
    }),
    alumina: cached("hdd-dd-alumina", () => box(X.s1[0] - 2, X.shield[1] + 2, h0, top + 1.5, -W / 2 - 1, W / 2 + 1, 0.8)),
    flux: cached("hdd-dd-flux", () => {
      // Field lines: out of the pole tip, down through the grains into the soft
      // underlayer, along it, and back up into the return pole / trailing shield.
      const pc = (POLE.lead + POLE.trail) / 2;
      const rc = (X.ret[0] + X.ret[1]) / 2;
      const sc = (X.shield[0] + X.shield[1]) / 2;
      const lines: [number, number, number][][] = [];
      for (const dz of [-3, 0, 3]) {
        lines.push([
          [pc, h0 + 8, dz],
          [pc, h0 - 1, dz],
          [pc - 0.5, -6, dz],
          [pc - 4.5, -9.5, dz * 1.4],
          [rc + 5, -9.8, dz * 1.6],
          [rc + 0.5, -6, dz * 1.4],
          [rc, h0 + 1, dz],
          [rc, h0 + 8, dz],
        ]);
      }
      for (const dz of [-2, 2]) {
        lines.push([
          [POLE.trail - 0.5, h0 + 3, dz],
          [POLE.trail + 0.5, -3, dz],
          [(POLE.trail + sc) / 2, -7.2, dz],
          [sc - 1, -3, dz],
          [sc - 0.5, h0 + 3, dz],
        ]);
      }
      const parts = [];
      for (const pts of lines) {
        const curve = new CatmullRomCurve3(pts.map((p) => new Vector3(...p)));
        parts.push(new TubeGeometry(curve, 48, 0.22, 6, false));
        // arrowhead pointing along the line
        const p = curve.getPointAt(0.32);
        const t = curve.getTangentAt(0.32);
        const cone = new ConeGeometry(0.75, 1.9, 10);
        // lookAt(eye, target) aims the matrix's +Z from target to eye: point it along the tangent.
        const m = new Matrix4().lookAt(t, new Vector3(0, 0, 0), new Vector3(0, 0, 1));
        cone.rotateX(Math.PI / 2);
        cone.applyMatrix4(m);
        cone.translate(p.x, p.y, p.z);
        parts.push(cone);
      }
      return merge(parts);
    }),
    flyGauge: cached("hdd-dd-flygauge", () => {
      const x0 = POLE.lead - 9;
      const x1 = POLE.trail + 9;
      const xm = (x0 + x1) / 2;
      return merge([
        beam([x0, 0, 26], [x1, 0, 26], 0.09, 6),
        beam([x0, h0, 26], [x1, h0, 26], 0.09, 6),
        beam([xm, -2.4, 26], [xm, h0 + 2.4, 26], 0.08, 6),
        new ConeGeometry(0.42, 1.0, 10).translate(xm, -0.65, 26),
        new ConeGeometry(0.42, 1.0, 10).rotateX(Math.PI).translate(xm, h0 + 0.65, 26),
      ]);
    }),
  };
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

/** Where the magnified slider and the close-up sit inside the deep-dive group. */
const LAYOUT = {
  strip: { x0: -76, x1: 34, z: 34 },
  abs: { pos: [-66, 52, -4] as [number, number, number], rot: [-2.09, 0, 0] as [number, number, number] },
  close: [0, 50, 0] as [number, number, number],
};

/**
 * The magnified views that appear at full explode: the slider flying over a
 * strip of platter (×60), its air-bearing surface, and a schematic cut through
 * the read/write head over the magnetic grains (≈×250,000).
 */
export function DeepDive() {
  const head = useMemo(headGeos, []);
  const { geos: media } = useMediaLayers();
  const poleMat = useMemo(() => {
    const m = DM.pole().clone();
    m.name = "hdd-dd:pole-live";
    return m;
  }, []);
  const callouts = useMemo(
    () =>
      cached("hdd-dd-callouts", () => {
        const [cx, cy, cz] = LAYOUT.close;
        const yb = cy + MEDIA.sub;
        const corners: [number, number, number][] = [
          [cx + MEDIA.x0, yb, cz + MEDIA.z],
          [cx + MEDIA.x0, yb, cz - MEDIA.z],
          [cx + MEDIA.x1, yb, cz + MEDIA.z],
          [cx + MEDIA.x1, yb, cz - MEDIA.z],
        ];
        return merge(corners.map((c) => beam([0.2, 0.9, 0], c, 0.12, 6)));
      }),
    [],
  );
  const s = LAYOUT.strip;
  const cy = LAYOUT.close[1];
  const lx = MEDIA.x0 - 8;
  return (
    <group>
      {/* magnifier ring around the read/write element on the ×60 slider */}
      <mesh geometry={cached("hdd-dd-ring", () => new TorusGeometry(3.2, 0.22, 8, 40).rotateY(Math.PI / 2))} material={DM.marker()} position={[0.3, 1.6, 0]} />
      <mesh geometry={callouts} material={DM.callout()} />
      <Label at={[-20, cy + HEAD.top + 14, 0]} size={4.2} color="#ffffff">
        Deep dive: the read/write head
      </Label>

      <Part id="dd-platter">
        <mesh geometry={roundedBox(s.x1 - s.x0, 3.2, 2 * s.z, 0.6)} material={HM.castMachined} position={[(s.x0 + s.x1) / 2, -1.7, 0]} receiveShadow />
        <mesh geometry={cached("hdd-dd-strip-top", () => roundedBox(s.x1 - s.x0 - 1.2, 0.2, 2 * s.z - 1.2, 0.08))} material={DM.mirror()} position={[(s.x0 + s.x1) / 2, -0.08, 0]} receiveShadow />
        <mesh
          geometry={cached("hdd-dd-arrow", () => {
            const pts: Pt[] = [
              [-30, -1.1],
              [-6, -1.1],
              [-6, -3.2],
              [0, 0],
              [-6, 3.2],
              [-6, 1.1],
              [-30, 1.1],
            ];
            return slab(shapeOf(pts), 0.05, 0.3, 0);
          })}
          material={DM.callout()}
          position={[s.x1 - 4, 0, 27]}
        />
        <Label at={[-30, -1, 41]} size={2.6}>
          Platter surface ×60 — moving this way at up to 125 km/h
        </Label>
      </Part>

      <group rotation={[0, 0, -0.012]}>
        <Part id="dd-slider">
          <Slider />
          <Label at={[-30, -1, -40]} size={2.6}>
            Slider ×60 (AlTiC ceramic)
          </Label>
          <Part id="dd-gimbal">
            <Gimbal />
            <Label at={[-56, 31, 18]} to={[-52, SL.back + 7, 8]} size={2.4}>
              Gimbal & load beam
            </Label>
          </Part>
        </Part>
      </group>

      <Part id="dd-abs" position={LAYOUT.abs.pos} rotation={LAYOUT.abs.rot}>
        <group position={[SL.len / 2, -SL.back / 2, 0]}>
          <Slider />
        </group>
        <Label at={[0, 26, 0]} size={2.6}>
          Air-bearing surface (underside, ×60)
        </Label>
      </Part>

      <Part id="dd-head" position={LAYOUT.close}>
        <mesh geometry={head.alumina} material={DM.alumina()} />
        <Label at={[0, HEAD.top + 6.5, 0]} size={3.0} color="#ffffff">
          Read/write head ≈×250,000 (schematic)
        </Label>
        <Part id="dd-shields">
          <mesh geometry={head.shields} material={DM.shield()} castShadow receiveShadow />
          <Label at={[(X.s1[0] + X.s2[1]) / 2, HEAD.top - 3, 25]} to={[(X.s1[0] + X.s2[1]) / 2, HEAD.top - 6, 20]} size={2}>
            Magnetic shields
          </Label>
        </Part>
        <Part id="dd-reader">
          <mesh geometry={head.pinned} material={DM.pinned()} />
          <mesh geometry={head.barrier} material={DM.barrier()} />
          <mesh geometry={head.free} material={DM.free()} />
          <mesh geometry={head.bias} material={DM.shield()} />
          <Label at={[(X.tmr[0] + X.tmr[1]) / 2, 13, 27]} to={[(X.tmr[0] + X.tmr[1]) / 2, 5, 3.8]} size={2}>
            TMR read sensor
          </Label>
        </Part>
        <Part id="dd-heater">
          <mesh geometry={head.heater} material={DM.heater()} />
          <Label at={[(X.heater[0] + X.heater[1]) / 2, 27, 27]} to={[(X.heater[0] + X.heater[1]) / 2, 22, 8]} size={1.9}>
            Heater
          </Label>
        </Part>
        <Part id="dd-writer">
          <mesh geometry={head.returnPole} material={DM.shield()} castShadow receiveShadow />
          <mesh geometry={head.pole} material={poleMat} castShadow receiveShadow />
          <mesh geometry={head.trailing} material={DM.shield()} castShadow receiveShadow />
          <mesh geometry={head.flux} material={DM.flux()} />
          <Label at={[(POLE.lead + POLE.trail) / 2, 14, 27]} to={[(POLE.lead + POLE.trail) / 2, 4, 5]} size={2}>
            Write pole
          </Label>
          <Label at={[X.shield[1] + 2, 17, 27]} to={[X.shield[1] - 2, 10, 20]} size={1.9}>
            Trailing shield
          </Label>
          <Part id="dd-coil">
            <mesh geometry={head.coil} material={HM.coilCopper} castShadow />
            <Label at={[(X.coil[0] + X.coil[1]) / 2, 31, 27]} to={[(X.coil[0] + X.coil[1]) / 2, 21, 22]} size={1.9}>
              Write coil
            </Label>
          </Part>
        </Part>
        <Part id="dd-fly-height">
          <mesh geometry={head.flyGauge} material={DM.marker()} />
          <Label at={[MEDIA.x1 + 8, 1.5, 26]} size={1.8}>
            Fly height ≈ 3 nm
          </Label>
        </Part>
        <Part id="dd-media">
          <mesh geometry={media.ru} material={DM.ru()} receiveShadow />
          <mesh geometry={media.sul} material={DM.sul()} receiveShadow />
          <mesh geometry={media.sub} material={DM.substrate()} receiveShadow />
          <Label at={[lx, -10, 22]} to={[MEDIA.x0, -10, 20]} size={1.8}>
            Soft underlayer
          </Label>
          <Part id="dd-grains">
            <Grains poleMat={poleMat} />
            <Label at={[lx, -3, 22]} to={[MEDIA.x0, -2.6, 20]} size={1.8}>
              Magnetic grains
            </Label>
            <Label at={[0, MEDIA.sub - 4, 28]} size={1.8}>
              Tracks 64 nm apart · bits ≈ 12 nm · grains ≈ 8 nm
            </Label>
          </Part>
          <Part id="dd-overcoat">
            <mesh geometry={media.carbon} material={DM.carbon()} />
            <Label at={[lx, 3, 22]} to={[MEDIA.x0, -0.4, 20]} size={1.8}>
              Carbon overcoat + lube
            </Label>
          </Part>
        </Part>
      </Part>
    </group>
  );
}

export { Reveal };
