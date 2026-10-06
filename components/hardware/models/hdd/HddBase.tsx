"use client";

import { useMemo } from "react";
import { BoxGeometry, CircleGeometry, CylinderGeometry, Matrix4, RingGeometry } from "three";
import { cached, roundedBox } from "../../kit/geometry";
import { MAT } from "../../kit/materials";
import { TorxScrews } from "./Screws";
import { arcPts, boxUV, circlePts, crease, extrudeZ, filletPts, merge, placed, shapeOf, slab, type Pt } from "./geom";
import {
  ACT,
  ALPHA,
  BOTTOM_HOLES,
  BRACKET,
  BREATHER,
  CAVITY,
  COVER_SCREWS,
  DISK,
  DRIVE,
  POCKET,
  RECIRC,
  SIDE_HOLES,
  SPINDLE,
  Y,
  diskBottom,
  diskTop,
  fromPivot,
} from "./layout";
import { CAST_TILE, HM } from "./materials";

const H = Math.PI / 2;

// ---------------------------------------------------------------------------
// Outlines
// ---------------------------------------------------------------------------

/**
 * The walls as one C-shaped outline: the full outer perimeter and the inner
 * cavity face, open at the rear where the connector pocket interrupts the wall
 * (the wall continues above the pocket as a separate bridge).
 */
function wallPts(): Pt[] {
  const { halfL: X, halfW: Z, cornerR: r } = DRIVE;
  const { x0, x1, z0, z1, r: ri } = CAVITY;
  const s = 8;
  const outer: Pt[] = [
    [X, POCKET.z1],
    ...arcPts(X - r, Z - r, r, 0, H, s),
    ...arcPts(-X + r, Z - r, r, H, 2 * H, s),
    ...arcPts(-X + r, -Z + r, r, 2 * H, 3 * H, s),
    ...arcPts(X - r, -Z + r, r, 3 * H, 4 * H, s),
    [X, POCKET.z0],
  ];
  const inner: Pt[] = [
    [x1, POCKET.z0],
    ...arcPts(x1 - ri, z0 + ri, ri, 0, -H, s),
    ...arcPts(x0 + ri, z0 + ri, ri, -H, -2 * H, s),
    ...arcPts(x0 + ri, z1 - ri, ri, 2 * H, H, s),
    ...arcPts(x1 - ri, z1 - ri, ri, H, 0, s),
    [x1, POCKET.z1],
  ];
  return [...outer, ...inner];
}

/** Cavity footprint with the connector pocket cut out of its rear edge. */
function floorPts(): Pt[] {
  const { x0, x1, z0, z1, r } = CAVITY;
  const s = 8;
  return [
    ...arcPts(x1 - r, z0 + r, r, -H, 0, s),
    [x1, POCKET.z0],
    [POCKET.x0, POCKET.z0],
    [POCKET.x0, POCKET.z1],
    [x1, POCKET.z1],
    ...arcPts(x1 - r, z1 - r, r, 0, H, s),
    ...arcPts(x0 + r, z1 - r, r, H, 2 * H, s),
    ...arcPts(x0 + r, z0 + r, r, 2 * H, 3 * H, s),
  ];
}

/** Motor bore through the floor. */
const MOTOR_HOLE = 16.8;
/** Front edge of the board recess (behind it, the floor is thin and the board sits underneath). */
const RECESS_X = -12.5;

/** Solid underside in front of the board recess, notched around the motor. */
function skirtPts(): Pt[] {
  const { x0, z0, z1, r } = CAVITY;
  const s = 8;
  const dz = Math.sqrt(MOTOR_HOLE * MOTOR_HOLE - (RECESS_X - SPINDLE.x) ** 2);
  const a = Math.atan2(-dz, RECESS_X - SPINDLE.x);
  return [
    [RECESS_X, z0],
    [RECESS_X, -dz],
    // around the far side of the motor bore (clockwise: the skirt is outside it)
    ...arcPts(SPINDLE.x, SPINDLE.z, MOTOR_HOLE, a, -a - Math.PI * 2, 48).slice(1, -1),
    [RECESS_X, dz],
    [RECESS_X, z1],
    ...arcPts(x0 + r, z1 - r, r, H, 2 * H, s),
    ...arcPts(x0 + r, z0 + r, r, 2 * H, 3 * H, s),
  ];
}

/** Annular sector around the spindle (angles in radians). */
function sectorPts(cx: number, cz: number, r0: number, r1: number, a0: number, a1: number, steps = 40): Pt[] {
  return [...arcPts(cx, cz, r1, a0, a1, steps), ...arcPts(cx, cz, r0, a1, a0, steps)];
}

