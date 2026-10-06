"use client";

import { useMemo } from "react";
import {
  BufferAttribute,
  Color,
  CylinderGeometry,
  Euler,
  Matrix4,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Painter } from "@/lib/three/painter";
import { Part } from "../../Part";
import { cached, roundedBox } from "../../kit/geometry";
import { useAutoExplode } from "../../kit/Reveal";
import {
  CCD,
  CCD_LAYOUT,
  CORE_PLATE,
  CORE_PLATE_L2,
  CORE_PLATE_LOGIC,
  CORE_UNITS,
  FP_COLORS,
  flat,
  paintCcd,
  paintCorePlate,
  unitRect,
  type FpRect,
  type UnitId,
} from "./floorplan";
import { DIES, DIE_T, EX, dieWorld, type Vec3 } from "./layout";
import { Reveal, useExplodeFade, type Pose } from "./Reveal";
import { paintOnce } from "./shapes";

/**
 * Magnified, labelled floorplans that appear at the end of the exploded view.
 * Each lives in die millimetres (origin at the die centre, y = 0 on the top
 * of a base slab) inside a <Reveal> that scales it up: at scale 1 it is
 * exactly the size of the real die it grows out of.
 */

const BASE_T = 0.42;
/** Raised heights of the blocks (die mm). */
const HGT = { core: 0.36, l2: 0.27, l3: 0.2, fabric: 0.16, control: 0.12, unit: 0.1, coreL2: 0.08 };

// ---------------------------------------------------------------------------
// Poses
// ---------------------------------------------------------------------------

const CCD0 = DIES[0];
const TILT: Vec3 = [EX.ccdPlan.tilt, 0, 0];
const HIDDEN = dieWorld(CCD0, false);

const exploded = dieWorld(CCD0, true);
const CCD_FROM: Pose = { position: [exploded[0], exploded[1] + DIE_T / 2, exploded[2]], scale: 1 };
const CCD_TO: Pose = { position: EX.ccdPlan.position, rotation: TILT, scale: EX.ccdPlan.scale };

/** World transform of the fully revealed compute-die floorplan. */
function poseMatrix(p: Pose) {
  return new Matrix4().compose(
    new Vector3(...p.position),
    new Quaternion().setFromEuler(new Euler(...(p.rotation ?? [0, 0, 0]))),
    new Vector3(p.scale, p.scale, p.scale),
  );
}
const CCD_M = poseMatrix(CCD_TO);

/** Core 4 (right column, top row) is the one magnified next to the die. */
const ZOOM_CORE = CCD_LAYOUT.cores[4];
const zoomCenter = new Vector3(
  ZOOM_CORE.all.x + ZOOM_CORE.all.w / 2 - CCD.w / 2,
  HGT.core,
  ZOOM_CORE.all.y + ZOOM_CORE.all.h / 2 - CCD.h / 2,
).applyMatrix4(CCD_M);
const CORE_FROM: Pose = { position: [zoomCenter.x, zoomCenter.y, zoomCenter.z], rotation: TILT, scale: EX.ccdPlan.scale };
const CORE_TO: Pose = { position: EX.corePlan.position, rotation: TILT, scale: EX.corePlan.scale };
const CORE_M = poseMatrix(CORE_TO);

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

const atlases = new Map<string, MeshPhysicalMaterial>();

/** A floorplan texture: lit like a print, with a little self-illumination so labels stay legible. */
function atlasMaterial(key: string, w: number, h: number, ppm: number, paint: (p: Painter) => void) {
  let m = atlases.get(key);
  if (m) return m;
  const maps = paintOnce(key, w, h, ppm, flat("#121418"), paint, { anisotropy: 12 });
  m = new MeshPhysicalMaterial({
    map: maps.map,
    emissiveMap: maps.map,
    emissive: new Color("#ffffff"),
    emissiveIntensity: 0.34,
    bumpMap: maps.bumpMap,
    bumpScale: 0.02,
    roughness: 0.48,
    metalness: 0.15,
    clearcoat: 0.4,
    clearcoatRoughness: 0.25,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  m.name = key;
  atlases.set(key, m);
  return m;
}

const ccdAtlas = () => atlasMaterial("cpu-fp-ccd", CCD.w, CCD.h, 200, (p) => paintCcd(p, { labels: true }));
const coreAtlas = () => atlasMaterial("cpu-fp-core", CORE_PLATE.w, CORE_PLATE.h, 620, (p) => paintCorePlate(p, 0.3));

const sides = new Map<string, MeshPhysicalMaterial>();
/** Coloured side walls of a raised block. */
function sideMaterial(color: string) {
  let m = sides.get(color);
  if (!m) {
    const c = new Color(color);
    m = new MeshPhysicalMaterial({
      color: c.clone().multiplyScalar(0.55),
      emissive: c,
      emissiveIntensity: 0.22,
      roughness: 0.42,
      metalness: 0.2,
      clearcoat: 0.5,
      clearcoatRoughness: 0.3,
    });
    sides.set(color, m);
  }
  return m;
}

const slabSide = () => sideMaterial("#3a4150");

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/** A top-facing plane covering `r` whose UVs pick the same region of the atlas. */
function atlasDecal(r: FpRect, W: number, H: number) {
  return cached(`cpu-fp-decal:${r.x}:${r.y}:${r.w}:${r.h}:${W}:${H}`, () => {
    const g = new PlaneGeometry(r.w, r.h);
    g.rotateX(-Math.PI / 2);
    const uv = g.getAttribute("uv") as BufferAttribute;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, r.x / W + uv.getX(i) * (r.w / W), 1 - (r.y + r.h) / H + uv.getY(i) * (r.h / H));
    }
    uv.needsUpdate = true;
    return g;
  });
}

