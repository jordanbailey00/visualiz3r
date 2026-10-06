"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  Vector3,
  type Group,
} from "three";
import { useExplorer } from "@/lib/hardware/store";
import { FONT_COND, painted, type Surface } from "@/lib/three/painter";
import { explodeProgress } from "../../explode";
import { Part } from "../../Part";
import { Chip } from "../../kit/Chip";
import { cached, roundedBox } from "../../kit/geometry";
import { MAT } from "../../kit/materials";
import { SmdField } from "../../kit/Passives";
import { smooth } from "./HddDisks";
import { TorxScrews } from "./Screws";
import {
  arcPts,
  crease,
  filletPts,
  lathe,
  merge,
  mirrorY,
  offsetPts,
  placed,
  roundedRectPts,
  shapeOf,
  slab,
  type Pt,
} from "./geom";
import { ACT, ALPHA, ARM_Y, BRACKET, HEADS, PIVOT, VCM, Y, armAngle } from "./layout";
import { HM } from "./materials";

/*
 * Frames: the head stack is modelled in "actuator space" — origin on the pivot
 * axis at floor level, +X along the arms toward the heads, +Z to the arms'
 * left (the side the flex cable leaves from), Y = absolute height. A rotation
 * of −α about Y turns it to actuator angle α (see layout.armAngle).
 */

// ---------------------------------------------------------------------------
// Motion: seek profile, parking and ramp lift (shared by every moving piece)
// ---------------------------------------------------------------------------

/** Track radii the animated actuator visits, as if serving random reads. */
const SEEK_TARGETS = [32, 21, 41, 27, 44.6, 19.5, 36, 24, 39.5, 30];
const MOVE_S = 0.55;
const DWELL_S = 0.85;

const motion = { t: 0, alpha: armAngle(32), lift: 0 };

