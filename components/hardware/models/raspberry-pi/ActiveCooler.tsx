"use client";

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import {
  BoxGeometry,
  CatmullRomCurve3,
  CircleGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  InstancedMesh,
  Object3D,
  Shape,
  TubeGeometry,
  Vector3,
  type BufferGeometry,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { useExplorer } from "@/lib/hardware/store";
import { FONT_SANS } from "@/lib/three/painter";
import { Screw } from "../../kit/Fasteners";
import { cached, circlePath, roundedBox } from "../../kit/geometry";
import { MAT, variant } from "../../kit/materials";
import { paintedMaterial } from "./paint";
import { COOLER, COOLER_HOLES, COOLER_TOP, FAN_CONN, PMIC, RP1, SOC, SOC_Y, WIFI, wx, wz } from "./layout";

type Vec3 = [number, number, number];

/** Bead-blasted, clear-anodised aluminium. */
const anodised = () => variant("pi5-anodised", MAT.aluminum, { color: "#a9adb3", roughness: 0.56, metalness: 0.9 });

// ---------------------------------------------------------------------------
// Heatsink
// ---------------------------------------------------------------------------

/** Base-plate outline (from the official drawing), in world XZ (shape y = world z). */
function baseShape() {
  const P = (x: number, z: number) => [wx(x), wz(z)] as const;
  const s = new Shape();
  s.moveTo(...P(7.0, 6.9));
  s.lineTo(...P(62.0, 6.9));
  s.quadraticCurveTo(...P(64.0, 6.9), ...P(64.0, 8.9));
  s.lineTo(...P(64.0, 35.0));
  s.quadraticCurveTo(...P(64.0, 37.95), ...P(61.0, 37.95));
  s.lineTo(...P(46.6, 37.95));
  s.quadraticCurveTo(...P(45.9, 37.95), ...P(45.4, 38.45));
  s.lineTo(...P(37.9, 46.4));
  s.quadraticCurveTo(...P(37.4, 46.9), ...P(36.7, 46.9));
  s.lineTo(...P(6.47, 46.9));
  // Lobe around the lower-left push pin.
  const [cx, cz] = P(3.5, 46.5);
  s.absarc(cx, cz, 3.0, Math.atan2(0.4, 2.97), (225 * Math.PI) / 180, false);
  s.lineTo(...P(7.0, 37.3));
  s.lineTo(...P(7.0, 6.9));
  for (const [x, z] of COOLER_HOLES) s.holes.push(circlePath(wx(x), wz(z), 1.55));
  return s;
}

function baseGeometry() {
  return cached("pi5-cooler-base", () => {
    const t = COOLER.baseT;
    const g = new ExtrudeGeometry(baseShape(), { depth: t - 0.3, bevelEnabled: true, bevelThickness: 0.15, bevelSize: 0.25, bevelSegments: 2, curveSegments: 24 });
    // Shape (x, y) lies in XY; rotate so y → +z and the extrusion runs down from y = t.
    g.rotateX(Math.PI / 2);
    g.translate(0, t - 0.15, 0);
    return g;
  });
}

/**
 * One cross-cut pin fin with a rippled surface (the extrusion's serrations).
 * Instanced 54 times.
 */
function finGeometry() {
  return cached("pi5-cooler-fin", () => {
    const { finW: w, finD: d, finH: h } = COOLER;
    const g = new BoxGeometry(w, h, d, 1, 40, 1);
    const pos = g.getAttribute("position");
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) + h / 2;
      const ripple = 0.09 * Math.cos((y / h) * Math.PI * 2 * 5.5);
      const taper = 1 - 0.1 * (y / h);
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setX(i, Math.sign(x) * (w / 2 + ripple) * taper);
      pos.setZ(i, Math.sign(z) * (d / 2) * (1 - 0.05 * (y / h)));
      pos.setY(i, y);
    }
    g.computeVertexNormals();
    return g;
  });
}

const fdummy = new Object3D();

