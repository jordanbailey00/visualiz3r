"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import {
  BoxGeometry,
  BufferGeometry,
  CubicBezierCurve3,
  CylinderGeometry,
  ExtrudeGeometry,
  InstancedMesh,
  Matrix4,
  MeshPhysicalMaterial,
  TubeGeometry,
  Vector2,
  Vector3,
  type Material,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { FONT_COND, FONT_SANS, painted, rng } from "@/lib/three/painter";
import { Part } from "../../Part";
import { BallGrid, Chip, FlipChip } from "../../kit/Chip";
import { boundsOf, cached, extrudedWalls, flatFace, roundedBox, roundedRectShape } from "../../kit/geometry";
import { MAT, variant } from "../../kit/materials";
import {
  CRYSTAL,
  CTRL,
  CTRL_DIE_TOP,
  CTRL_LID_TOP,
  CTRL_SO,
  DRAM,
  INDUCTOR,
  INDUCTORS,
  NAND_PKG,
  PMIC,
  STACK,
  STACK_BASE,
  TEST_POINTS,
  TSENSOR,
  dieY,
  dieZ,
} from "./layout";
import { DECAL_LIFT, MarkedPackage, decal, flatMarking } from "./markings";
import { Anchor } from "./ZoomGuide";
import { memo } from "./memo";
import { CTRL_DIE, NAND_DIE, paintControllerDie, paintNandDie } from "./paintDies";

type Vec3 = [number, number, number];

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

const once = <T extends Material>(key: string, make: () => T) => memo(`mat:${key}`, make);

function paintedMaterial(maps: ReturnType<typeof painted>, extra: ConstructorParameters<typeof MeshPhysicalMaterial>[0] = {}) {
  return new MeshPhysicalMaterial({
    map: maps.map,
    roughnessMap: maps.rmMap,
    metalnessMap: maps.rmMap,
    bumpMap: maps.bumpMap,
    bumpScale: 0.25,
    roughness: 1,
    metalness: 1,
    ...extra,
  });
}

/** Laser-etched marking on the controller's nickel-plated lid (whole top face). */
function lidTopMaterial() {
  return once("ssd-lid-top", () => {
    const w = CTRL.lid;
    const maps = painted("ssd-lid-top", w, w, 70, { color: "#d4d1cb", rough: 0.2, metal: 1, height: 0.5 }, (p) => {
      const r = rng(3);
      // Satin grain from the plating.
      for (let i = 0; i < 260; i++) {
        const y = r() * w;
        const c = 196 + Math.round(r() * 22);
        p.rect(0, y, w, 0.012 + r() * 0.02, { color: `rgb(${c},${c - 2},${c - 6})`, rough: 0.16 + r() * 0.12, metal: 1 });
      }
      const ink = { color: "#8d8a84", rough: 0.6, metal: 0.75, height: 0.45 };
      p.polygon(
        [
          [0.9, 0.9],
          [1.8, 0.9],
          [0.9, 1.8],
        ],
        ink,
      );
      p.text("NX-E4800", w / 2, w * 0.36, 1.25, ink, { align: "center", baseline: "middle", font: FONT_SANS, weight: 700, letterSpacing: 0.08 });
      p.text("NVMe 2.0  PCIe 4.0 ×4  8CH", w / 2, w * 0.52, 0.62, ink, { align: "center", baseline: "middle", font: FONT_COND, weight: 600 });
      p.text("2431-BA  TAIWAN", w / 2, w * 0.64, 0.62, ink, { align: "center", baseline: "middle", font: FONT_COND, weight: 600 });
      p.text("A1C7Q0.08", w / 2, w * 0.76, 0.62, ink, { align: "center", baseline: "middle", font: FONT_COND, weight: 600 });
    });
    return paintedMaterial(maps, { bumpScale: 0.15 });
  });
}

