"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import {
  BoxGeometry,
  BufferGeometry,
  InstancedMesh,
  Matrix4,
  MeshPhysicalMaterial,
  PlaneGeometry,
  SphereGeometry,
  type Material,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { FONT_COND, painted } from "@/lib/three/painter";
import { cached, roundedBox } from "./geometry";
import { MAT } from "./materials";
import { Part } from "../Part";

type Vec3 = [number, number, number];

export interface MarkingSpec {
  lines: string[];
  /** Logo mark drawn before the first line. */
  logo?: "dot-ring" | "wave" | "triangle" | "square" | null;
  /** Pin-1 indicator: a moulded dimple in a corner. */
  pin1?: boolean;
  /** Ink colour (laser marks are slightly lighter than the moulding). */
  ink?: string;
  /** Body colour under the marking. */
  base?: string;
  /** Relative text size (1 = auto-fit). */
  scale?: number;
}

const markMats = new Map<string, MeshPhysicalMaterial>();

/** Top decal material with laser-etched marking text. */
export function markingMaterial(w: number, d: number, m: MarkingSpec, glossy = false) {
  const key = `${w}x${d}:${m.lines.join("|")}:${m.logo}:${m.pin1}:${m.ink}:${m.base}:${m.scale}:${glossy}`;
  let mat = markMats.get(key);
  if (mat) return mat;
  const ppm = Math.min(60, 900 / Math.max(w, d));
  const base = m.base ?? "#1a1a1c";
  const maps = painted(`mark:${key}`, w, d, ppm, { color: base, rough: glossy ? 0.2 : 0.74, metal: 0, height: 0.5 }, (p) => {
    const ink = { color: m.ink ?? "#77787c", rough: 0.9, metal: 0, height: 0.45 };
    const n = m.lines.length;
    const fit = Math.min(d / (n + 1.6), w / 9) * (m.scale ?? 1);
    const size = Math.max(0.4, fit);
    const top = d / 2 - ((n - 1) * size * 1.25) / 2;
    let x0 = w * 0.1;
    if (m.logo) {
      const r = size * 0.75;
      const lx = w * 0.1 + r;
      const ly = top - size * 0.2;
      if (m.logo === "dot-ring") {
        p.ring(lx, ly, r * 0.8, r * 0.28, ink);
        p.circle(lx, ly, r * 0.25, ink);
      } else if (m.logo === "wave") {
        p.shape(
          (ctx) => {
            ctx.moveTo(lx - r, ly);
            ctx.bezierCurveTo(lx - r * 0.3, ly - r * 1.3, lx + r * 0.3, ly + r * 1.3, lx + r, ly);
          },
          ink,
          "stroke",
          r * 0.3,
        );
      } else if (m.logo === "triangle") {
        p.polygon(
          [
            [lx, ly - r],
            [lx + r, ly + r * 0.8],
            [lx - r, ly + r * 0.8],
          ],
          ink,
        );
      } else {
        p.rect(lx - r * 0.8, ly - r * 0.8, r * 1.6, r * 1.6, ink);
      }
      x0 = lx + r * 1.8;
    }
    m.lines.forEach((line, i) => {
      p.text(line, i === 0 ? x0 : w * 0.1, top + i * size * 1.25, size, ink, {
        baseline: "middle",
        font: FONT_COND,
        weight: 600,
        maxWidth: w * 0.82 - (i === 0 ? x0 - w * 0.1 : 0),
      });
    });
    if (m.pin1 !== false) {
      const r = Math.min(w, d) * 0.06;
      p.circle(w * 0.1 + r, d - d * 0.1 - r, r, { color: "#101011", rough: 0.35, metal: 0, height: 0.2 });
    }
  });
  mat = new MeshPhysicalMaterial({
    map: maps.map,
    roughnessMap: maps.rmMap,
    metalnessMap: maps.rmMap,
    bumpMap: maps.bumpMap,
    bumpScale: 0.3,
    roughness: 1,
    metalness: 1,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  markMats.set(key, mat);
  return mat;
}

function topDecal(w: number, d: number) {
  return cached(`decal:${w}:${d}`, () => {
    const g = new PlaneGeometry(w, d);
    g.rotateX(-Math.PI / 2);
    return g;
  });
}

export interface ChipProps {
  /** [x width, height, z depth] of the moulded body in mm. */
  size: Vec3;
  position?: Vec3;
  rotation?: Vec3;
  marking?: MarkingSpec;
  kind?: "bga" | "qfn" | "soic" | "tsop" | "sot" | "lga";
  /** Leads per long side for SOIC/TSOP, per side for QFN. */
  pins?: number;
  body?: Material;
  /** Gap between the board and the body (solder balls / standoff). */
  standoff?: number;
  /** Show BGA solder balls under the body. */
  balls?: { pitch: number; inset?: number };
}

/**
 * A packaged IC sitting on the board at y = 0. The body is a rounded block of
 * epoxy with an etched marking decal; leads/terminals depend on `kind`.
 */
export function Chip({
  size,
  position,
  rotation,
  marking,
  kind = "bga",
  pins = 8,
  body = MAT.epoxy,
  standoff,
  balls,
}: ChipProps) {
  const [w, h, d] = size;
  const so = standoff ?? (kind === "bga" ? 0.3 : kind === "qfn" || kind === "lga" ? 0.05 : 0.15);
  const r = Math.min(0.25, h * 0.25);
  return (
    <group position={position} rotation={rotation}>
      <mesh geometry={roundedBox(w, h, d, r)} material={body} position-y={so + h / 2} castShadow receiveShadow />
      {marking && (
        <mesh
          geometry={topDecal(w - 2 * r, d - 2 * r)}
          material={markingMaterial(w - 2 * r, d - 2 * r, marking)}
          position-y={so + h + 0.002}
        />
      )}
      {kind === "qfn" && <QfnTerminals w={w} d={d} pins={pins} />}
      {(kind === "soic" || kind === "tsop") && <GullLeads w={w} d={d} pins={pins} h={h} so={so} fine={kind === "tsop"} />}
      {kind === "sot" && <GullLeads w={w} d={d} pins={pins} h={h} so={so} fine={false} />}
      {kind === "bga" && balls && <BallGrid w={w} d={d} pitch={balls.pitch} inset={balls.inset ?? balls.pitch} y={so / 2} r={so * 0.62} />}
    </group>
  );
}

function QfnTerminals({ w, d, pins }: { w: number; d: number; pins: number }) {
  const geo = useMemo(
    () =>
      cached(`qfn:${w}:${d}:${pins}`, () => {
        const parts: BufferGeometry[] = [];
        const pw = 0.25;
        const pl = 0.4;
        const pitchX = (w * 0.8) / pins;
        const pitchZ = (d * 0.8) / pins;
        for (let i = 0; i < pins; i++) {
          const ox = -w * 0.4 + pitchX * (i + 0.5);
          const oz = -d * 0.4 + pitchZ * (i + 0.5);
          for (const [x, z, sx, sz] of [
            [ox, d / 2 - pl / 2 + 0.02, pw, pl],
            [ox, -d / 2 + pl / 2 - 0.02, pw, pl],
            [w / 2 - pl / 2 + 0.02, oz, pl, pw],
            [-w / 2 + pl / 2 - 0.02, oz, pl, pw],
          ]) {
            const b = new BoxGeometry(sx, 0.12, sz);
            b.translate(x, 0.06, z);
            parts.push(b);
          }
        }
        return mergeGeometries(parts)!;
      }),
    [w, d, pins],
  );
  return <mesh geometry={geo} material={MAT.tin} />;
}

function GullLeads({ w, d, pins, h, so, fine }: { w: number; d: number; pins: number; h: number; so: number; fine: boolean }) {
  const geo = useMemo(
    () =>
      cached(`gull:${w}:${d}:${pins}:${h}:${fine}`, () => {
        const parts: BufferGeometry[] = [];
        const lw = fine ? 0.22 : 0.42;
        const t = 0.15;
        const reach = fine ? 0.6 : 1.0;
        const pitch = (w * 0.9) / pins;
        for (let i = 0; i < pins; i++) {
          const x = -w * 0.45 + pitch * (i + 0.5);
          for (const side of [-1, 1]) {
            const zEdge = (side * d) / 2;
            // shoulder
            const s = new BoxGeometry(lw, t, reach * 0.45);
            s.translate(x, so + h * 0.45, zEdge + side * reach * 0.2);
            // leg
            const l = new BoxGeometry(lw, so + h * 0.45, t);
            l.translate(x, (so + h * 0.45) / 2, zEdge + side * reach * 0.45);
            // foot
            const f = new BoxGeometry(lw, t, reach * 0.5);
            f.translate(x, t / 2, zEdge + side * reach * 0.7);
            parts.push(s, l, f);
          }
        }
        return mergeGeometries(parts)!;
      }),
    [w, d, pins, h, so, fine],
  );
  return <mesh geometry={geo} material={MAT.tin} castShadow />;
}

const ballGeo = new SphereGeometry(1, 10, 6);
const tmpM = new Matrix4();

/** Solder balls of a BGA (visible when the package is lifted in exploded view). */
export function BallGrid({
  w,
  d,
  pitch,
  inset,
  y,
  r,
  hollow = 0,
}: {
  w: number;
  d: number;
  pitch: number;
  inset: number;
  y: number;
  r: number;
  hollow?: number;
}) {
  const ref = useRef<InstancedMesh>(null);
  const pts = useMemo(() => {
    const out: [number, number][] = [];
    const cols = Math.max(1, Math.floor((w - 2 * inset) / pitch) + 1);
    const rows = Math.max(1, Math.floor((d - 2 * inset) / pitch) + 1);
    const x0 = -((cols - 1) * pitch) / 2;
    const z0 = -((rows - 1) * pitch) / 2;
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        if (hollow > 0 && Math.abs(i - (cols - 1) / 2) < hollow / 2 && Math.abs(j - (rows - 1) / 2) < hollow / 2) continue;
        out.push([x0 + i * pitch, z0 + j * pitch]);
      }
    return out;
  }, [w, d, pitch, inset, hollow]);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    pts.forEach(([x, z], i) => {
      tmpM.makeScale(r, r * 0.85, r).setPosition(x, y, z);
      m.setMatrixAt(i, tmpM);
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [pts, r, y]);
  return <instancedMesh ref={ref} args={[ballGeo, MAT.tin, pts.length]} />;
}

export interface FlipChipProps {
  position?: Vec3;
  rotation?: Vec3;
  /** Organic substrate [w, thickness, d]. */
  substrate: Vec3;
  /** Silicon die [w, thickness, d]. */
  die: Vec3;
  dieOffset?: [number, number];
  /** Laser marking etched on the die back. */
  dieMarking?: string[];
  substrateMaterial?: Material;
  /** Solder ball pitch on the underside. */
  ballPitch?: number;
  /** Part ids that make the die and the substrate individually selectable. */
  dieId?: string;
  substrateId?: string;
  /** Material for the die's active (circuit) side, which faces down. */
  dieShot?: Material;
  /** In exploded view, lift the die and flip it to show the circuitry. */
  dieExplode?: { lift: number; flip?: boolean; range?: [number, number] };
}

const dieMats = new Map<string, MeshPhysicalMaterial>();
function dieMaterial(w: number, d: number, lines: string[]) {
  const key = `${w}:${d}:${lines.join("|")}`;
  let m = dieMats.get(key);
  if (m) return m;
  const maps = painted(`die:${key}`, w, d, 40, { color: "#2b2e36", rough: 0.08, metal: 0.75, height: 0.5 }, (p) => {
    const ink = { color: "#3f434d", rough: 0.35, metal: 0.6, height: 0.48 };
    const size = Math.min(d / 14, w / 12);
    lines.forEach((l, i) =>
      p.text(l, w * 0.08, d * 0.12 + size * 1.4 * (i + 1), size, ink, { font: FONT_COND, weight: 600 }),
    );
  });
  m = new MeshPhysicalMaterial({
    map: maps.map,
    roughnessMap: maps.rmMap,
    metalnessMap: maps.rmMap,
    roughness: 1,
    metalness: 1,
    iridescence: 0.4,
    iridescenceIOR: 1.7,
    iridescenceThicknessRange: [250, 650],
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  dieMats.set(key, m);
  return m;
}

/**
 * A flip-chip package (GPU / CPU without lid): organic substrate, the bare
 * silicon die mounted upside-down on top, and an underfill fillet.
 */
export function FlipChip({
  position,
  rotation,
  substrate,
  die,
  dieOffset = [0, 0],
  dieMarking,
  substrateMaterial = MAT.substrate,
  ballPitch = 1,
  dieId,
  substrateId,
  dieShot,
  dieExplode,
}: FlipChipProps) {
  const [sw, st, sd] = substrate;
  const [dw, dt, dd] = die;
  const so = 0.45;
  const dieCenterY = so + st + 0.05 + dt / 2;
  const substrateMeshes = (
    <>
      <mesh geometry={roundedBox(sw, st, sd, 0.3)} material={substrateMaterial} position-y={so + st / 2} castShadow receiveShadow />
      <mesh
        geometry={roundedBox(dw + 0.9, 0.18, dd + 0.9, 0.09)}
        material={MAT.underfill}
        position={[dieOffset[0], so + st + 0.09, dieOffset[1]]}
      />
      <BallGrid w={sw} d={sd} pitch={ballPitch} inset={ballPitch * 1.2} y={so / 2} r={so * 0.6} />
    </>
  );
  const dieMeshes = (
    <>
      <mesh geometry={roundedBox(dw, dt, dd, 0.06)} material={MAT.silicon} castShadow receiveShadow />
      {dieMarking && (
        <mesh
          geometry={topDecal(dw - 0.15, dd - 0.15)}
          material={dieMaterial(dw - 0.15, dd - 0.15, dieMarking)}
          position-y={dt / 2 + 0.002}
        />
      )}
      {dieShot && <mesh geometry={bottomDecal(dw - 0.1, dd - 0.1)} material={dieShot} position-y={-dt / 2 - 0.002} />}
    </>
  );
  return (
    <group position={position} rotation={rotation}>
      {substrateId ? <Part id={substrateId}>{substrateMeshes}</Part> : substrateMeshes}
      {dieId ? (
        <Part
          id={dieId}
          position={[dieOffset[0], dieCenterY, dieOffset[1]]}
          explode={dieExplode ? [0, dieExplode.lift, 0] : undefined}
          explodeRotate={dieExplode?.flip ? [Math.PI, 0, 0] : undefined}
          explodeRange={dieExplode?.range}
        >
          {dieMeshes}
        </Part>
      ) : (
        <group position={[dieOffset[0], dieCenterY, dieOffset[1]]}>{dieMeshes}</group>
      )}
    </group>
  );
}

function bottomDecal(w: number, d: number) {
  return cached(`bdecal:${w}:${d}`, () => {
    const g = new PlaneGeometry(w, d);
    g.rotateX(Math.PI / 2);
    return g;
  });
}