export function Heatsink() {
  const fins = useRef<InstancedMesh>(null);
  const cells = useMemo(() => COOLER.finCols.flatMap((x) => COOLER.finRows.map((z) => [x + COOLER.finW / 2, z + COOLER.finD / 2] as const)), []);
  useLayoutEffect(() => {
    const m = fins.current;
    if (!m) return;
    cells.forEach(([x, z], i) => {
      fdummy.position.set(wx(x), COOLER_TOP, wz(z));
      fdummy.updateMatrix();
      m.setMatrixAt(i, fdummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
    m.computeBoundingBox();
  }, [cells]);
  return (
    <group>
      <mesh geometry={baseGeometry()} material={anodised()} position-y={COOLER.baseBottom} castShadow receiveShadow />
      <instancedMesh ref={fins} args={[finGeometry(), anodised(), cells.length]} castShadow receiveShadow />
      {/* Raised pads that seat the blower */}
      {[
        [30.0, 11.0],
        [54.5, 11.0],
        [54.5, 34.8],
        [31.0, 34.8],
      ].map(([x, z], i) => (
        <mesh key={i} geometry={roundedBox(4.4, COOLER.fan.lift, 3.2, 0.3)} material={anodised()} position={[wx(x), COOLER_TOP + COOLER.fan.lift / 2, wz(z)]} castShadow />
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Thermal pads (pre-applied to the underside of the heatsink)
// ---------------------------------------------------------------------------

const PADS: { x: number; z: number; w: number; d: number; top: number }[] = [
  { x: SOC.x, z: SOC.z, w: 14.6, d: 9.2, top: SOC_Y.lidTop },
  { x: RP1.x - 0.3, z: RP1.z, w: 11.0, d: 11.0, top: RP1.h },
  { x: WIFI.x, z: WIFI.z, w: 9.8, d: 12.2, top: WIFI.h },
  { x: PMIC.x, z: PMIC.z, w: 5.6, d: 5.6, top: PMIC.h },
];

export function ThermalPads() {
  const geo = useMemo(
    () =>
      cached("pi5-cooler-pads", () => {
        const parts: BufferGeometry[] = PADS.map(({ x, z, w, d, top }) => {
          const t = COOLER.baseBottom - top;
          const g = roundedBox(w, t, d, Math.min(0.25, t / 2.2)).clone();
          g.translate(wx(x), top + t / 2, wz(z));
          return g;
        });
        return mergeGeometries(parts)!;
      }),
    [],
  );
  return <mesh geometry={geo} material={variant("pi5-pad", MAT.thermalPad, { color: "#9aa6b2", roughness: 0.92 })} castShadow receiveShadow />;
}

// ---------------------------------------------------------------------------
// Spring-loaded push pins
// ---------------------------------------------------------------------------

function springGeometry() {
  return cached("pi5-spring", () => {
    const turns = 6.5;
    const len = 6.6;
    const r = 2.1;
    const pts: Vector3[] = [];
    const n = 160;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const a = t * turns * Math.PI * 2;
      pts.push(new Vector3(Math.cos(a) * r, t * len, Math.sin(a) * r));
    }
    return new TubeGeometry(new CatmullRomCurve3(pts), 260, 0.2, 6, false);
  });
}

function pinBodyGeometry() {
  return cached("pi5-pushpin", () => {
    const below = COOLER.baseBottom + 1.45 + 1.4; // through base gap, board and out the far side
    const head = new CylinderGeometry(3.1, 3.1, 1.4, 6);
    head.translate(0, COOLER.baseT + 7.0 + 0.7, 0);
    const collar = new CylinderGeometry(1.9, 1.9, 0.5, 20);
    collar.translate(0, COOLER.baseT + 6.85, 0);
    const shaft = new CylinderGeometry(1.2, 1.2, COOLER.baseT + 7 + below, 16);
    shaft.translate(0, (COOLER.baseT + 7 - below) / 2, 0);
    // Split barb that springs open under the board.
    const barb = new CylinderGeometry(1.25, 1.75, 1.0, 16);
    barb.translate(0, -below + 0.6, 0);
    const tip = new CylinderGeometry(0.9, 1.75, 0.6, 16);
    tip.translate(0, -below - 0.2, 0);
    return mergeGeometries([head.toNonIndexed(), collar.toNonIndexed(), shaft.toNonIndexed(), barb.toNonIndexed(), tip.toNonIndexed()])!;
  });
}

/** Two push pins (heads on top, barbs below the board). Origin = top of the heatsink base plane (y = baseBottom). */
export function PushPins() {
  return (
    <group>
      {COOLER_HOLES.map(([x, z]) => (
        <group key={x} position={[wx(x), COOLER.baseBottom, wz(z)]}>
          <mesh geometry={pinBodyGeometry()} material={MAT.plasticBlack} castShadow receiveShadow />
          <mesh geometry={springGeometry()} material={MAT.steel} position-y={COOLER.baseT + 0.1} castShadow />
          {/* slot that lets the barb squeeze through the hole */}
          <mesh geometry={cached("pi5-pin-slot", () => new BoxGeometry(0.35, 2.4, 3.8))} material={MAT.rubber} position-y={-(COOLER.baseBottom + 1.45 + 1.4) + 0.7} />
        </group>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Blower fan
// ---------------------------------------------------------------------------

const F = COOLER.fan;
/** Fan-local origin: the impeller axis, at the housing's base. */
const AXIS = { x: wx(COOLER.intake.x), z: wz(COOLER.intake.z) };
const FAN_BOTTOM = COOLER_TOP + F.lift;
const IMP = { r: 10.2, hub: 5.4, h: 4.6, blades: 31 };

/**
 * Square housing with a volute (scroll) inside. The impeller turns toward
 * increasing atan2(z, x); the scroll's radius grows the same way from the
 * cutwater to a straight discharge duct that opens toward the fins (−X).
 */
function housingWallsGeometry() {
  return cached("pi5-fan-walls", () => {
    const x0 = wx(F.x0) - AXIS.x;
    const x1 = wx(F.x1) - AXIS.x;
    const z0 = wz(F.z0) - AXIS.z;
    const z1 = wz(F.z1) - AXIS.z;
    const tongue = { a: (190 * Math.PI) / 180, r: 11.0 };
    const duct = { a: (450 * Math.PI) / 180, r: 14.2 };
    const s = new Shape();
    // Outer walls the long way round, from the cutwater lip to the duct.
    s.moveTo(x0, Math.sin(tongue.a) * tongue.r);
    s.lineTo(x0, z0);
    s.lineTo(x1, z0);
    s.lineTo(x1, z1);
    s.lineTo(x0, z1);
    s.lineTo(x0, duct.r);
    // Straight duct wall, then the spiral back to the cutwater.
    const steps = 64;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const a = duct.a + (tongue.a - duct.a) * t;
      const r = duct.r + (tongue.r - duct.r) * t;
      s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    s.closePath();
    const g = new ExtrudeGeometry(s, { depth: F.h - 1.0, bevelEnabled: false, curveSegments: 8 });
    g.rotateX(Math.PI / 2);
    g.translate(0, F.h - 0.5, 0);
    return g;
  });
}

function plateGeometry(withIntake: boolean) {
  return cached(`pi5-fan-plate:${withIntake}`, () => {
    const x0 = wx(F.x0) - AXIS.x;
    const x1 = wx(F.x1) - AXIS.x;
    const z0 = wz(F.z0) - AXIS.z;
    const z1 = wz(F.z1) - AXIS.z;
    const s = new Shape();
    const r = 1.6;
    s.moveTo(x0, z0 + r);
    s.quadraticCurveTo(x0, z0, x0 + r, z0);
    s.lineTo(x1 - r, z0);
    s.quadraticCurveTo(x1, z0, x1, z0 + r);
    s.lineTo(x1, z1 - r);
    s.quadraticCurveTo(x1, z1, x1 - r, z1);
    s.lineTo(x0 + r, z1);
    s.quadraticCurveTo(x0, z1, x0, z1 - r);
    s.closePath();
    if (withIntake) s.holes.push(circlePath(0, 0, COOLER.intake.r));
    for (const [sx, sz] of COOLER.fanScrews) s.holes.push(circlePath(wx(sx) - AXIS.x, wz(sz) - AXIS.z, 0.85));
    const g = new ExtrudeGeometry(s, { depth: 0.5, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 1, curveSegments: 40 });
    g.rotateX(Math.PI / 2);
    g.translate(0, 0.5, 0);
    return g;
  });
}

/** Forward-curved centrifugal impeller with a bottom shroud disc. */
function impellerGeometry() {
  return cached("pi5-impeller", () => {
    const parts: BufferGeometry[] = [];
    const blade = new Shape();
    // Thin curved blade (arc) from hub to tip, swept forward.
    const pts: [number, number][] = [];
    const n = 10;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const r = IMP.hub + 0.2 + (IMP.r - IMP.hub - 0.2) * t;
      const a = 0.55 * t * t;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    blade.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts.slice(1)) blade.lineTo(p[0], p[1]);
    for (let i = n; i >= 0; i--) {
      const t = i / n;
      const r = IMP.hub + 0.2 + (IMP.r - IMP.hub - 0.2) * t;
      const a = 0.55 * t * t + 0.05 + 0.03 * t;
      blade.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    blade.closePath();
    const one = new ExtrudeGeometry(blade, { depth: IMP.h, bevelEnabled: false, curveSegments: 2 });
    one.rotateX(-Math.PI / 2);
    for (let i = 0; i < IMP.blades; i++) {
      const b = one.clone();
      b.rotateY((i / IMP.blades) * Math.PI * 2);
      parts.push(b);
    }
    const disc = new CylinderGeometry(IMP.r, IMP.r, 0.35, 64);
    disc.translate(0, 0.17, 0);
    parts.push(disc.toNonIndexed());
    const hub = new CylinderGeometry(IMP.hub, IMP.hub + 0.1, IMP.h, 48);
    hub.translate(0, IMP.h / 2, 0);
    parts.push(hub.toNonIndexed());
    return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))!;
  });
}

function hubLabel() {
  const d = IMP.hub * 2;
  return paintedMaterial("fan-hub", d, d, 60, { color: "#121315", rough: 0.4, metal: 0.1, height: 0.5 }, (p) => {
    const c = d / 2;
    p.ring(c, c, c - 0.35, 0.18, { color: "#3a3c42", rough: 0.3, metal: 0.4, height: 0.55 });
    p.text("DC 5V", c, c - 0.9, 1.25, { color: "#d9dbe0", rough: 0.5, metal: 0, height: 0.55 }, { align: "center", baseline: "middle", font: FONT_SANS, weight: 800 });
    p.text("0.15A  8000rpm", c, c + 0.75, 0.62, { color: "#a9acb3", rough: 0.5, metal: 0, height: 0.55 }, { align: "center", baseline: "middle", font: FONT_SANS, weight: 700 });
  });
}

/** Spinning impeller (when animation is on). */
export function Impeller() {
  const rotor = useRef<Group>(null);
  useFrame((_, dt) => {
    const r = rotor.current;
    if (!r || !useExplorer.getState().animate) return;
    r.rotation.y -= dt * 2.2 * Math.PI * 2;
  });
  return (
    <group position={[AXIS.x, FAN_BOTTOM + 0.6, AXIS.z]}>
      <group ref={rotor}>
        <mesh geometry={impellerGeometry()} material={MAT.plasticSatin} castShadow receiveShadow />
        <mesh geometry={cached("pi5-hub-cap", () => { const g = new CircleGeometry(IMP.hub - 0.05, 48); g.rotateX(-Math.PI / 2); return g; })} material={hubLabel()} position-y={IMP.h + 0.01} />
      </group>
    </group>
  );
}

/** Housing (base plate, volute walls, top cover) with three screws. Fan-local coords. */
export function FanHousing() {
  return (
    <group position={[AXIS.x, FAN_BOTTOM, AXIS.z]}>
      <mesh geometry={plateGeometry(false)} material={MAT.plasticSatin} castShadow receiveShadow />
      <mesh geometry={housingWallsGeometry()} material={MAT.plasticSatin} castShadow receiveShadow />
      <mesh geometry={plateGeometry(true)} material={MAT.plasticSatin} position-y={F.h - 0.5} castShadow receiveShadow />
      {/* motor stator boss under the hub */}
      <mesh geometry={cached("pi5-fan-boss", () => new CylinderGeometry(3.2, 3.6, 0.8, 32))} material={MAT.plasticBlack} position-y={0.9} />
      {COOLER.fanScrews.map(([x, z], i) => (
        <Screw key={i} position={[wx(x) - AXIS.x, F.h, wz(z) - AXIS.z]} diameter={2.9} height={0.9} material={MAT.steelDark} />
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Fan cable and JST plug
// ---------------------------------------------------------------------------

const WIRE_COLOURS = ["#c62828", "#1e4fd8", "#141414", "#e8c21c"];

/** Cable centreline: from the housing wall, over to the FAN header (board-local coords). */
const CABLE_PATH: Vec3[] = [
  [wx(F.x1) - 0.2, FAN_BOTTOM + 2.2, wz(17.0)],
  [wx(F.x1) + 2.6, FAN_BOTTOM + 2.6, wz(16.2)],
  [wx(65.6), FAN_BOTTOM + 3.4, wz(13.4)],
  [wx(FAN_CONN.x) + 0.1, 9.6, wz(9.4)],
  [wx(FAN_CONN.x), 8.4, wz(FAN_CONN.z) + 0.2],
  [wx(FAN_CONN.x), 6.0, wz(FAN_CONN.z)],
];

let cableCache: TubeGeometry[] | null = null;
/** Four wires laid side by side as a flat ribbon that follows the centreline. */
function cableGeometries() {
  return (cableCache ??= (() => {
    const centre = new CatmullRomCurve3(CABLE_PATH.map((p) => new Vector3(...p)), false, "catmullrom", 0.4);
    const n = 64;
    const frames: { p: Vector3; side: Vector3 }[] = [];
    let side = new Vector3(0, 0, 1);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = centre.getPoint(t);
      const tan = centre.getTangent(t);
      const s = new Vector3().crossVectors(tan, new Vector3(0, 1, 0));
      if (s.lengthSq() > 0.05) side = s.normalize();
      // Near the plug the ribbon must line up with the header's pins (along Z).
      const blend = Math.max(0, (t - 0.7) / 0.3);
      const target = new Vector3(0, 0, 1);
      const sv = side.clone().lerp(side.dot(target) < 0 ? target.clone().negate() : target, blend).normalize();
      frames.push({ p, side: sv });
    }
    return WIRE_COLOURS.map((_, k) => {
      const o = (k - 1.5) * 0.62;
      const pts = frames.map(({ p, side: s }) => p.clone().addScaledVector(s, o));
      return new TubeGeometry(new CatmullRomCurve3(pts), 90, 0.29, 8, false);
    });
  })());
}

export function FanCable() {
  const geos = cableGeometries();
  const plugMat = variant("pi5-jst-plug", MAT.nylon, { color: "#efeadf", roughness: 0.5 });
  return (
    <group>
      {geos.map((g, i) => (
        <mesh key={i} geometry={g} material={variant(`pi5-wire-${i}`, MAT.plasticGloss, { color: WIRE_COLOURS[i], roughness: 0.35, clearcoat: 0.6 })} castShadow />
      ))}
      {/* JST-SH plug seated in the FAN header (its latch ridge faces the board edge) */}
      <mesh geometry={roundedBox(2.0, 3.7, 4.9, 0.18)} material={plugMat} position={[wx(FAN_CONN.x), 2.95, wz(FAN_CONN.z)]} castShadow />
      <mesh geometry={roundedBox(0.5, 1.2, 2.6, 0.15)} material={plugMat} position={[wx(FAN_CONN.x) + 1.15, 4.3, wz(FAN_CONN.z)]} />
    </group>
  );
}