/** Controller die circuit side, revealed when the die flips over. */
function controllerDieShot() {
  return once("ssd-ctrl-dieshot", () => {
    const maps = painted("ssd-ctrl-dieshot", CTRL_DIE.w, CTRL_DIE.h, 240, { color: "#151821", rough: 0.2, metal: 0.6, height: 0.5 }, (p) =>
      paintControllerDie(p),
    );
    return new MeshPhysicalMaterial({
      map: maps.map,
      roughnessMap: maps.rmMap,
      metalnessMap: maps.rmMap,
      roughness: 1,
      metalness: 1,
      iridescence: 0.55,
      iridescenceIOR: 1.8,
      iridescenceThicknessRange: [200, 700],
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
  });
}

/** Unlabelled NAND die top (circuit side) shared by every die in a stack. */
export function nandDieTopMaterial() {
  return once("ssd-nand-die-top", () => {
    const maps = painted("ssd-nand-die-top", NAND_DIE.w, NAND_DIE.h, 90, { color: "#14161c", rough: 0.2, metal: 0.6, height: 0.5 }, (p) =>
      paintNandDie(p, false),
    );
    return new MeshPhysicalMaterial({
      map: maps.map,
      roughnessMap: maps.rmMap,
      metalnessMap: maps.rmMap,
      roughness: 1,
      metalness: 1,
      iridescence: 0.5,
      iridescenceIOR: 1.8,
      iridescenceThicknessRange: [200, 650],
    });
  });
}

const dieEdge = () => once("ssd-die-edge", () => variant("ssd-die-edge", MAT.silicon, { iridescence: 0, roughness: 0.35, color: "#3a3d45" }));
const dafMat = () => once("ssd-daf", () => variant("ssd-daf", MAT.epoxy, { color: "#2a2b2e", roughness: 0.6 }));
const sealantMat = () => once("ssd-sealant", () => variant("ssd-sealant", MAT.epoxy, { color: "#0d0d0e", roughness: 0.35, clearcoat: 0.6 }));
/** BT-resin package substrate with green solder mask. */
const pkgSubstrateMat = () =>
  once("ssd-pkg-substrate", () => variant("ssd-pkg-substrate", MAT.substrate, { color: "#2f4a2c", roughness: 0.4 }));
const goldWire = () => once("ssd-gold-wire", () => variant("ssd-gold-wire", MAT.gold, { roughness: 0.18, color: "#f3c86b" }));

// ---------------------------------------------------------------------------
// Controller: flip-chip die under a nickel-plated heat-spreader lid
// ---------------------------------------------------------------------------

/** A rounded-rect frame (outer minus inner) extruded upward by `h`. */
function frameGeometry(key: string, outer: number, inner: number, h: number, rOut: number, rIn: number) {
  return cached(`frame:${key}`, () => {
    const s = roundedRectShape(-outer / 2, -outer / 2, outer, outer, rOut);
    s.holes.push(roundedRectShape(-inner / 2, -inner / 2, inner, inner, rIn));
    const g = new ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 6 });
    g.rotateX(-Math.PI / 2);
    return g;
  });
}

/** Lid plate split into walls, a top face (UVs over its bounds) and a bottom face. */
function plateGeometry(size: number, r: number, t: number) {
  return memo(`ssd-lid-plate:${size}:${r}:${t}`, () => {
    const s = roundedRectShape(-size / 2, -size / 2, size, size, r);
    const b = boundsOf(s.getPoints(12) as Vector2[]);
    return { top: flatFace(s, b), bottom: flatFace(s, b, true), walls: extrudedWalls(s, t) };
  });
}