function ease(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function seekAngle(t: number) {
  const seg = MOVE_S + DWELL_S;
  const n = SEEK_TARGETS.length;
  const k = Math.floor(t / seg);
  const f = t - k * seg;
  const from = armAngle(SEEK_TARGETS[k % n]);
  const to = armAngle(SEEK_TARGETS[(k + 1) % n]);
  if (f >= MOVE_S) return to;
  return from + (to - from) * ease(f / MOVE_S);
}

/** Lift (mm) of the lift tabs above their flying height as they climb the ramp. */
function rampLift(alpha: number) {
  const u = (alpha - ALPHA.rampTip) * ACT.tab; // distance along the ramp from its tip
  return Math.min(0.62, Math.max(0, (u - 0.7) * 0.225));
}

/** Hinge line of the suspensions (actuator-space x) and lift-tab tip. */
const HINGE_X = ACT.swage + 1.6;

function shear(k: number) {
  return new Matrix4().set(1, 0, 0, 0, k, 1, 0, -k * HINGE_X, 0, 0, 1, 0, 0, 0, 0, 1);
}

// ---------------------------------------------------------------------------
// Geometry: E-block, arms, suspensions, sliders
// ---------------------------------------------------------------------------

/** Arm outline (actuator space XZ): tapered plate, round tip, lightening holes. */
function armShape() {
  const tip = 2.9;
  const outline: Pt[] = [
    [2.5, -7.4],
    [9.0, -7.3],
    [ACT.swage - 1.2, -tip],
    ...arcPts(ACT.swage, 0, tip, -Math.PI / 2 + 0.25, Math.PI / 2 - 0.25, 14),
    [ACT.swage - 1.2, tip],
    [9.0, 7.3],
    [2.5, 7.4],
  ];
  const tri = filletPts(
    [
      [11.4, -4.4],
      [24.6, -0.9],
      [24.6, 0.9],
      [11.4, 4.4],
    ],
    1.3,
    4,
  ).reverse();
  const swage: Pt[] = arcPts(ACT.swage, 0, 1.25, 0, -Math.PI * 2, 20).slice(0, -1);
  const tool: Pt[] = arcPts(28.0, 0, 0.7, 0, -Math.PI * 2, 14).slice(0, -1);
  return shapeOf(filletPts(outline, 0.8, 3), [tri, swage, tool]);
}

/** Half-width of an arm at actuator-space x (for routing the flex traces along its edge). */
function armHalfWidth(x: number) {
  const t = Math.min(1, Math.max(0, (x - 9) / (ACT.swage - 1.2 - 9)));
  return 7.3 + (2.9 - 7.3) * t;
}

/** Coil outline: a fan-shaped loop on the tail, opposite the arms. */
function coilOuter(): Pt[] {
  const a0 = Math.PI - ACT.coilHalf;
  const a1 = Math.PI + ACT.coilHalf;
  const pts: Pt[] = [
    [Math.cos(a0) * ACT.coilIn, Math.sin(a0) * ACT.coilIn],
    [Math.cos(a1) * ACT.coilIn, Math.sin(a1) * ACT.coilIn],
    ...arcPts(0, 0, ACT.coilOut, a1, a0, 24),
  ];
  return filletPts(pts, 2.6, 5);
}

const COIL_W = 5.2;

function eBlockGeo() {
  return cached("hdd-eblock", () => {
    const parts = [];
    const arm = armShape();
    for (const y of ARM_Y) parts.push(slab(arm, y - ACT.armT / 2, y + ACT.armT / 2, 0.12, 12));
    // Bore ring around the pivot cartridge.
    parts.push(
      lathe(
        [
          [ACT.boreR, ACT.bottom],
          [ACT.bodyR - 0.3, ACT.bottom],
          [ACT.bodyR, ACT.bottom + 0.3],
          [ACT.bodyR, ACT.top - 0.3],
          [ACT.bodyR - 0.3, ACT.top],
          [ACT.boreR, ACT.top],
        ],
        48,
      ),
    );
    // Comb spine the arms grow from.
    parts.push(slab(shapeOf(roundedRectPts(3.2, -7.4, 10.6, 7.4, 1.4, 4)), ACT.bottom, ACT.top, 0.25));
    // Fork that carries the coil holder.
    parts.push(slab(shapeOf(roundedRectPts(-11.9, -5.4, -5.6, 5.4, 1.2, 4)), ACT.coilBottom + 0.3, ACT.coilTop - 0.3, 0.2));
    // Pad on the +Z side for the flex stiffener.
    parts.push(slab(shapeOf(roundedRectPts(-3.6, 7.0, 8.6, 8.9, 0.4, 3)), 7.0, 23.0, 0.2));
    return merge(parts);
  });
}

/**
 * One head-gimbal assembly in its own frame: origin at the swage centre on the
 * arm face, +X toward the head, +Y toward its disk, which lies `h` mm away.
 */
function hgaGeo(h: number) {
  const steel = cached(`hdd-hga-steel:${h}`, () => {
    const parts = [];
    // Base plate swaged into the arm tip.
    parts.push(slab(shapeOf(roundedRectPts(-2.7, -2.75, 3.3, 2.75, 1.0, 4)), 0, 0.15, 0.04));
    // Load beam: tapered spring-steel blade with a hinge window, rising toward the disk.
    const x0 = 1.6;
    const xs = 15.0;
    const len = 16.0 - x0;
    const yBot = h - 0.37;
    const ang = Math.atan2(yBot - 0.15, xs - x0);
    const beamPts: Pt[] = [
      [0, -2.55],
      [len, -0.72],
      [len, 0.72],
      [0, 2.55],
    ];
    const hinge = roundedRectPts(0.55, -1.35, 2.25, 1.35, 0.45, 3);
    const beam = [slab(shapeOf(filletPts(beamPts, 0.5, 3), [hinge]), 0, 0.07, 0)];
    // Formed side rails (stiffeners), bent away from the disk.
    for (const s of [-1, 1]) {
      const a: Pt = [2.8, s * (2.55 - (1.83 * 2.8) / len)];
      const b: Pt = [len - 1.6, s * (0.72 + (1.83 * 1.6) / len)];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const r = new BoxGeometry(l, 0.26, 0.06);
      r.rotateY(-Math.atan2(b[1] - a[1], b[0] - a[0]));
      r.translate((a[0] + b[0]) / 2, -0.12, (a[1] + b[1]) / 2);
      beam.push(r);
    }
    // Lift tab: a narrow tongue past the slider, curled away from the disk at its end.
    const tab = new BoxGeometry(2.3, 0.07, 0.55);
    tab.translate(len + 0.9, -0.1, 0);
    beam.push(tab);
    const curl = new BoxGeometry(0.9, 0.07, 0.55);
    curl.translate(0.45, 0, 0);
    curl.rotateZ(-0.5);
    curl.translate(len + 2.05, -0.1, 0);
    beam.push(curl);
    const lb = merge(beam);
    lb.applyMatrix4(new Matrix4().makeRotationZ(ang).setPosition(x0, 0.15, 0));
    parts.push(lb);
    // Gimbal tongue the slider is bonded to.
    const tongue = new BoxGeometry(1.05, 0.03, 0.82);
    tongue.translate(xs, h - 0.255, 0);
    parts.push(tongue);
    return merge(parts);
  });
  const trace = cached(`hdd-hga-trace:${h}`, () => {
    // Flexure traces: copper on polyimide along the beam's +Z edge, then in to
    // the bond pads on the slider's trailing edge.
    const parts = [];
    const ang = Math.atan2(h - 0.37 - 0.15, 15.0 - 1.6);
    const path: [number, number][] = [
      [-2.6, 2.85],
      [1.6, 2.6],
      [5.0, 1.95],
      [12.4, 0.95],
      [14.6, 0.62],
      [15.6, 0.4],
    ];
    const yAt = (x: number) => 0.155 + Math.max(0, x - 1.6) * Math.tan(ang) + 0.07;
    for (let i = 0; i < path.length - 1; i++) {
      const [ax, az] = path[i];
      const [bx, bz] = path[i + 1];
      const l = Math.hypot(bx - ax, bz - az);
      const seg = new BoxGeometry(l + 0.1, 0.035, 0.42);
      seg.rotateY(-Math.atan2(bz - az, bx - ax));
      seg.translate((ax + bx) / 2, (yAt(ax) + yAt(bx)) / 2, (az + bz) / 2);
      parts.push(seg);
    }
    // down the trailing edge to the pads
    const drop = new BoxGeometry(0.06, 0.3, 0.55);
    drop.translate(15.48, h - 0.2, 0.05);
    parts.push(drop);
    return merge(parts);
  });
  const slider = cached(`hdd-hga-slider:${h}`, () => {
    const g = roundedBox(0.85, 0.23, 0.7, 0.03).clone();
    g.translate(15.0, h - 0.003 - 0.115, 0);
    return g;
  });
  return { steel, trace, slider };
}

/** All ten HGAs, split into up- and down-facing sets so each set can flex toward or away from its disk. */
function headSets() {
  const build = (up: boolean, key: "steel" | "trace" | "slider") =>
    cached(`hdd-hgas:${up}:${key}`, () => {
      const parts = [];
      for (const hd of HEADS) {
        if (hd.up !== up) continue;
        const face = ARM_Y[hd.arm] + (up ? ACT.armT / 2 : -ACT.armT / 2);
        const h = up ? hd.surface - face : face - hd.surface;
        const g = hgaGeo(Math.round(h * 1000) / 1000)[key];
        const src = up ? g : mirrorY(g);
        parts.push(placed(src, new Matrix4().makeTranslation(ACT.swage, face, 0)));
      }
      return merge(parts);
    });
  return {
    up: { steel: build(true, "steel"), trace: build(true, "trace"), slider: build(true, "slider") },
    down: { steel: build(false, "steel"), trace: build(false, "trace"), slider: build(false, "slider") },
  };
}

/** Flex traces running down the side of every arm to the E-block. */
function armTraceGeo() {
  return cached("hdd-arm-traces", () => {
    const parts = [];
    for (const y of ARM_Y) {
      const pts: [number, number][] = [];
      for (let x = 7.2; x <= ACT.swage - 1.0; x += 2) pts.push([x, armHalfWidth(x) + 0.04]);
      pts.push([ACT.swage - 0.6, armHalfWidth(ACT.swage - 1.2) + 0.04]);
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i];
        const [bx, bz] = pts[i + 1];
        const l = Math.hypot(bx - ax, bz - az);
        const seg = new BoxGeometry(l + 0.05, 0.62, 0.06);
        seg.rotateY(-Math.atan2(bz - az, bx - ax));
        seg.translate((ax + bx) / 2, y, (az + bz) / 2);
        parts.push(seg);
      }
    }
    return merge(parts);
  });
}

