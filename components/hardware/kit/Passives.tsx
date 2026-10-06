"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import {
  BoxGeometry,
  CircleGeometry,
  CylinderGeometry,
  InstancedMesh,
  Matrix4,
  MeshPhysicalMaterial,
  Object3D,
  type Material,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { FONT_COND, painted, rng } from "@/lib/three/painter";
import { markingMaterial, type MarkingSpec } from "./Chip";
import { cached, roundedBox } from "./geometry";
import { MAT } from "./materials";

type Vec3 = [number, number, number];

// ---------------------------------------------------------------------------
// SMD chip resistors / capacitors (instanced)
// ---------------------------------------------------------------------------

export type SmdSize = "0201" | "0402" | "0603" | "0805" | "1206";

const SMD: Record<SmdSize, { l: number; w: number; hCap: number; hRes: number }> = {
  "0201": { l: 0.6, w: 0.3, hCap: 0.3, hRes: 0.23 },
  "0402": { l: 1.0, w: 0.5, hCap: 0.5, hRes: 0.32 },
  "0603": { l: 1.6, w: 0.8, hCap: 0.8, hRes: 0.45 },
  "0805": { l: 2.0, w: 1.25, hCap: 1.0, hRes: 0.5 },
  "1206": { l: 3.2, w: 1.6, hCap: 1.15, hRes: 0.55 },
};

/** Position on the board (x, z in mm) and rotation about Y in degrees. */
export type SmdItem = [x: number, z: number, rotDeg?: number];

const dummy = new Object3D();

/**
 * Many identical SMD parts in two draw calls (body + end terminals).
 * Sits on y = 0 of the parent (the board surface).
 */
export function SmdField({
  items,
  size = "0402",
  kind = "cap",
  body,
}: {
  items: SmdItem[];
  size?: SmdSize;
  kind?: "cap" | "res";
  body?: Material;
}) {
  const bodyRef = useRef<InstancedMesh>(null);
  const termRef = useRef<InstancedMesh>(null);
  const s = SMD[size];
  const h = kind === "cap" ? s.hCap : s.hRes;
  const geos = useMemo(() => {
    const bodyGeo = cached(`smd-body:${size}:${kind}`, () => {
      const g = new BoxGeometry(s.l * 0.62, h * 0.97, s.w * 0.97);
      g.translate(0, h / 2, 0);
      return g;
    });
    const termGeo = cached(`smd-term:${size}:${kind}`, () => {
      const t = s.l * 0.22;
      const a = new BoxGeometry(t, h, s.w);
      a.translate(-s.l / 2 + t / 2, h / 2, 0);
      const b = new BoxGeometry(t, h, s.w);
      b.translate(s.l / 2 - t / 2, h / 2, 0);
      return mergeGeometries([a, b])!;
    });
    return { bodyGeo, termGeo };
  }, [size, kind, s, h]);

  useLayoutEffect(() => {
    for (const ref of [bodyRef, termRef]) {
      const m = ref.current;
      if (!m) continue;
      items.forEach(([x, z, r = 0], i) => {
        dummy.position.set(x, 0, z);
        dummy.rotation.set(0, (r * Math.PI) / 180, 0);
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
      });
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
      m.computeBoundingBox();
    }
  }, [items]);

  if (items.length === 0) return null;
  const bodyMat = body ?? (kind === "cap" ? MAT.ceramic : MAT.resistor);
  return (
    <group>
      <instancedMesh ref={bodyRef} args={[geos.bodyGeo, bodyMat, items.length]} castShadow receiveShadow />
      <instancedMesh ref={termRef} args={[geos.termGeo, MAT.tin, items.length]} castShadow receiveShadow />
    </group>
  );
}

// --- Placement helpers -----------------------------------------------------

/** Items evenly spaced along a rectangle's perimeter (e.g. decoupling ring). */
export function ringOf(cx: number, cz: number, w: number, d: number, perSide: number, rotate = true): SmdItem[] {
  const out: SmdItem[] = [];
  for (let i = 0; i < perSide; i++) {
    const t = (i + 0.5) / perSide;
    const x = cx - w / 2 + w * t;
    const z = cz - d / 2 + d * t;
    out.push([x, cz - d / 2, rotate ? 90 : 0], [x, cz + d / 2, rotate ? 90 : 0]);
    out.push([cx - w / 2, z, 0], [cx + w / 2, z, 0]);
  }
  return out;
}

