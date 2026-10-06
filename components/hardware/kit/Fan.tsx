"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import {
  CircleGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  MeshPhysicalMaterial,
  Shape,
  TorusGeometry,
  type BufferGeometry,
  type Material,
} from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { useExplorer } from "@/lib/hardware/store";
import { FONT_SANS, painted } from "@/lib/three/painter";
import { cached } from "./geometry";
import { MAT } from "./materials";

export interface FanProps {
  /** Blade tip radius in mm. */
  radius?: number;
  hubRadius?: number;
  blades?: number;
  /** Blade depth (axial height) in mm. */
  depth?: number;
  /** +1 counter-clockwise seen from above, −1 clockwise. */
  direction?: 1 | -1;
  /** Ring joining the blade tips (barrier ring). */
  rimRing?: boolean;
  /** Revolutions per second when animating. */
  rps?: number;
  hubLabel?: string;
  bladeMaterial?: Material;
}

/**
 * Builds one swept, twisted fan blade: a crescent outline extruded to blade
 * thickness, then every vertex is rotated about the radial axis by a pitch
 * angle that decreases from root to tip (like a real impeller).
 */
function bladeGeometry(rh: number, rt: number, depth: number, count: number, dir: number): BufferGeometry {
  const sweep = 0.55; // radians the leading edge sweeps forward from root to tip
  const chordRoot = (Math.PI * 2) / count * 0.78;
  const chordTip = (Math.PI * 2) / count * 0.92;
  const frac = (r: number) => Math.min(1, Math.max(0, (r - rh) / (rt - rh)));
  const lead = (r: number) => sweep * Math.pow(frac(r), 1.5);
  const chord = (r: number) => chordRoot + (chordTip - chordRoot) * frac(r);
  const steps = 18;
  const shape = new Shape();
  const ptsLead: [number, number][] = [];
  const ptsTrail: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const r = rh + ((rt - rh) * i) / steps;
    const a = lead(r);
    ptsLead.push([r * Math.cos(a), r * Math.sin(a)]);
    const b = a - chord(r);
    ptsTrail.push([r * Math.cos(b), r * Math.sin(b)]);
  }
  shape.moveTo(ptsLead[0][0], ptsLead[0][1]);
  for (let i = 1; i <= steps; i++) shape.lineTo(ptsLead[i][0], ptsLead[i][1]);
  // rounded tip: arc from leading to trailing edge at the tip radius
  const aT = lead(rt);
  const bT = aT - chord(rt);
  const tipSteps = 10;
  for (let i = 1; i < tipSteps; i++) {
    const ang = aT + ((bT - aT) * i) / tipSteps;
    shape.lineTo(rt * Math.cos(ang), rt * Math.sin(ang));
  }
  for (let i = steps; i >= 0; i--) shape.lineTo(ptsTrail[i][0], ptsTrail[i][1]);
  shape.closePath();

  const thick = 1.1;
  const g = new ExtrudeGeometry(shape, {
    depth: thick,
    bevelEnabled: true,
    bevelThickness: 0.35,
    bevelSize: 0.35,
    bevelSegments: 2,
    curveSegments: 4,
  });
  g.translate(0, 0, -thick / 2);
  // Shape lies in XY; map to XZ (horizontal) with Y = axial.
  g.rotateX(-Math.PI / 2);

  const pos = g.getAttribute("position");
  const out = new Float32Array(pos.count * 3);
  const pitchRoot = (42 * Math.PI) / 180;
  const pitchTip = (24 * Math.PI) / 180;
  let maxY = 0;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.max(1e-3, Math.hypot(x, z));
    const theta = Math.atan2(-z, x);
    const tr = Math.min(1, Math.max(0, (r - rh) / (rt - rh)));
    const mid = lead(r) - chord(r) / 2;
    const s = r * (theta - mid);
    const alpha = pitchRoot + (pitchTip - pitchRoot) * tr;
    const s2 = s * Math.cos(alpha) - y * Math.sin(alpha);
    const y2 = s * Math.sin(alpha) + y * Math.cos(alpha);
    const th2 = mid + s2 / r;
    out[i * 3] = r * Math.cos(th2);
    out[i * 3 + 1] = y2;
    out[i * 3 + 2] = -r * Math.sin(th2) * dir;
    maxY = Math.max(maxY, Math.abs(y2));
  }
  // Fit the blade's axial extent to the requested depth.
  const k = depth / 2 / maxY;
  for (let i = 0; i < pos.count; i++) out[i * 3 + 1] = out[i * 3 + 1] * k + depth / 2;
  g.setAttribute("position", new Float32BufferAttribute(out, 3));
  if (dir < 0) {
    // Mirroring flipped the winding.
    const idx = g.getIndex();
    if (idx) {
      const a = idx.array as Uint32Array;
      for (let i = 0; i < a.length; i += 3) {
        const t = a[i + 1];
        a[i + 1] = a[i + 2];
        a[i + 2] = t;
      }
    } else {
      const p = g.getAttribute("position").array as Float32Array;
      for (let i = 0; i < p.length; i += 9) {
        for (let k = 0; k < 3; k++) {
          const t = p[i + 3 + k];
          p[i + 3 + k] = p[i + 6 + k];
          p[i + 6 + k] = t;
        }
      }
    }
  }
  g.deleteAttribute("normal");
  g.deleteAttribute("uv");
  const merged = mergeVertices(g, 1e-4);
  merged.computeVertexNormals();
  return merged;
}