// ---------------------------------------------------------------------------
// Voice coil
// ---------------------------------------------------------------------------

function coilMaterial() {
  return cachedMat("coil", () => {
    const outer = coilOuter();
    const inner = offsetPts(outer, -COIL_W);
    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    for (const [x, z] of outer) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
    const w = maxX - minX;
    const d = maxZ - minZ;
    const maps = painted("hdd-coil", w, d, 22, { color: "#c2703f", rough: 0.32, metal: 1, height: 0.5 }, (p) => {
      // Concentric turns of enamelled wire, interpolated between the coil's outer and inner outline.
      const turns = 46;
      for (let k = 0; k <= turns; k++) {
        const t = k / turns;
        const loop = outer.map(([x, z], i): [number, number] => [x + (inner[i][0] - x) * t - minX, z + (inner[i][1] - z) * t - minZ]);
        loop.push(loop[0]);
        p.polyline(loop, 0.05, { color: k % 2 ? "#7a3d1c" : "#8c4a24", rough: 0.45, metal: 0.9, height: 0.3 });
      }
    });
    return new MeshPhysicalMaterial({
      map: maps.map,
      roughnessMap: maps.rmMap,
      metalnessMap: maps.rmMap,
      bumpMap: maps.bumpMap,
      bumpScale: 0.6,
      roughness: 1,
      metalness: 1,
      clearcoat: 0.5,
      clearcoatRoughness: 0.3,
    });
  });
}