/** Items in a straight row from (x0, z0) to (x1, z1). */
export function rowOf(x0: number, z0: number, x1: number, z1: number, count: number, rot = 0): SmdItem[] {
  const out: SmdItem[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    out.push([x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, rot]);
  }
  return out;
}

/** A regular grid of items centred on (cx, cz). */
export function gridOf(cx: number, cz: number, cols: number, rows: number, px: number, pz: number, rot = 0): SmdItem[] {
  const out: SmdItem[] = [];
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++)
      out.push([cx + (i - (cols - 1) / 2) * px, cz + (j - (rows - 1) / 2) * pz, rot]);
  return out;
}

type Rect = [x: number, z: number, w: number, d: number];

/** Random placement inside `area`, avoiding the `avoid` rectangles. */
export function scatterIn(area: Rect, count: number, seed: number, avoid: Rect[] = [], margin = 0.6): SmdItem[] {
  const rand = rng(seed);
  const out: SmdItem[] = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 40) {
    const x = area[0] + rand() * area[2];
    const z = area[1] + rand() * area[3];
    const hit = avoid.some(([ax, az, aw, ad]) => x > ax - margin && x < ax + aw + margin && z > az - margin && z < az + ad + margin);
    if (hit) continue;
    out.push([x, z, rand() > 0.5 ? 90 : 0]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Polymer / electrolytic capacitors
// ---------------------------------------------------------------------------

const capTopMats = new Map<string, MeshPhysicalMaterial>();
function capTopMaterial(r: number, stripe: string, label: string) {
  const key = `${r}:${stripe}:${label}`;
  let m = capTopMats.get(key);
  if (m) return m;
  const d = r * 2;
  const maps = painted(`captop:${key}`, d, d, Math.min(80, 600 / d), { color: "#c3c7cc", rough: 0.28, metal: 1, height: 0.5 }, (p) => {
    // Pressure-relief vent score (a cross) and polarity marking ink.
    const groove = { color: "#8d9198", rough: 0.4, metal: 1, height: 0.25 };
    p.polyline([[r * 0.35, r], [d - r * 0.35, r]], r * 0.06, groove);
    p.polyline([[r, r * 0.35], [r, d - r * 0.35]], r * 0.06, groove);
    p.shape(
      (ctx) => {
        ctx.moveTo(r, r);
        ctx.arc(r, r, r, Math.PI * 0.62, Math.PI * 1.38);
        ctx.closePath();
      },
      { color: stripe, rough: 0.6, metal: 0, height: 0.55 },
    );
    p.text(label, r * 1.25, r * 0.62, r * 0.36, { color: "#25272b", rough: 0.6, metal: 0, height: 0.55 }, {
      align: "center",
      baseline: "middle",
      font: FONT_COND,
      weight: 700,
    });
  });
  m = new MeshPhysicalMaterial({
    map: maps.map,
    roughnessMap: maps.rmMap,
    metalnessMap: maps.rmMap,
    bumpMap: maps.bumpMap,
    bumpScale: 0.3,
    roughness: 1,
    metalness: 1,
  });
  capTopMats.set(key, m);
  return m;
}

/**
 * Surface-mount aluminium polymer capacitor ("V-chip"): aluminium can on a
 * black plastic base, with a vent cross and coloured polarity mark on top.
 */
export function PolymerCap({
  position,
  radius = 4,
  height = 7,
  stripe = "#5b2a86",
  label = "560",
}: {
  position?: Vec3;
  radius?: number;
  height?: number;
  stripe?: string;
  label?: string;
}) {
  const base = radius * 2.15;
  const can = cached(`cap-can:${radius}:${height}`, () => {
    const g = new CylinderGeometry(radius, radius, height - 0.9, 40, 1, true);
    g.translate(0, 0.9 + (height - 0.9) / 2, 0);
    return g;
  });
  const lip = cached(`cap-lip:${radius}`, () => {
    const g = new CylinderGeometry(radius * 0.97, radius, 0.35, 40);
    return g;
  });
  const top = cached(`cap-top:${radius}`, () => {
    const g = new CircleGeometry(radius * 0.97, 40);
    g.rotateX(-Math.PI / 2);
    return g;
  });
  return (
    <group position={position}>
      <mesh geometry={roundedBox(base, 0.9, base, 0.25)} material={MAT.plasticBlack} position-y={0.45} castShadow receiveShadow />
      <mesh geometry={can} material={MAT.aluminumBrushed} castShadow receiveShadow />
      <mesh geometry={lip} material={MAT.aluminumBrushed} position-y={height - 0.175} />
      <mesh geometry={top} material={capTopMaterial(radius * 0.97, stripe, label)} position-y={height + 0.001} />
    </group>
  );
}

/** Moulded tantalum / POSCAP capacitor with a polarity bar. */
export function TantalumCap({
  position,
  rotation,
  size = [7.3, 1.9, 4.3],
  label = ["470", "2.5V"],
}: {
  position?: Vec3;
  rotation?: Vec3;
  size?: Vec3;
  label?: string[];
}) {
  const [w, h, d] = size;
  const mark: MarkingSpec = { lines: label, pin1: false, ink: "#9a9a9e", base: "#141416", scale: 1.3 };
  return (
    <group position={position} rotation={rotation}>
      <mesh geometry={roundedBox(w * 0.9, h, d, 0.2)} material={MAT.epoxy} position-y={h / 2} castShadow receiveShadow />
      <mesh geometry={cached(`tant-bar:${w}:${d}`, () => new BoxGeometry(w * 0.08, 0.02, d * 0.8))} material={MAT.plasticWhite} position={[-w * 0.33, h + 0.01, 0]} />
      <mesh
        geometry={cached(`tant-decal:${w}:${d}`, () => {
          const g = new BoxGeometry(w * 0.5, 0.01, d * 0.8);
          return g;
        })}
        material={markingMaterial(w * 0.5, d * 0.8, mark)}
        position={[w * 0.08, h + 0.006, 0]}
      />
      <mesh geometry={cached(`tant-term:${w}:${h}:${d}`, () => {
        const a = new BoxGeometry(w * 0.12, h * 0.55, d * 0.7);
        a.translate(-w / 2 + w * 0.06, h * 0.275, 0);
        const b = a.clone();
        b.translate(w - w * 0.12, 0, 0);
        return mergeGeometries([a, b])!;
      })} material={MAT.tin} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Inductors (VRM chokes)
// ---------------------------------------------------------------------------

/**
 * Power inductor ("choke"). `ferrite` = dark grey moulded block with a
 * printed value; `metal` = metal-composite choke with a satin finish.
 */
export function Choke({
  position,
  rotation,
  size = [10.5, 7, 10.5],
  label = "R22",
  style = "ferrite",
  radius,
}: {
  position?: Vec3;
  rotation?: Vec3;
  size?: Vec3;
  label?: string;
  style?: "ferrite" | "metal";
  /** Edge rounding (defaults to 6% of the smallest side, max 0.6 mm). */
  radius?: number;
}) {
  const [w, h, d] = size;
  const r = radius ?? Math.min(0.6, Math.min(w, h, d) * 0.06);
  const inset = Math.min(1.4, Math.min(w, d) * 0.14);
  const bodyMat = style === "metal" ? MAT.aluminumGunmetal : MAT.ferrite;
  const mark: MarkingSpec = {
    lines: [label],
    pin1: false,
    ink: style === "metal" ? "#1b1c1f" : "#c9cacd",
    base: style === "metal" ? "#5b5f66" : "#3b3c40",
    scale: 1.9,
  };
  return (
    <group position={position} rotation={rotation}>
      <mesh geometry={roundedBox(w, h, d, r, 3)} material={bodyMat} position-y={h / 2 + 0.05} castShadow receiveShadow />
      <mesh
        geometry={cached(`choke-decal:${w}:${d}:${inset}`, () => {
          const g = new BoxGeometry(w - inset, 0.01, d - inset);
          return g;
        })}
        material={markingMaterial(w - inset, d - inset, mark)}
        position-y={h + 0.06}
      />
      <mesh geometry={cached(`choke-term:${w}:${d}`, () => {
        const a = new BoxGeometry(w * 0.3, 0.5, 0.5);
        a.translate(0, 0.25, -d / 2 - 0.05);
        const b = a.clone();
        b.translate(0, 0, d + 0.1);
        return mergeGeometries([a, b])!;
      })} material={MAT.tin} />
    </group>
  );
}

/** Instanced matrix helper for callers building their own fields. */
export function setInstances(mesh: InstancedMesh, transforms: Matrix4[]) {
  transforms.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
}