/** One raised floorplan block: coloured walls and the die-shot top. */
function Block({
  rect,
  W,
  H,
  height,
  color,
  atlas,
  origin = [0, 0],
}: {
  rect: FpRect;
  W: number;
  H: number;
  height: number;
  color: string;
  atlas: MeshPhysicalMaterial;
  /** Die-space point the parent group sits at (its children are placed relative to it). */
  origin?: [number, number];
}) {
  const cx = rect.x + rect.w / 2 - origin[0];
  const cz = rect.y + rect.h / 2 - origin[1];
  const r = Math.min(0.025, rect.w / 6, rect.h / 6);
  return (
    <group position={[cx, 0, cz]}>
      <mesh geometry={roundedBox(rect.w, height, rect.h, r, 1)} material={sideMaterial(color)} position-y={height / 2} />
      <mesh geometry={atlasDecal(rect, W, H)} material={atlas} position-y={height + 0.001} />
    </group>
  );
}

/** Base slab with the whole floorplan on top. */
function BaseSlab({ W, H, atlas }: { W: number; H: number; atlas: MeshPhysicalMaterial }) {
  return (
    <group>
      <mesh geometry={roundedBox(W + 0.06, BASE_T, H + 0.06, 0.04, 2)} material={slabSide()} position-y={-BASE_T / 2} />
      <mesh geometry={atlasDecal({ x: 0, y: 0, w: W, h: H }, W, H)} material={atlas} position-y={0.0005} />
    </group>
  );
}

/** Centre of a die-space rectangle relative to the die centre (x, z). */
const centre = (r: FpRect, W: number, H: number): [number, number] => [r.x + r.w / 2 - W / 2, r.y + r.h / 2 - H / 2];

// ---------------------------------------------------------------------------
// Compute-die floorplan
// ---------------------------------------------------------------------------

export function CcdFloorplan() {
  // Picking one of its blocks from the tree while assembled opens the explode first.
  useAutoExplode("ccd-floorplan");
  const atlas = ccdAtlas();
  const W = CCD.w;
  const H = CCD.h;
  const L = CCD_LAYOUT;
  const [l3x, l3z] = centre(L.l3, W, H);
  const [fx, fz] = centre(L.fabric, W, H);
  return (
    <Reveal range={EX.ccdPlan.range} hidden={HIDDEN} from={CCD_FROM} to={CCD_TO}>
      <Part id="ccd-floorplan">
        <BaseSlab W={W} H={H} atlas={atlas} />
        <Part id="fp-l3" position={[l3x, -HGT.l3 + 0.004, l3z]} explode={[0, HGT.l3 - 0.004, 0]} explodeRange={[0.84, 0.95]}>
          <Block rect={L.l3} W={W} H={H} height={HGT.l3} color={FP_COLORS.l3} atlas={atlas} origin={[L.l3.x + L.l3.w / 2, L.l3.y + L.l3.h / 2]} />
        </Part>
        {L.cores.map((c) => {
          const [x, z] = centre(c.logic, W, H);
          const o: [number, number] = [c.logic.x + c.logic.w / 2, c.logic.y + c.logic.h / 2];
          const d = c.index * 0.005;
          return (
            <Part
              key={c.index}
              id={`fp-core-${c.index}`}
              position={[x, -HGT.core + 0.004, z]}
              explode={[0, HGT.core - 0.004, 0]}
              explodeRange={[0.86 + d, 0.95 + d]}
            >
              <Block rect={c.logic} W={W} H={H} height={HGT.core} color={FP_COLORS.core} atlas={atlas} origin={o} />
              <Part id={`fp-l2-${c.index}`}>
                <Block rect={c.l2} W={W} H={H} height={HGT.l2} color={FP_COLORS.l2} atlas={atlas} origin={o} />
              </Part>
            </Part>
          );
        })}
        <Part id="fp-fabric" position={[fx, -HGT.fabric + 0.004, fz]} explode={[0, HGT.fabric - 0.004, 0]} explodeRange={[0.88, 0.98]}>
          <Block rect={L.fabric} W={W} H={H} height={HGT.fabric} color={FP_COLORS.fabric} atlas={atlas} origin={[L.fabric.x + L.fabric.w / 2, L.fabric.y + L.fabric.h / 2]} />
        </Part>
        <Part id="fp-control" position={[0, -HGT.control + 0.004, 0]} explode={[0, HGT.control - 0.004, 0]} explodeRange={[0.88, 0.98]}>
          {L.control.map((r, i) => (
            <Block key={i} rect={r} W={W} H={H} height={HGT.control} color={FP_COLORS.control} atlas={atlas} origin={[W / 2, H / 2]} />
          ))}
        </Part>
      </Part>
    </Reveal>
  );
}