const hubMats = new Map<string, MeshPhysicalMaterial>();
function hubMaterial(label: string) {
  let m = hubMats.get(label);
  if (m) return m;
  const maps = painted(`fanhub:${label}`, 40, 40, 20, { color: "#16171a", rough: 0.5, metal: 0.2, height: 0.5 }, (p) => {
    p.ring(20, 20, 17.5, 0.8, { color: "#2a2c31", rough: 0.3, metal: 0.8, height: 0.6 });
    p.ring(20, 20, 13, 0.25, { color: "#4b4f57", rough: 0.4, metal: 0.6, height: 0.55 });
    p.text(label, 20, 20.6, 5.2, { color: "#d9dbe0", rough: 0.45, metal: 0.2, height: 0.6 }, {
      align: "center",
      baseline: "middle",
      font: FONT_SANS,
      weight: 800,
      letterSpacing: 0.6,
    });
  });
  m = new MeshPhysicalMaterial({
    map: maps.map,
    roughnessMap: maps.rmMap,
    metalnessMap: maps.rmMap,
    roughness: 1,
    metalness: 1,
    clearcoat: 0.35,
    clearcoatRoughness: 0.4,
  });
  hubMats.set(label, m);
  return m;
}

/**
 * Axial fan centred at the origin, blowing along −Y. The rotor spins when the
 * explorer's "animate" toggle is on.
 */
export function Fan({
  radius = 46,
  hubRadius = 19,
  blades = 11,
  depth = 11,
  direction = 1,
  rimRing = true,
  rps = 0.7,
  hubLabel = "AERO",
  bladeMaterial,
}: FanProps) {
  const rotor = useRef<Group>(null);
  const geos = useMemo(() => {
    const blade = cached(`blade:${radius}:${hubRadius}:${blades}:${depth}:${direction}`, () =>
      bladeGeometry(hubRadius - 1.5, radius - (rimRing ? 1.2 : 0.4), depth, blades, direction),
    );
    const allBlades = cached(`blades:${radius}:${hubRadius}:${blades}:${depth}:${direction}`, () => {
      const list: BufferGeometry[] = [];
      for (let i = 0; i < blades; i++) {
        const b = blade.clone();
        b.rotateY((i / blades) * Math.PI * 2);
        list.push(b);
      }
      return mergeGeometries(list)!;
    });
    const hub = cached(`hub:${hubRadius}:${depth}`, () => {
      const g = new CylinderGeometry(hubRadius, hubRadius * 1.02, depth, 48, 1, true);
      g.translate(0, depth / 2, 0);
      return g;
    });
    const cap = cached(`hubcap:${hubRadius}`, () => {
      const g = new CircleGeometry(hubRadius, 48);
      g.rotateX(-Math.PI / 2);
      return g;
    });
    const rim = cached(`rim:${radius}:${depth}`, () => {
      const g = new CylinderGeometry(radius, radius, depth * 0.55, 72, 1, true);
      g.translate(0, depth * 0.5, 0);
      return g;
    });
    const rimLip = cached(`rimlip:${radius}`, () => {
      const g = new TorusGeometry(radius, 0.6, 8, 72);
      g.rotateX(Math.PI / 2);
      return g;
    });
    return { allBlades, hub, cap, rim, rimLip };
  }, [radius, hubRadius, blades, depth, direction, rimRing]);

  useFrame((_, dt) => {
    const r = rotor.current;
    if (!r || !useExplorer.getState().animate) return;
    r.rotation.y += dt * rps * Math.PI * 2 * direction;
  });

  const bm = bladeMaterial ?? MAT.plasticSatin;
  return (
    <group>
      <group ref={rotor}>
        <mesh geometry={geos.allBlades} material={bm} castShadow receiveShadow />
        <mesh geometry={geos.hub} material={MAT.plasticSatin} castShadow receiveShadow />
        <mesh geometry={geos.cap} material={hubMaterial(hubLabel)} position-y={depth + 0.01} />
        {rimRing && (
          <>
            <mesh geometry={geos.rim} material={MAT.plasticSatin} castShadow receiveShadow />
            <mesh geometry={geos.rimLip} material={MAT.plasticSatin} position-y={depth * 0.775} />
          </>
        )}
      </group>
    </group>
  );
}
