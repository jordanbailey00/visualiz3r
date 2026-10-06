"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import {
  BoxGeometry,
  CylinderGeometry,
  InstancedMesh,
  Object3D,
  SphereGeometry,
  TubeGeometry,
  type BufferGeometry,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { FONT_COND, FONT_SANS, type Surface } from "@/lib/three/painter";
import { cached, flatFace, roundedBox } from "../../kit/geometry";
import { MAT, variant } from "../../kit/materials";
import { bentPath } from "../../kit/Thermal";
import { satin } from "./floorplan";
import { FRAME, FRAME_SCREWS, LEVER, PLATE, SOCKET } from "./layout";
import {
  alignTop,
  circlePoints,
  paintOnce,
  paintedMaterial,
  PanScrew,
  roundedPolygon,
  roundedRectPoints,
  shapeBounds,
  shapeFrom,
  Slab,
  lgaPoints,
} from "./shapes";

type Pt = [number, number];

// ---------------------------------------------------------------------------
// Socket housing
// ---------------------------------------------------------------------------

const C = SOCKET.cavity;
/** Cavity outline with finger-access notches in the front and back walls. */
const CAVITY_PTS: Pt[] = roundedPolygon(
  [
    [-C, -C],
    [-5.5, -C],
    [-5.5, -C - 1.75],
    [5.5, -C - 1.75],
    [5.5, -C],
    [C, -C],
    [C, C],
    [5.5, C],
    [5.5, C + 1.75],
    [-5.5, C + 1.75],
    [-5.5, C],
    [-C, C],
  ],
  [0.5, 0.35, 0.35, 0.35, 0.35, 0.5, 0.5, 0.35, 0.35, 0.35, 0.35, 0.5],
  4,
);
const HOUSING_SHAPE = shapeFrom(roundedRectPoints(0, 0, SOCKET.half * 2, SOCKET.half * 2, 1.0), [CAVITY_PTS]);
const FLOOR_SHAPE = shapeFrom(CAVITY_PTS);

const LCP: Surface = { color: "#17181b", rough: 0.5, metal: 0, height: 0.5 };
const HOUSING_PLASTIC = () => variant("cpu-lcp", MAT.plasticBlack, { color: "#17181b", roughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.5 });

/** Angle of the contacts in plan view (they lean diagonally across the grid). */
const CONTACT_YAW = Math.PI / 4;
/** Where each contact's root sits relative to its tip (x, z). */
const ROOT_OFFSET: Pt = [-0.5 * Math.sin(CONTACT_YAW), -0.5 * Math.cos(CONTACT_YAW)];

function housingTopMaterial() {
  const b = shapeBounds(HOUSING_SHAPE);
  const maps = paintOnce("cpu-housing-top", b.w, b.h, 20, LCP, (p) => {
    alignTop([p.c, p.m, p.hgt], b);
    const mould: Surface = { color: "#202125", rough: 0.35, metal: 0, height: 0.62 };
    p.text("LGA1718", -16, 21.6, 1.15, mould, { font: FONT_SANS, weight: 800, baseline: "middle", letterSpacing: 0.12 });
    p.text("94V-0  LCP", 9.5, -21.6, 0.9, mould, { font: FONT_COND, weight: 700, baseline: "middle" });
    p.polygon(
      [
        [-22.3, 22.3],
        [-22.3, 20.5],
        [-20.5, 22.3],
      ],
      { color: "#3a3b40", rough: 0.4, metal: 0, height: 0.65 },
    );
    // Ejector-pin marks left by the moulding tool.
    for (const [x, z] of [
      [-21.6, -12],
      [21.6, -12],
      [-21.6, 12],
      [21.6, 12],
      [-12, -21.6],
      [12, 21.6],
    ] as Pt[]) {
      p.ring(x, z, 0.55, 0.08, { color: "#25262a", rough: 0.3, metal: 0, height: 0.45 });
    }
  });
  return paintedMaterial("cpu-housing-top", maps, { bumpScale: 0.25, metalness: 0 });
}