const mats = new Map<string, MeshPhysicalMaterial>();
function cachedMat(key: string, make: () => MeshPhysicalMaterial) {
  let m = mats.get(key);
  if (!m) {
    m = make();
    mats.set(key, m);
  }
  return m;
}

function coilGeos() {
  const coil = cached("hdd-coil", () => {
    const outer = coilOuter();
    const inner = offsetPts(outer, -COIL_W);
    const g = slab(shapeOf(outer, [inner]), ACT.coilBottom, ACT.coilTop, 0.35, 12);
    // Planar UVs over the coil's footprint for the winding texture.
    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    for (const [x, z] of outer) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
    const pos = g.getAttribute("position");
    const uv = g.getAttribute("uv");
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) - minX) / (maxX - minX), 1 - (pos.getZ(i) - minZ) / (maxZ - minZ));
    uv.needsUpdate = true;
    return g;
  });
  const holder = cached("hdd-coil-holder", () => {
    const outer = coilOuter();
    const parts = [slab(shapeOf(offsetPts(outer, 1.5), [outer]), ACT.coilBottom + 0.35, ACT.coilTop - 0.35, 0.3, 12)];
    // Latch striker pin at the tail end.
    const pin = new CylinderGeometry(0.7, 0.7, 2.6, 16);
    pin.translate(-ACT.coilOut - 1.6, (ACT.coilBottom + ACT.coilTop) / 2, 0);
    parts.push(crease(pin));
    return merge(parts);
  });
  return { coil, holder };
}

// ---------------------------------------------------------------------------
// Flex cable
// ---------------------------------------------------------------------------

/** Free loop of the flex between the E-block and the bracket: a vertical ribbon. */
const FLEX = { y0: 8.6, y1: 18.6, segs: 40, attachX: 2.4, attachZ: 9.35 };

/** Bracket entry point and direction in pivot-relative coordinates. */
const FLEX_B = { x: BRACKET.x - BRACKET.d / 2 - PIVOT.x, z: BRACKET.z - PIVOT.z, dx: 1, dz: 0 };

function flexMaterial() {
  return cachedMat("flex", () => {
    const maps = painted("hdd-flex", 64, 10, 14, { color: "#b9721f", rough: 0.34, metal: 0.1, height: 0.5 }, (p) => {
      const cu: Surface = { color: "#d79a52", rough: 0.3, metal: 0.8, height: 0.62 };
      for (let i = 0; i < 13; i++) p.rect(0, 0.9 + i * 0.66, 64, 0.26, cu);
      p.rect(0, 0, 64, 0.5, { color: "#a35f17", rough: 0.4, metal: 0.05, height: 0.5 });
      p.rect(0, 9.5, 64, 0.5, { color: "#a35f17", rough: 0.4, metal: 0.05, height: 0.5 });
    });
    return new MeshPhysicalMaterial({
      map: maps.map,
      roughnessMap: maps.rmMap,
      metalnessMap: maps.rmMap,
      bumpMap: maps.bumpMap,
      bumpScale: 0.3,
      roughness: 1,
      metalness: 1,
      clearcoat: 0.7,
      clearcoatRoughness: 0.2,
      side: DoubleSide,
    });
  });
}

function makeRibbon() {
  const n = FLEX.segs;
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array((n + 1) * 2 * 3), 3));
  g.setAttribute("normal", new BufferAttribute(new Float32Array((n + 1) * 2 * 3), 3));
  const uv = new Float32Array((n + 1) * 2 * 2);
  for (let i = 0; i <= n; i++) {
    uv[i * 4] = i / n;
    uv[i * 4 + 1] = 0;
    uv[i * 4 + 2] = i / n;
    uv[i * 4 + 3] = 1;
  }
  g.setAttribute("uv", new BufferAttribute(uv, 2));
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  g.setIndex(idx);
  return g;
}