// ---------------------------------------------------------------------------
// Single-core floorplan
// ---------------------------------------------------------------------------

const UNIT_PART: Record<UnitId, string> = {
  fetch: "cu-fetch",
  l1i: "cu-l1i",
  decode: "cu-decode",
  int: "cu-int",
  fp: "cu-fp",
  lsu: "cu-lsu",
  l1d: "cu-l1d",
};

export function CoreFloorplan() {
  useAutoExplode("core-floorplan");
  const atlas = coreAtlas();
  const W = CORE_PLATE.w;
  const H = CORE_PLATE.h;
  const [l2x, l2z] = centre(CORE_PLATE_L2, W, H);
  return (
    <Reveal range={EX.corePlan.range} hidden={HIDDEN} from={CORE_FROM} to={CORE_TO} arc={4}>
      <Part id="core-floorplan">
        <BaseSlab W={W} H={H} atlas={atlas} />
        <Part id="cu-l2" position={[l2x, -HGT.coreL2 + 0.002, l2z]} explode={[0, HGT.coreL2 - 0.002, 0]} explodeRange={[0.93, 1]}>
          <Block
            rect={CORE_PLATE_L2}
            W={W}
            H={H}
            height={HGT.coreL2}
            color={FP_COLORS.l2}
            atlas={atlas}
            origin={[CORE_PLATE_L2.x + CORE_PLATE_L2.w / 2, CORE_PLATE_L2.y + CORE_PLATE_L2.h / 2]}
          />
        </Part>
        {CORE_UNITS.map((u, i) => {
          const r = unitRect(CORE_PLATE_LOGIC, u, false);
          const [x, z] = centre(r, W, H);
          return (
            <Part
              key={u.id}
              id={UNIT_PART[u.id]}
              position={[x, -HGT.unit + 0.002, z]}
              explode={[0, HGT.unit - 0.002, 0]}
              explodeRange={[0.93 + i * 0.006, 0.99 + i * 0.0015]}
            >
              <Block rect={r} W={W} H={H} height={HGT.unit} color={FP_COLORS[u.id]} atlas={atlas} origin={[r.x + r.w / 2, r.y + r.h / 2]} />
            </Part>
          );
        })}
        <ZoomLines />
      </Part>
    </Reveal>
  );
}

/**
 * Guide lines of the zoom callout: like the two tangents of a 2D magnifier,
 * they run from core 4's outer (right) corners on the die floorplan to the
 * near (left) corners of the magnified core, so they never cross either
 * plate. Built in the core plate's own (scaled) frame.
 */
function ZoomLines() {
  const material = useMemo(
    () => new MeshBasicMaterial({ color: "#8fd3ff", transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
    [],
  );
  useExplodeFade(EX.lines.range, (t) => {
    material.opacity = 0.8 * t;
  });
  const geo = useMemo(
    () =>
      cached("cpu-zoom-lines", () => {
        const a = ZOOM_CORE.all;
        const toLocal = CORE_M.clone().invert();
        const from = [
          [a.x + a.w, a.y],
          [a.x + a.w, a.y + a.h],
        ].map(([x, z]) => new Vector3(x - CCD.w / 2, HGT.core, z - CCD.h / 2).applyMatrix4(CCD_M).applyMatrix4(toLocal));
        const to = [
          [-CORE_PLATE.w / 2, -CORE_PLATE.h / 2],
          [-CORE_PLATE.w / 2, CORE_PLATE.h / 2],
        ].map(([x, z]) => new Vector3(x, 0, z));
        const r = 0.2 / EX.corePlan.scale;
        const up = new Vector3(0, 1, 0);
        const parts = from.map((p0, i) => {
          const p1 = to[i];
          const dir = p1.clone().sub(p0);
          const g = new CylinderGeometry(r, r, dir.length(), 6, 1, true);
          g.applyMatrix4(
            new Matrix4().compose(
              p0.clone().add(p1).multiplyScalar(0.5),
              new Quaternion().setFromUnitVectors(up, dir.normalize()),
              new Vector3(1, 1, 1),
            ),
          );
          return g;
        });
        return mergeGeometries(parts)!;
      }),
    [],
  );
  return <mesh geometry={geo} material={material} renderOrder={2} />;
}