const deg = (d: number) => (d * Math.PI) / 180;
const SHROUD = { r0: DISK.r + 1.1, r1: DISK.r + 2.6 };

// ---------------------------------------------------------------------------
// Casting
// ---------------------------------------------------------------------------

/**
 * The die-cast aluminium base: walls, floor, the curved disk shroud that hugs
 * the platters, screw bosses, and the pocket for the connectors. All merged
 * into one mesh with box-projected cast-metal texture.
 */
export function BaseCasting() {
  const geo = useMemo(
    () =>
      cached("hdd-casting", () => {
        const parts = [];
        // Walls (full height, rounded top edge) and the bridge over the connector pocket.
        parts.push(slab(shapeOf(wallPts()), 0, Y.wallTop, 0.7));
        parts.push(
          slab(
            shapeOf([
              [CAVITY.x1 - 0.01, POCKET.z0],
              [DRIVE.halfL, POCKET.z0],
              [DRIVE.halfL, POCKET.z1],
              [CAVITY.x1 - 0.01, POCKET.z1],
            ]),
            POCKET.top,
            Y.wallTop,
            0.7,
          ),
        );
        // Raised shelf over the pocket and its back wall (profile in XY, extruded across Z).
        parts.push(
          extrudeZ(
            shapeOf([
              [POCKET.step, Y.recess],
              [POCKET.x0, Y.recess],
              [POCKET.x0, POCKET.top],
              [CAVITY.x1, POCKET.top],
              [CAVITY.x1, POCKET.shelf],
              [POCKET.step, POCKET.shelf],
            ]),
            POCKET.z0,
            POCKET.z1,
          ),
        );
        // Floor over the board recess, with the motor bore and the flex-connector slot.
        // Slot under the flex bracket, along its length (Z).
        const slot: Pt[] = [
          [BRACKET.x - 1.9, BRACKET.z - 5.2],
          [BRACKET.x + 1.9, BRACKET.z - 5.2],
          [BRACKET.x + 1.9, BRACKET.z + 5.2],
          [BRACKET.x - 1.9, BRACKET.z + 5.2],
        ];
        parts.push(slab(shapeOf(floorPts(), [circlePts(SPINDLE.x, SPINDLE.z, MOTOR_HOLE, 64), slot]), Y.recess, Y.floor, 0));
        // Solid underside at the front.
        parts.push(slab(shapeOf(skirtPts()), 0, Y.recess, 0));
        // Disk shroud: hugs the platter edge except at the actuator opening and the filter slot.
        const gap = deg(3.2);
        for (const [a0, a1] of [
          [deg(14), RECIRC.theta - gap],
          [RECIRC.theta + gap, deg(298)],
        ]) {
          parts.push(slab(shapeOf(sectorPts(SPINDLE.x, SPINDLE.z, SHROUD.r0, SHROUD.r1, a0, a1, 72)), Y.floor - 0.1, Y.wallTop, 0.4));
        }
        // Rounded ends of the shroud at the actuator opening.
        for (const a of [deg(14), deg(298)]) {
          const c = new CylinderGeometry(0.75, 0.75, Y.wallTop - Y.floor - 0.6, 16);
          const rm = (SHROUD.r0 + SHROUD.r1) / 2;
          c.translate(SPINDLE.x + Math.cos(a) * rm, (Y.wallTop + Y.floor - 0.6) / 2, SPINDLE.z + Math.sin(a) * rm);
          parts.push(crease(c));
        }
        // Filter slot posts (radial walls either side of the filter).
        for (const a of [RECIRC.theta - gap, RECIRC.theta + gap]) {
          const rm = SHROUD.r1 + 4;
          const b = new BoxGeometry(9, Y.wallTop - Y.floor - 1.5, 1.6);
          b.rotateY(-a);
          b.translate(SPINDLE.x + Math.cos(a) * rm, (Y.wallTop + Y.floor - 1.5) / 2, SPINDLE.z + Math.sin(a) * rm);
          parts.push(b);
        }
        // Cover-screw bosses.
        for (const [x, z] of COVER_SCREWS) {
          const c = new CylinderGeometry(3.3, 3.5, Y.wallTop - Y.floor, 28);
          c.translate(x, (Y.wallTop + Y.floor) / 2, z);
          parts.push(crease(c));
        }
        // Bottom-hole bosses inside the board recess.
        for (const [x, z] of BOTTOM_HOLES) {
          if (x < RECESS_X - 1) continue;
          const c = new CylinderGeometry(3.0, 3.0, Y.recess, 28);
          c.translate(x, Y.recess / 2, z);
          parts.push(crease(c));
        }
        // Side-hole bosses (horizontal) and their ribs.
        for (const x of SIDE_HOLES.xs) {
          for (const sz of [-1, 1]) {
            const len = 5.2;
            const c = new CylinderGeometry(3.6, 3.6, len, 24);
            c.rotateX(H);
            c.translate(x, SIDE_HOLES.y, sz * (CAVITY.z1 - len / 2 + 0.4));
            parts.push(crease(c));
          }
        }
        // Pivot boss and locating ring for the voice-coil yoke.
        const pv = new CylinderGeometry(6.4, 6.8, 0.55, 40);
        pv.translate(...fromPivotXYZ(0, 0, Y.floor + 0.27));
        parts.push(crease(pv));
        // Stiffening ribs in the front corner pockets, running out to the walls.
        for (const a of [deg(124), deg(216), deg(238)]) {
          const r0 = SHROUD.r1 - 0.2;
          const toFront = Math.cos(a) < 0 ? (SPINDLE.x - CAVITY.x0) / -Math.cos(a) : Infinity;
          const toSide = (CAVITY.z1 - 0.2) / Math.abs(Math.sin(a));
          const len = Math.min(toFront, toSide) - r0 + 0.6;
          const b = new BoxGeometry(len, 9, 1.2);
          b.rotateY(-a);
          const rm = r0 + len / 2;
          b.translate(SPINDLE.x + Math.cos(a) * rm, Y.floor + 4.5, SPINDLE.z + Math.sin(a) * rm);
          parts.push(b);
        }
        return boxUV(merge(parts), CAST_TILE);
      }),
    [],
  );
  return <mesh geometry={geo} material={HM.cast} castShadow receiveShadow />;
}