const tmpA = new Vector3();

/** Rewrite the ribbon along a cubic Bézier from the E-block attach point to the bracket. */
function updateRibbon(g: BufferGeometry, alpha: number) {
  const ca = Math.cos(alpha);
  const sa = Math.sin(alpha);
  // Actuator-space attach point and exit direction (+Z) → pivot-relative world.
  const ax = FLEX.attachX * ca - FLEX.attachZ * sa;
  const az = FLEX.attachX * sa + FLEX.attachZ * ca;
  const dax = -sa;
  const daz = ca;
  const L1 = 6.5;
  const L2 = 7.5;
  const p0 = [ax, az];
  const p1 = [ax + dax * L1, az + daz * L1];
  const p3 = [FLEX_B.x, FLEX_B.z];
  const p2 = [FLEX_B.x - FLEX_B.dx * L2, FLEX_B.z - FLEX_B.dz * L2];
  const pos = g.getAttribute("position") as BufferAttribute;
  const nor = g.getAttribute("normal") as BufferAttribute;
  const n = FLEX.segs;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    const x = u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0];
    const z = u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1];
    const dx = 3 * u * u * (p1[0] - p0[0]) + 6 * u * t * (p2[0] - p1[0]) + 3 * t * t * (p3[0] - p2[0]);
    const dz = 3 * u * u * (p1[1] - p0[1]) + 6 * u * t * (p2[1] - p1[1]) + 3 * t * t * (p3[1] - p2[1]);
    tmpA.set(dz, 0, -dx).normalize();
    pos.setXYZ(i * 2, x, FLEX.y0, z);
    pos.setXYZ(i * 2 + 1, x, FLEX.y1, z);
    nor.setXYZ(i * 2, tmpA.x, 0, tmpA.z);
    nor.setXYZ(i * 2 + 1, tmpA.x, 0, tmpA.z);
  }
  pos.needsUpdate = true;
  nor.needsUpdate = true;
  g.computeBoundingSphere();
  g.computeBoundingBox();
}

/** Plain three.js raycast (skips drei's BVH, which would go stale as the loop moves). */
function liveRaycast(this: Mesh, ...args: Parameters<Mesh["raycast"]>) {
  Mesh.prototype.raycast.apply(this, args);
}

// ---------------------------------------------------------------------------
// The head stack assembly
// ---------------------------------------------------------------------------

/**
 * Head stack assembly, in pivot-relative coordinates (place it at the pivot).
 * While animating it seeks between tracks; as the view explodes it parks the
 * heads on the ramp so the platters can be lifted out.
 */