export function Controller() {
  const subTop = CTRL_SO + CTRL.subT;
  const plateBottom = CTRL_DIE_TOP + 0.03;
  const plate = plateGeometry(CTRL.lid, 0.95, CTRL.lidT);
  return (
    <Part id="controller" position={[CTRL.x, 0, CTRL.z]} explode={[0, 7, 0]} explodeRange={[0.42, 0.68]}>
      <FlipChip
        substrate={[CTRL.sub, CTRL.subT, CTRL.sub]}
        die={CTRL.die}
        ballPitch={CTRL.ballPitch}
        dieId="controller-die"
        substrateId="controller-substrate"
        dieShot={controllerDieShot()}
        dieExplode={{ lift: 5.5, flip: true, range: [0.66, 0.9] }}
      />
      <Part id="controller-lid" cover explode={[0, 6, 0]} explodeRange={[0.56, 0.78]}>
        {/* Black sealant bead that bonds the lid flange to the substrate. */}
        <mesh geometry={frameGeometry("ssd-sealant", CTRL.lid + 0.12, CTRL.lid - 0.6, 0.05, 1.0, 0.7)} material={sealantMat()} position-y={subTop} />
        <mesh
          geometry={frameGeometry("ssd-lid-flange", CTRL.lid, CTRL.lid - 1.3, plateBottom - subTop - 0.05, 0.95, 0.5)}
          material={MAT.nickel}
          position-y={subTop + 0.05}
          castShadow
          receiveShadow
        />
        <mesh geometry={plate.walls} material={MAT.nickel} position-y={CTRL_LID_TOP} castShadow receiveShadow />
        <mesh geometry={plate.top} material={lidTopMaterial()} position-y={CTRL_LID_TOP} castShadow receiveShadow />
        <mesh geometry={plate.bottom} material={MAT.nickel} position-y={plateBottom} />
        {/* Thermal interface material between the die and the lid. */}
        <mesh geometry={roundedBox(CTRL.die[0] - 0.2, 0.03, CTRL.die[2] - 0.2, 0.01)} material={MAT.thermalPaste} position-y={CTRL_DIE_TOP + 0.015} />
      </Part>
    </Part>
  );
}

// ---------------------------------------------------------------------------
// DRAM, PMIC, sensor
// ---------------------------------------------------------------------------

export function Dram() {
  return (
    <Part id="dram" explode={[0, 6.5, 0]} explodeRange={[0.42, 0.66]}>
      <MarkedPackage
        size={[DRAM.w, DRAM.h, DRAM.d]}
        position={[DRAM.x, 0, DRAM.z]}
        standoff={DRAM.so}
        marking={{ lines: ["LP4X 16Gb", "x16 4266", "2431 TW E1"], logo: "dot-ring", scale: 1.05 }}
        balls={{ pitch: 0.8 }}
      />
    </Part>
  );
}

export function Pmic() {
  return (
    <Part id="pmic" explode={[0, 5, 0]} explodeRange={[0.42, 0.64]}>
      <Chip kind="qfn" size={[PMIC.w, PMIC.h, PMIC.d]} position={[PMIC.x, 0, PMIC.z]} pins={6} marking={{ lines: ["PM8203", "2431 A"], logo: "triangle", scale: 1.05 }} />
    </Part>
  );
}

export function ThermalSensor() {
  return (
    <Part id="thermal-sensor" explode={[0, 4, 0]} explodeRange={[0.44, 0.66]}>
      <MarkedPackage size={[TSENSOR.w, TSENSOR.h, TSENSOR.d]} position={[TSENSOR.x, 0, TSENSOR.z]} standoff={0.05} dfnPins={3} marking={{ lines: ["T75"], pin1: true, scale: 1.4 }} />
    </Part>
  );
}

/** 2016-size moulded power inductors with printed values. */
export function Inductors() {
  const { w, h, d } = INDUCTOR;
  const term = cached("ssd-ind-term", () => {
    const a = new BoxGeometry(0.42, h * 0.62, d * 0.86);
    a.translate(-w / 2 + 0.2, h * 0.31, 0);
    const b = a.clone();
    b.translate(w - 0.4, 0, 0);
    return mergeGeometries([a, b])!;
  });
  return (
    <Part id="inductors" explode={[0, 5, 0]} explodeRange={[0.42, 0.64]}>
      {INDUCTORS.map((l, i) => (
        <group key={i} position={[l.x, 0, l.z]}>
          <mesh geometry={roundedBox(w - 0.04, h, d, 0.14, 3)} material={MAT.ferrite} position-y={h / 2 + 0.02} castShadow receiveShadow />
          <mesh
            geometry={decal(w - 0.5, d - 0.4)}
            material={flatMarking(w - 0.5, d - 0.4, { lines: [l.label], pin1: false, ink: "#c9cacd", base: "#3b3c40", scale: 1.6 })}
            position-y={h + 0.02 + DECAL_LIFT}
          />
          <mesh geometry={term} material={MAT.tin} />
        </group>
      ))}
    </Part>
  );
}