function fromPivotXYZ(a: number, dist: number, y: number): [number, number, number] {
  const [x, z] = fromPivot(a, dist);
  return [x, y, z];
}

// ---------------------------------------------------------------------------
// Mounting holes (6-32 UNC)
// ---------------------------------------------------------------------------

/**
 * Threaded 6-32 holes on the sides and bottom, drawn as a dark bore inside a
 * bright machined chamfer, sitting just proud of the wall surface.
 */
export function MountingHoles() {
  const { bores, chamfers } = useMemo(() => {
    // Local frame for each hole: +Y points out of the surface.
    const frames: Matrix4[] = [];
    for (const x of SIDE_HOLES.xs)
      for (const sz of [-1, 1]) frames.push(new Matrix4().makeRotationX(sz * H).setPosition(x, SIDE_HOLES.y, sz * DRIVE.halfW));
    for (const [x, z] of BOTTOM_HOLES) frames.push(new Matrix4().makeRotationX(Math.PI).setPosition(x, 0, z));
    const b = cached("hdd-holes-bore", () => {
      const disk = new CircleGeometry(1.5, 24).rotateX(-H).translate(0, 0.035, 0);
      return merge(frames.map((m) => placed(disk, m)));
    });
    const c = cached("hdd-holes-chamfer", () => {
      const ring = new RingGeometry(1.5, 2.15, 32).rotateX(-H).translate(0, 0.025, 0);
      return merge(frames.map((m) => placed(ring, m)));
    });
    return { bores: b, chamfers: c };
  }, []);
  return (
    <group>
      <mesh geometry={bores} material={HM.hole} />
      <mesh geometry={chamfers} material={HM.castMachined} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Load / unload ramp
// ---------------------------------------------------------------------------

/** Ramp frame: origin at the ramp tip on the lift-tab path, +X outward along it. */
export function rampFrame() {
  const [x0, z0] = fromPivot(ALPHA.rampTip, ACT.tab);
  const [x1, z1] = fromPivot(ALPHA.rampEnd, ACT.tab);
  const ang = Math.atan2(z1 - z0, x1 - x0);
  return { x: x0, z: z0, rotY: -ang, len: Math.hypot(x1 - x0, z1 - z0) };
}

/**
 * The plastic ramp the heads park on. For every recording surface a thin
 * finger reaches over the disk edge; its outer face slopes away from the disk
 * so the suspension's lift tab climbs it and pulls the slider clear.
 */
export function Ramp() {
  const geo = useMemo(
    () =>
      cached("hdd-ramp", () => {
        const f = rampFrame();
        const parts = [];
        const L = f.len + 1.2;
        const w = 2.3;
        for (let i = 0; i < DISK.count; i++) {
          for (const side of [1, -1]) {
            // side 1: finger above disk i (top surface), −1: below disk i
            const s = side > 0 ? diskTop(i) : diskBottom(i);
            const y = (d: number) => s + side * d;
            const prof: Pt[] = [
              [0, y(0.09)],
              [0, y(0.26)],
              [3.2, y(0.98)],
              [6.6, y(0.98)],
              [7.2, y(1.12)],
              [7.8, y(0.98)],
              [L, y(0.98)],
              [L, y(0.09)],
            ];
            const pts = side > 0 ? prof : [...prof].reverse();
            parts.push(extrudeZ(shapeOf(filletPts(pts, 0.12, 2)), -w / 2, w / 2, 0.08));
          }
        }
        // Spine joining the fingers, with a mounting foot and locating boss.
        const top = diskTop(DISK.count - 1) + 1.6;
        const spine = roundedBox(3.6, top - Y.floor, 4.6, 0.5).clone();
        spine.translate(L + 1.6, (top + Y.floor) / 2, 0.6);
        parts.push(spine);
        const foot = roundedBox(7.5, 1.6, 8.5, 0.5).clone();
        foot.translate(L + 2.4, Y.floor + 0.8, 1.6);
        parts.push(foot);
        const g = merge(parts);
        g.applyMatrix4(new Matrix4().makeRotationY(f.rotY).setPosition(f.x, 0, f.z));
        return g;
      }),
    [],
  );
  const f = rampFrame();
  const screw = useMemo(() => {
    const ca = Math.cos(f.rotY);
    const sa = Math.sin(f.rotY);
    // local (L + 4.4, 3.4) in the ramp frame
    const lx = f.len + 1.2 + 4.6;
    const lz = 3.6;
    return [[f.x + lx * ca + lz * sa, Y.floor + 1.6, f.z - lx * sa + lz * ca]] as [number, number, number][];
  }, [f.x, f.z, f.rotY, f.len]);
  return (
    <group>
      <mesh geometry={geo} material={HM.ramp} castShadow receiveShadow />
      <TorxScrews points={screw} d={3.2} h={0.9} material={HM.screw} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

/**
 * Recirculation filter: a pad of electret fibre in a slot of the shroud. Air
 * dragged around by the spinning disks flows through it continuously.
 */
export function RecircFilter() {
  const a = RECIRC.theta;
  const rm = SHROUD.r1 + 4.3;
  const x = SPINDLE.x + Math.cos(a) * rm;
  const z = SPINDLE.z + Math.sin(a) * rm;
  const h = Y.wallTop - Y.floor - 2.2;
  return (
    <group position={[x, Y.floor + 0.2 + h / 2, z]} rotation={[0, -a, 0]}>
      <mesh geometry={roundedBox(12.5, h, 2.6, 0.5)} material={HM.filter} castShadow receiveShadow />
      <mesh geometry={cached("hdd-recirc-frame", () => frameGeo(12.5, h, 3.0, 1.1))} material={HM.lcp} castShadow />
    </group>
  );
}

/** Rectangular frame (in the XY plane, thickness along Z). */
function frameGeo(w: number, h: number, t: number, bar: number) {
  const parts = [
    new BoxGeometry(w + bar, bar, t).translate(0, h / 2, 0),
    new BoxGeometry(w + bar, bar, t).translate(0, -h / 2, 0),
    new BoxGeometry(bar, h, t).translate(w / 2, 0, 0),
    new BoxGeometry(bar, h, t).translate(-w / 2, 0, 0),
    new BoxGeometry(bar * 0.7, h, t * 0.9),
  ];
  return merge(parts);
}

/**
 * Breather filter: lets air in and out through the cover's breather hole as
 * the drive warms and cools, through a particle filter and a desiccant
 * (silica / activated carbon) that soaks up moisture and chemicals.
 */
export function BreatherFilter() {
  const h = Y.wallTop - Y.floor - 0.4;
  return (
    <group position={[BREATHER.x, Y.floor, BREATHER.z]} rotation={[0, 0.35, 0]}>
      {/* moulded carrier: a chimney from the floor up to the cover's breather hole */}
      <mesh geometry={roundedBox(7.6, h, 5.6, 1.2)} material={HM.lcp} position-y={h / 2} castShadow receiveShadow />
      {/* desiccant pouch window and the membrane on top */}
      <mesh geometry={roundedBox(5.2, h * 0.55, 0.25, 0.1)} material={HM.filter} position={[0, h * 0.42, 2.85]} />
      <mesh geometry={roundedBox(5.4, 0.25, 3.8, 0.6)} material={HM.filter} position-y={h + 0.1} />
      <mesh geometry={cached("hdd-breather-seal", () => crease(new CylinderGeometry(1.7, 1.7, 0.3, 24)))} material={MAT.rubber} position-y={h + 0.3} />
    </group>
  );
}