export function HeadStack() {
  const rot = useRef<Group>(null);
  const rotFlex = useRef<Group>(null);
  const shearUp = useRef<Group[]>([]);
  const shearDown = useRef<Group[]>([]);
  const ribbon = useRef<Mesh>(null);

  const geos = useMemo(() => {
    const ribbonGeo = makeRibbon();
    updateRibbon(ribbonGeo, motion.alpha);
    return { eblock: eBlockGeo(), heads: headSets(), armTraces: armTraceGeo(), coil: coilGeos(), ribbon: ribbonGeo };
  }, []);

  useFrame((_, dt) => {
    const animate = useExplorer.getState().animate;
    if (animate) motion.t += Math.min(dt, 0.1);
    const park = smooth(0.0, 0.14, explodeProgress.value);
    const a = seekAngle(motion.t) * (1 - park) + ALPHA.park * park;
    const changed = Math.abs(a - motion.alpha) > 1e-6;
    motion.alpha = a;
    motion.lift = rampLift(a);
    if (rot.current) rot.current.rotation.y = -a;
    if (rotFlex.current) rotFlex.current.rotation.y = -a;
    const k = motion.lift / (ACT.tab - HINGE_X);
    const mu = shear(-k);
    const md = shear(k);
    for (const g of shearUp.current) if (g) g.matrix.copy(mu);
    for (const g of shearDown.current) if (g) g.matrix.copy(md);
    if (changed && ribbon.current) updateRibbon(geos.ribbon, a);
  });

  const reg = (list: { current: Group[] }, i: number) => (el: Group | null) => {
    if (el) {
      el.matrixAutoUpdate = false;
      list.current[i] = el;
    }
  };

  const { up, down } = geos.heads;

  return (
    <group>
      <group ref={rot} rotation-y={-motion.alpha}>
        <Part id="e-block">
          <mesh geometry={geos.eblock} material={HM.arm} castShadow receiveShadow />
        </Part>
        <Part id="suspensions">
          <group ref={reg(shearUp, 0)}>
            <mesh geometry={up.steel} material={HM.suspension} castShadow />
            <mesh geometry={up.trace} material={HM.polyimide} />
          </group>
          <group ref={reg(shearDown, 0)}>
            <mesh geometry={down.steel} material={HM.suspension} castShadow />
            <mesh geometry={down.trace} material={HM.polyimide} />
          </group>
        </Part>
        <Part id="heads">
          <group ref={reg(shearUp, 1)}>
            <mesh geometry={up.slider} material={HM.altic} />
          </group>
          <group ref={reg(shearDown, 1)}>
            <mesh geometry={down.slider} material={HM.altic} />
          </group>
        </Part>
        <Part id="voice-coil">
          <mesh geometry={geos.coil.coil} material={coilMaterial()} castShadow receiveShadow />
          <mesh geometry={geos.coil.holder} material={HM.lcp} castShadow receiveShadow />
        </Part>
      </group>

      <Part id="pivot-bearing">
        <PivotCartridge />
      </Part>

      <Part id="flex-cable">
        <group ref={rotFlex} rotation-y={-motion.alpha}>
          <mesh geometry={geos.armTraces} material={HM.polyimide} />
          <FlexStiffener />
          <Part id="preamp">
            <Chip
              kind="qfn"
              size={[4.6, 0.55, 3.4]}
              position={[2.6, 17.2, 9.33]}
              rotation={[Math.PI / 2, 0, 0]}
              pins={7}
              marking={{ lines: ["PA44", "R/W"], scale: 1.1 }}
            />
          </Part>
        </group>
        <mesh ref={ribbon} geometry={geos.ribbon} material={flexMaterial()} raycast={liveRaycast} castShadow />
        <Part id="flex-bracket">
          <FlexBracket />
        </Part>
      </Part>
    </group>
  );
}

/** Aluminium stiffener on the E-block's side carrying the preamp and its capacitors. */
function FlexStiffener() {
  return (
    <group>
      <mesh geometry={roundedBox(12.4, 15.6, 0.3, 0.12)} material={HM.arm} position={[2.5, 15.0, 9.05]} castShadow />
      <mesh geometry={roundedBox(12.0, 15.0, 0.12, 0.05)} material={flexMaterial()} position={[2.5, 15.0, 9.27]} />
      <group position={[2.5, 11.6, 9.33]} rotation={[Math.PI / 2, 0, 0]}>
        <SmdField
          items={[
            [-3.4, 0, 0],
            [-1.9, 0, 0],
            [-0.4, 0, 0],
            [1.1, 0.4, 90],
            [3.2, -0.2, 90],
            [4.4, 1.0, 0],
          ]}
          size="0201"
        />
      </group>
    </group>
  );
}

/** Pivot bearing cartridge: a pre-loaded pair of ball bearings in a steel sleeve. */
function PivotCartridge() {
  const geo = useMemo(
    () =>
      cached("hdd-pivot", () =>
        lathe(
          [
            [0, Y.floor],
            [4.7, Y.floor],
            [4.7, ACT.bottom],
            [ACT.boreR - 0.02, ACT.bottom],
            [ACT.boreR - 0.02, ACT.top],
            [5.95, ACT.top],
            [5.95, ACT.top + 0.25],
            [2.6, ACT.top + 0.3],
            [2.6, Y.wallTop - 0.05],
            [0, Y.wallTop - 0.05],
          ],
          48,
        ),
      ),
    [],
  );
  return (
    <group>
      <mesh geometry={geo} material={HM.plate} castShadow receiveShadow />
      <mesh geometry={cached("hdd-pivot-hole", () => crease(new CylinderGeometry(1.0, 1.0, 0.04, 20)))} material={HM.hole} position-y={Y.wallTop - 0.03} />
    </group>
  );
}