/** Quartz crystal in a 2016 ceramic package with a seam-welded metal lid. */
export function Crystal() {
  const { w, d, h } = CRYSTAL;
  return (
    <Part id="crystal" explode={[0, 4.5, 0]} explodeRange={[0.42, 0.64]}>
      <group position={[CRYSTAL.x, 0, CRYSTAL.z]}>
        <mesh geometry={roundedBox(w, h * 0.55, d, 0.06)} material={MAT.ceramic} position-y={(h * 0.55) / 2} castShadow receiveShadow />
        <mesh geometry={roundedBox(w - 0.22, h * 0.45, d - 0.22, 0.05)} material={MAT.nickel} position-y={h * 0.55 + (h * 0.45) / 2} castShadow />
        <mesh
          geometry={decal(w - 0.5, d - 0.45)}
          material={flatMarking(w - 0.5, d - 0.45, { lines: ["40.000"], pin1: false, ink: "#8c8984", base: "#d6d3ce", scale: 1.4 }, true)}
          position-y={h + DECAL_LIFT}
        />
      </group>
    </Part>
  );
}

/** Gold test pads, slightly domed with solder. */
export function TestPoints() {
  const ref = useRef<InstancedMesh>(null);
  const geo = cached("ssd-tp", () => new CylinderGeometry(0.44, 0.47, 0.035, 20).translate(0, 0.0175, 0));
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const t = new Matrix4();
    TEST_POINTS.forEach(([x, z], i) => m.setMatrixAt(i, t.makeTranslation(x, 0, z)));
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
    m.computeBoundingBox();
  }, []);
  return (
    <Part id="test-points">
      <instancedMesh ref={ref} args={[geo, MAT.gold, TEST_POINTS.length]} receiveShadow />
    </Part>
  );
}

// ---------------------------------------------------------------------------
// NAND package: substrate, staircase die stack, gold wires, mould cap
// ---------------------------------------------------------------------------

/** Positions of the bond pads on die k and of their landing fingers. */
function wirePaths(): [Vector3, Vector3, Vector3, Vector3][] {
  const out: [Vector3, Vector3, Vector3, Vector3][] = [];
  const n = STACK.wiresPerDie;
  const span = STACK.dieW - 1.6;
  for (let k = 0; k < STACK.dies; k++) {
    const yTop = dieY(k) + STACK.dieT / 2;
    const zPad = dieZ(k) + STACK.dieD / 2 - 0.16;
    const row = k % 2;
    const zFinger = STACK.front0 + 0.62 + row * 0.42;
    for (let i = 0; i < n; i++) {
      const x = -span / 2 + (i * span) / (n - 1) + (k - 3.5) * 0.085;
      const a = new Vector3(x, yTop + 0.005, zPad);
      const d = new Vector3(x * 1.04, STACK_BASE + 0.01, zFinger);
      const loop = 0.22 + k * 0.035;
      const b = new Vector3(x, yTop + loop, zPad + 0.12);
      const c = new Vector3(x * 1.03, STACK_BASE + 0.25 + loop * 0.5, zFinger - 0.18);
      out.push([a, b, c, d]);
    }
  }
  return out;
}

function nandGeometries() {
  return memo("ssd-nand-internals", () => {
    // Gold wires.
    const tubes: BufferGeometry[] = [];
    for (const [a, b, c, d] of wirePaths()) {
      tubes.push(new TubeGeometry(new CubicBezierCurve3(a, b, c, d), 10, 0.016, 4, false));
    }
    const wires = mergeGeometries(tubes)!;
    // Bond fingers on the substrate (two staggered rows) + wire landing balls.
    const fingers: BufferGeometry[] = [];
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < STACK.wiresPerDie * 4; i++) {
        const x = -STACK.dieW / 2 + 0.3 + (i * (STACK.dieW - 0.6)) / (STACK.wiresPerDie * 4 - 1);
        const f = new BoxGeometry(0.09, 0.012, 0.32);
        f.translate(x * 1.04, STACK_BASE + 0.006, STACK.front0 + 0.62 + row * 0.42);
        fingers.push(f);
      }
    }
    // Die-attach film under every die.
    const daf: BufferGeometry[] = [];
    for (let k = 0; k < STACK.dies; k++) {
      const f = new BoxGeometry(STACK.dieW, STACK.dafT, STACK.dieD);
      f.translate(0, dieY(k) - STACK.dieT / 2 - STACK.dafT / 2, dieZ(k));
      daf.push(f);
    }
    return { wires, fingers: mergeGeometries(fingers)!, daf: mergeGeometries(daf)! };
  });
}