function housingFloorMaterial() {
  const b = shapeBounds(FLOOR_SHAPE);
  const maps = paintOnce("cpu-housing-floor", b.w, b.h, 24, LCP, (p) => {
    alignTop([p.c, p.m, p.hgt], b);
    const slot: Surface = { color: "#060607", rough: 0.9, metal: 0, height: 0.2 };
    const deg = 45;
    for (const [x, z] of lgaPoints()) {
      const rx = x + ROOT_OFFSET[0];
      const rz = z + ROOT_OFFSET[1];
      p.shape((ctx) => {
        ctx.save();
        ctx.translate(rx, rz);
        ctx.rotate((deg * Math.PI) / 180);
        ctx.rect(-0.16, -0.36, 0.32, 0.72);
        ctx.restore();
      }, slot);
    }
    // Stand-offs that stop the package from over-compressing the springs.
    for (const [x, z] of [
      [-19.2, -19.2],
      [19.2, -19.2],
      [-19.2, 19.2],
      [19.2, 19.2],
    ] as Pt[]) {
      p.circle(x, z, 0.6, { color: "#222327", rough: 0.4, metal: 0, height: 0.7 });
    }
  });
  return paintedMaterial("cpu-housing-floor", maps, { bumpScale: 0.3, metalness: 0 });
}

export function SocketHousing() {
  const floor = useMemo(() => cached("cpu-housing-floorface", () => flatFace(FLOOR_SHAPE, shapeBounds(FLOOR_SHAPE), false)), []);
  const keys = useMemo(
    () =>
      cached("cpu-housing-keys", () => {
        const h = SOCKET.top - 0.35 - SOCKET.floor;
        const parts = [-1, 1].map((s) => {
          const g = new CylinderGeometry(0.85, 0.85, h, 16);
          g.translate(s * C, SOCKET.floor + h / 2, SOCKET.keyZ);
          return g;
        });
        return mergeGeometries(parts)!;
      }),
    [],
  );
  const plastic = HOUSING_PLASTIC();
  return (
    <group>
      <Slab shape={HOUSING_SHAPE} y0={SOCKET.bottom} y1={SOCKET.top} top={housingTopMaterial()} side={plastic} />
      <mesh geometry={floor} material={housingFloorMaterial()} position-y={SOCKET.floor} receiveShadow />
      <mesh geometry={keys} material={plastic} castShadow receiveShadow />
    </group>
  );
}

/** One stamped spring contact: root in the floor, cantilever arm, rounded tip. */
function contactGeometry() {
  return cached("cpu-contact", () => {
    const root = new BoxGeometry(0.3, 0.32, 0.28);
    root.translate(0, -0.1, -0.5);
    const ax = 0.42;
    const ay = 0.7;
    const len = Math.hypot(ax, ay);
    const arm = new BoxGeometry(0.24, 0.055, len);
    arm.rotateX(-Math.atan2(ay, ax));
    arm.translate(0, 0.04 + ay / 2, -0.46 + ax / 2);
    const tip = new BoxGeometry(0.26, 0.09, 0.22);
    tip.rotateX(0.35);
    tip.translate(0, 0.78, 0);
    const g = mergeGeometries([root, arm, tip])!;
    g.rotateY(CONTACT_YAW);
    return g;
  });
}

const tmp = new Object3D();

/** 1718 gold-plated spring contacts, one per land of the package. */
export function SocketContacts() {
  const ref = useRef<InstancedMesh>(null);
  const pts = lgaPoints();
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    pts.forEach(([x, z], i) => {
      tmp.position.set(x, SOCKET.floor, z);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
    m.computeBoundingBox();
  }, [pts]);
  return <instancedMesh ref={ref} args={[contactGeometry(), MAT.gold, pts.length]} receiveShadow />;
}

// ---------------------------------------------------------------------------
// Retention frame (stiffener), hinge and latch
// ---------------------------------------------------------------------------

const STAINLESS: Surface = { color: "#cacdd2", rough: 0.42, metal: 1, height: 0.5 };

const FRAME_SHAPE = shapeFrom(roundedRectPoints(0, 0, FRAME.halfX * 2, FRAME.halfZ * 2, 3), [
  roundedRectPoints(0, 0, FRAME.inner * 2, FRAME.inner * 2, 1.2),
  ...FRAME_SCREWS.map(([x, z]) => circlePoints(x, z, 1.6, 20)),
]);