/** Bracket that anchors the flex and passes it through the floor to the controller board. */
function FlexBracket() {
  const bx = BRACKET.x - PIVOT.x;
  const bz = BRACKET.z - PIVOT.z;
  const h = 12.5;
  const screws = useMemo<[number, number, number][]>(
    () => [
      [bx + 1.2, Y.floor + h, bz - BRACKET.w / 2 + 2],
      [bx + 1.2, Y.floor + h, bz + BRACKET.w / 2 - 2],
    ],
    [bx, bz],
  );
  return (
    <group>
      <mesh geometry={roundedBox(BRACKET.d, h, BRACKET.w, 0.7)} material={HM.lcp} position={[bx, Y.floor + h / 2, bz]} castShadow receiveShadow />
      {/* stainless clamp plate where the flex terminates */}
      <mesh geometry={roundedBox(0.45, FLEX.y1 - FLEX.y0 + 1.6, BRACKET.w - 1.2, 0.15)} material={HM.plate} position={[bx - BRACKET.d / 2 - 0.2, (FLEX.y0 + FLEX.y1) / 2, bz]} castShadow />
      {/* connector that reaches through the floor slot to the board */}
      <mesh geometry={roundedBox(3.4, Y.floor - Y.recess + 1.4, 11, 0.3)} material={HM.lcp} position={[bx, Y.recess + 0.1, bz]} />
      <mesh
        geometry={cached("hdd-bracket-pins", () => {
          const parts = [];
          for (let i = 0; i < 14; i++) {
            const b = new BoxGeometry(0.35, 0.5, 0.35);
            b.translate((i % 2 ? 0.7 : -0.7), 0, -4.6 + Math.floor(i / 2) * 1.5);
            parts.push(b);
          }
          return merge(parts);
        })}
        material={MAT.gold}
        position={[bx, Y.recess - 0.75, bz]}
      />
      <TorxScrews points={screws} d={2.8} h={0.7} material={HM.screw} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Voice-coil motor magnets, latch and crash stops (fixed to the base)
// ---------------------------------------------------------------------------

/** Pivot-centred sector, clipped clear of the connector pocket and side wall. */
function sectorOutline(a0: number, a1: number, rIn: number, rOut: number, margin = 0): Pt[] {
  const pts: Pt[] = [...arcPts(PIVOT.x, PIVOT.z, rOut, a0, a1, 40), ...arcPts(PIVOT.x, PIVOT.z, rIn, a1, a0, 16)];
  const clipped = pts.map(([x, z]): Pt => [Math.min(x, (z < 8.5 ? 60.2 : 67.6) - margin), Math.min(z, 46.4 - margin)]);
  return filletPts(clipped, 1.2, 3);
}

function vcmGeos() {
  const plate = shapeOf(sectorOutline(VCM.plateA0, VCM.plateA1, VCM.plateIn, VCM.plateOut));
  const mid = (VCM.a0 + VCM.a1) / 2;
  const halves = [
    shapeOf(sectorOutline(VCM.a0, mid - 0.008, VCM.rIn, VCM.rOut, 0.6)),
    shapeOf(sectorOutline(mid + 0.008, VCM.a1, VCM.rIn, VCM.rOut, 0.6)),
  ];
  return {
    bottomPlate: cached("hdd-vcm-bplate", () => slab(plate, VCM.bottomPlate[0], VCM.bottomPlate[1], 0.35)),
    topPlate: cached("hdd-vcm-tplate", () => slab(plate, VCM.topPlate[0], VCM.topPlate[1], 0.35)),
    bottomMagnet: cached("hdd-vcm-bmag", () => merge(halves.map((s) => slab(s, VCM.bottomMagnet[0], VCM.bottomMagnet[1], 0.25)))),
    topMagnet: cached("hdd-vcm-tmag", () => merge(halves.map((s) => slab(s, VCM.topMagnet[0], VCM.topMagnet[1], 0.25)))),
  };
}

function vcmTopMaterial() {
  return cachedMat("vcmTop", () => {
    // Nickel-plated yoke with a stamped part number.
    const maps = painted("hdd-vcm-top", 40, 40, 12, { color: "#cdccc6", rough: 0.24, metal: 1, height: 0.5 }, (p) => {
      const ink: Surface = { color: "#9a9a95", rough: 0.4, metal: 1, height: 0.42 };
      p.text("VCM-7K  N52", 20, 20, 2.2, ink, { align: "center", baseline: "middle", font: FONT_COND, weight: 700 });
    });
    return new MeshPhysicalMaterial({
      map: maps.map,
      roughnessMap: maps.rmMap,
      metalnessMap: maps.rmMap,
      bumpMap: maps.bumpMap,
      bumpScale: 0.4,
      roughness: 1,
      metalness: 1,
    });
  });
}

/** Lower magnet and steel yoke plate, screwed to the floor. */
export function VcmBottom() {
  const g = useMemo(vcmGeos, []);
  return (
    <group>
      <mesh geometry={g.bottomPlate} material={HM.plate} castShadow receiveShadow />
      <mesh geometry={g.bottomMagnet} material={HM.magnet} castShadow receiveShadow />
    </group>
  );
}

/** Upper magnet and yoke plate: completes the magnetic circuit above the coil. */
export function VcmTop() {
  const g = useMemo(vcmGeos, []);
  const screws = useMemo<[number, number, number][]>(() => {
    const at = (a: number, r: number): [number, number, number] => [PIVOT.x + Math.cos(a) * r, VCM.topPlate[1], PIVOT.z + Math.sin(a) * r];
    return [at(VCM.stops[0].a, VCM.stops[0].r), at(VCM.stops[1].a, VCM.stops[1].r)];
  }, []);
  return (
    <group>
      <mesh geometry={g.topMagnet} material={HM.magnet} castShadow receiveShadow />
      <mesh geometry={g.topPlate} material={vcmTopUV(g.topPlate)} castShadow receiveShadow />
      <TorxScrews points={screws} d={3.4} h={0.8} material={HM.screw} />
    </group>
  );
}

/** The yoke's UVs are in mm (shape coordinates); map the 40 mm stamp texture near the coil. */
function vcmTopUV(geo: BufferGeometry) {
  const uv = geo.getAttribute("uv");
  if (!geo.userData.hddUV) {
    for (let i = 0; i < uv.count; i++) {
      const pos = geo.getAttribute("position");
      uv.setXY(i, (pos.getX(i) - (PIVOT.x + 2)) / 40, 1 - (pos.getZ(i) - (PIVOT.z + 2)) / 40);
    }
    uv.needsUpdate = true;
    geo.userData.hddUV = true;
  }
  return vcmTopMaterial();
}

/**
 * Crash stops (rubber-sleeved posts that also space the two yokes) and the
 * magnetic latch that holds the actuator parked when the drive is off.
 */
export function LatchAndStops() {
  const geo = useMemo(
    () =>
      cached("hdd-stops", () => {
        const parts = [];
        for (const s of VCM.stops) {
          const x = PIVOT.x + Math.cos(s.a) * s.r;
          const z = PIVOT.z + Math.sin(s.a) * s.r;
          const post = new CylinderGeometry(0.9, 0.9, VCM.topMagnet[0] - VCM.bottomMagnet[0] + 2.8, 16);
          post.translate(x, (VCM.topMagnet[0] + VCM.bottomPlate[1]) / 2 + 1.4, z);
          parts.push(crease(post));
        }
        return merge(parts);
      }),
    [],
  );
  const sleeves = useMemo(
    () =>
      cached("hdd-stop-sleeves", () => {
        const parts = [];
        for (const s of VCM.stops) {
          const x = PIVOT.x + Math.cos(s.a) * s.r;
          const z = PIVOT.z + Math.sin(s.a) * s.r;
          const c = new CylinderGeometry(1.9, 1.9, ACT.coilTop - ACT.coilBottom + 0.6, 24);
          c.translate(x, (ACT.coilTop + ACT.coilBottom) / 2, z);
          parts.push(crease(c));
        }
        return merge(parts);
      }),
    [],
  );
  // Latch: a small pivoting lever with a magnet, beside the park-side stop.
  const a = VCM.stops[1].a + 0.2;
  const lx = PIVOT.x + Math.cos(a) * 26;
  const lz = PIVOT.z + Math.sin(a) * 26;
  return (
    <group>
      <mesh geometry={geo} material={HM.plate} castShadow />
      <mesh geometry={sleeves} material={MAT.rubber} castShadow receiveShadow />
      <group position={[lx, 0, lz]} rotation={[0, -a + 0.4, 0]}>
        <mesh geometry={cached("hdd-latch-pin", () => crease(new CylinderGeometry(0.8, 0.8, ACT.coilTop + 1 - Y.floor, 16)))} material={HM.plate} position-y={(ACT.coilTop + 1 + Y.floor) / 2} />
        <mesh geometry={roundedBox(7.5, 3.4, 3.2, 0.6)} material={HM.lcp} position={[-1.8, (ACT.coilTop + ACT.coilBottom) / 2, 0]} castShadow />
        <mesh geometry={roundedBox(2.2, 2.4, 2.4, 0.4)} material={HM.magnet} position={[-4.9, (ACT.coilTop + ACT.coilBottom) / 2, 0]} castShadow />
        <mesh geometry={roundedBox(5, 1.2, 5, 0.4)} material={HM.lcp} position={[0, Y.floor + 0.6, 0]} />
      </group>
    </group>
  );
}