/** The eight dies as one instanced box: silicon edges, circuit-side tops. */
function DieStack() {
  const ref = useRef<InstancedMesh>(null);
  const geo = cached("ssd-die-box", () => new BoxGeometry(STACK.dieW, STACK.dieT, STACK.dieD));
  const materials = useMemo(() => {
    const e = dieEdge();
    return [e, e, nandDieTopMaterial(), e, e, e];
  }, []);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const t = new Matrix4();
    for (let k = 0; k < STACK.dies; k++) m.setMatrixAt(k, t.makeTranslation(0, dieY(k), dieZ(k)));
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
    m.computeBoundingBox();
  }, []);
  return <instancedMesh ref={ref} args={[geo, materials, STACK.dies]} castShadow receiveShadow />;
}

function moldMarking(lines: string[]) {
  return flatMarking(NAND_PKG.w - 0.6, NAND_PKG.d - 0.6, { lines, logo: "wave", scale: 0.95 });
}

/**
 * One NAND flash package in package-local coordinates (PCB surface at y = 0).
 * With `deep`, the substrate, die stack, wires and mould become separately
 * selectable parts (the mould is a cover for X-ray and hinges open).
 */
export function NandPackage({
  marking,
  deep,
  moldOpen,
}: {
  marking: string[];
  deep?: boolean;
  /** Mould motion when opened (deep variant). */
  moldOpen?: { explode: Vec3; rotate: Vec3; range: [number, number]; hinge: Vec3 };
}) {
  const { w, d, h, so, subT } = NAND_PKG;
  const geos = nandGeometries();
  const moldH = h - subT;
  const mold = (
    <>
      <mesh geometry={roundedBox(w, moldH, d, 0.12)} material={MAT.epoxy} position-y={STACK_BASE + moldH / 2} castShadow receiveShadow />
      <mesh geometry={decal(w - 0.6, d - 0.6)} material={moldMarking(marking)} position-y={STACK_BASE + moldH + DECAL_LIFT} />
    </>
  );
  const substrate = (
    <>
      <mesh geometry={roundedBox(w, subT, d, 0.05)} material={pkgSubstrateMat()} position-y={so + subT / 2} castShadow receiveShadow />
      <mesh geometry={geos.fingers} material={MAT.gold} />
      <BallGrid w={w} d={d} pitch={1.0} inset={1.0} y={so / 2} r={so * 0.62} hollow={5} />
    </>
  );
  if (!deep) {
    return (
      <group>
        {substrate}
        {mold}
      </group>
    );
  }
  const hinge = moldOpen?.hinge ?? [0, 0, 0];
  return (
    <group>
      <Part id="nand-substrate">{substrate}</Part>
      <Part id="nand-die-stack">
        <DieStack />
        <mesh geometry={geos.daf} material={dafMat()} />
        {/* Corners of the top die: the zoom guides start here. */}
        {[
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ].map(([sx, sz], i) => (
          <Anchor key={i} name={`stack-${i}`} position={[(sx * STACK.dieW) / 2, dieY(STACK.dies - 1) + STACK.dieT / 2, dieZ(STACK.dies - 1) + (sz * STACK.dieD) / 2]} />
        ))}
      </Part>
      <Part id="bond-wires">
        <mesh geometry={geos.wires} material={goldWire()} castShadow />
      </Part>
      <Part
        id="nand-mold"
        cover
        position={hinge}
        explode={moldOpen?.explode}
        explodeRotate={moldOpen?.rotate}
        explodeRange={moldOpen?.range}
      >
        <group position={[-hinge[0], -hinge[1], -hinge[2]]}>{mold}</group>
      </Part>
    </group>
  );
}

export { nandGeometries };