function frameTopMaterial() {
  const b = shapeBounds(FRAME_SHAPE);
  const maps = paintOnce("cpu-frame-top", b.w, b.h, 12, STAINLESS, (p) => {
    satin(p, STAINLESS, 21, 1.5);
    alignTop([p.c, p.m, p.hgt], b);
    const stamp: Surface = { color: "#a5a9ae", rough: 0.42, metal: 1, height: 0.66 };
    p.polygon(
      [
        [-25.2, 33.8],
        [-25.2, 30.6],
        [-22.0, 33.8],
      ],
      stamp,
    );
    p.text("ILM-1718  R2", -12.5, 32.4, 1.4, stamp, { font: FONT_SANS, weight: 800, align: "center", baseline: "middle", letterSpacing: 0.2 });
    p.text("CLOSE ▸", 13.5, 32.4, 1.2, stamp, { font: FONT_SANS, weight: 700, align: "center", baseline: "middle" });
    // Embossed stiffening beads along the end bars.
    for (const z of [-26.0, 26.0]) p.roundRect(-11, z - 0.45, 22, 0.9, 0.45, { ...stamp, height: 0.62 });
  });
  return paintedMaterial("cpu-frame-top", maps, { bumpScale: 0.6 });
}

export function StiffenerFrame() {
  const extras = useMemo(
    () =>
      cached("cpu-frame-extras", () => {
        const parts: BufferGeometry[] = [];
        const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, r = 0.3) =>
          parts.push(roundedBox(x1 - x0, y1 - y0, z1 - z0, r).clone().translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2));
        // Raised side flanges (bent up for stiffness).
        for (const s of [-1, 1]) box(s > 0 ? 25.4 : -26.5, s > 0 ? 26.5 : -25.4, 0, 3.0, -20, 20);
        // Bearing ear for the lever axle (back right).
        box(24.3, 25.5, 0, LEVER.y + 1.8, LEVER.z - 1.3, LEVER.z + 1.3, 0.5);
        // Hinge ears for the load plate pin.
        for (const s of [-1, 1]) {
          const x = s * 15.3;
          box(x - 0.6, x + 0.6, 0, PLATE.hinge.y + 1.6, PLATE.hinge.z - 1.6, PLATE.hinge.z + 1.6, 0.5);
        }
        // Latch hook that holds the lever down (front right).
        box(25.3, 26.5, 0, 9.75, 26.4, 30.2, 0.3);
        box(25.3, 31.9, 8.95, 9.75, 26.4, 30.2, 0.3);
        box(31.1, 31.9, 8.1, 9.75, 26.4, 30.2, 0.3);
        // Hinge pin.
        const pin = new CylinderGeometry(0.8, 0.8, 32.8, 16);
        pin.rotateZ(Math.PI / 2);
        pin.translate(0, PLATE.hinge.y, PLATE.hinge.z);
        parts.push(pin.toNonIndexed());
        return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))!;
      }),
    [],
  );
  return (
    <group>
      <Slab shape={FRAME_SHAPE} y0={0} y1={FRAME.t} top={frameTopMaterial()} side={MAT.steel} />
      <mesh geometry={extras} material={MAT.steel} castShadow receiveShadow />
      {FRAME_SCREWS.map(([x, z], i) => (
        <PanScrew key={i} position={[x, FRAME.t, z]} diameter={5.2} height={1.6} drive="torx" material={MAT.steelDark} />
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Load plate (force frame)
// ---------------------------------------------------------------------------

const P = PLATE;
const PLATE_SHAPE = shapeFrom(
  roundedPolygon(
    [
      [-P.halfX, P.back],
      [P.halfX, P.back],
      [P.halfX, P.tab.z0],
      [P.tab.x1, P.tab.z0],
      [P.tab.x1, P.tab.z1],
      [P.halfX, P.tab.z1],
      [P.halfX, P.front],
      [5.6, P.front],
      [4.9, P.front + 1.8],
      [-4.9, P.front + 1.8],
      [-5.6, P.front],
      [-P.halfX, P.front],
    ],
    [2, 2, 0.8, 1.6, 1.6, 0.8, 2, 0.6, 0.7, 0.7, 0.6, 2],
    5,
  ),
  [roundedRectPoints(0, 0, P.window * 2, P.window * 2, 1.6)],
);

function plateTopMaterial() {
  const b = shapeBounds(PLATE_SHAPE);
  const maps = paintOnce("cpu-plate-top", b.w, b.h, 12, STAINLESS, (p) => {
    satin(p, STAINLESS, 33, 1.5);
    alignTop([p.c, p.m, p.hgt], b);
    const bead: Surface = { color: "#c4c8cd", rough: 0.3, metal: 1, height: 0.72 };
    // Pressed stiffening beads around the window.
    p.roundRect(-19.6, -25.6, 39.2, 1.1, 0.55, bead);
    p.roundRect(-19.6, 21.2, 39.2, 1.1, 0.55, bead);
    p.roundRect(-20.9, -19.0, 1.0, 38.0, 0.5, bead);
    p.roundRect(19.9, -19.0, 1.0, 38.0, 0.5, bead);
    // Contact pad where the plate presses the lid's legs, and a pin-1 mark.
    const stamp: Surface = { color: "#9da1a6", rough: 0.45, metal: 1, height: 0.4 };
    p.polygon(
      [
        [-21.4, 26.6],
        [-21.4, 23.9],
        [-18.7, 26.6],
      ],
      stamp,
    );
    p.text("PUSH", 0, 28.7, 1.0, stamp, { font: FONT_SANS, weight: 800, align: "center", baseline: "middle", letterSpacing: 0.15 });
  });
  return paintedMaterial("cpu-plate-top", maps, { bumpScale: 0.6 });
}

/** Load plate in its closed pose, positioned relative to its hinge (pivot). */
export function LoadPlate() {
  const extras = useMemo(
    () =>
      cached("cpu-plate-extras", () => {
        const parts: BufferGeometry[] = [];
        const yb = P.y - 1.18;
        // Bent-down side flanges.
        parts.push(roundedBox(1.1, 1.3, 53, 0.3).clone().translate(-P.halfX + 0.55, yb + 0.6, -1.0));
        parts.push(roundedBox(1.1, 1.3, 42.5, 0.3).clone().translate(P.halfX - 0.55, yb + 0.6, -6.3));
        // Rolled hinge curls around the pin.
        for (const [x0, x1] of P.curls) {
          const g = new CylinderGeometry(P.curlR, P.curlR, x1 - x0, 20);
          g.rotateZ(Math.PI / 2);
          g.translate((x0 + x1) / 2, P.hinge.y, P.hinge.z);
          parts.push(g);
        }
        // Finger lip bent up at the front.
        const lip = roundedBox(9.6, 0.9, 2.6, 0.3).clone();
        lip.rotateX(-0.5);
        lip.translate(0, P.y + P.t + 0.45, P.front + 2.6);
        parts.push(lip);
        return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))!;
      }),
    [],
  );
  return (
    <group position={[0, -P.hinge.y, -P.hinge.z]}>
      <Slab shape={PLATE_SHAPE} y0={P.y} y1={P.y + P.t} top={plateTopMaterial()} bottom={MAT.steel} side={MAT.steel} />
      <mesh geometry={extras} material={MAT.steel} castShadow receiveShadow />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Load lever
// ---------------------------------------------------------------------------

const sphere = new SphereGeometry(1, 16, 12);

/** Bent stainless wire lever, positioned relative to its axle (pivot). */
export function LoadLever() {
  const geo = useMemo(
    () =>
      cached("cpu-lever", () => {
        const arm = LEVER.front - LEVER.z;
        const path = bentPath(
          [
            [LEVER.axleX0, 0, 0],
            [LEVER.x, 0, 0],
            [LEVER.x, 0, arm],
            [LEVER.x + 3.6, 0, arm + 3.6],
            [LEVER.x + 6.4, 0, arm + 3.6],
          ],
          2.6,
        );
        return new TubeGeometry(path, 180, LEVER.r, 14, false);
      }),
    [],
  );
  const arm = LEVER.front - LEVER.z;
  const mat = variant("cpu-lever", MAT.steel, { color: "#c4c8cd", roughness: 0.22 });
  return (
    <group>
      <mesh geometry={geo} material={mat} castShadow receiveShadow />
      <mesh geometry={sphere} material={mat} position={[LEVER.axleX0, 0, 0]} scale={LEVER.r} />
      <mesh geometry={sphere} material={mat} position={[LEVER.x + 6.4, 0, arm + 3.6]} scale={LEVER.r} castShadow />
    </group>
  );
}
