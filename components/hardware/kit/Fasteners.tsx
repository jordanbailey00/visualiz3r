"use client";

import { BoxGeometry, LatheGeometry, Vector2, type Material } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { cached } from "./geometry";
import { MAT } from "./materials";

type Vec3 = [number, number, number];

function headGeometry(d: number, h: number, kind: "pan" | "flat" | "button") {
  return cached(`screwhead:${d}:${h}:${kind}`, () => {
    const r = d / 2;
    const pts: Vector2[] = [];
    if (kind === "flat") {
      pts.push(new Vector2(0, h), new Vector2(r * 0.98, h), new Vector2(r, h * 0.85), new Vector2(r * 0.45, 0), new Vector2(0, 0));
    } else {
      const dome = kind === "button" ? 0.55 : 0.25;
      const steps = 8;
      pts.push(new Vector2(0, h));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const x = r * Math.sin((t * Math.PI) / 2);
        const y = h - h * dome * (1 - Math.cos((t * Math.PI) / 2));
        pts.push(new Vector2(x, y));
      }
      pts.push(new Vector2(r, 0), new Vector2(0, 0));
    }
    // LatheGeometry faces point outward when the profile runs bottom → top.
    return new LatheGeometry(pts.reverse(), 28);
  });
}

function recessGeometry(d: number, h: number, drive: "phillips" | "torx" | "hex") {
  return cached(`recess:${d}:${h}:${drive}`, () => {
    const len = d * 0.5;
    const w = d * 0.12;
    if (drive === "phillips") {
      const a = new BoxGeometry(len, 0.05, w);
      const b = new BoxGeometry(w, 0.05, len);
      return mergeGeometries([a, b])!;
    }
    const parts = [];
    const n = drive === "torx" ? 6 : 6;
    for (let i = 0; i < n / 2; i++) {
      const g = new BoxGeometry(len * 0.75, 0.05, w * 1.4);
      g.rotateY((i * Math.PI) / (n / 2));
      parts.push(g);
    }
    return mergeGeometries(parts)!;
  });
}

/**
 * Screw head sitting on y = 0 (the surface it is driven into), +Y up.
 */
export function Screw({
  position,
  rotation,
  diameter = 4.5,
  height = 1.6,
  kind = "pan",
  drive = "phillips",
  material = MAT.steelDark,
}: {
  position?: Vec3;
  rotation?: Vec3;
  diameter?: number;
  height?: number;
  kind?: "pan" | "flat" | "button";
  drive?: "phillips" | "torx" | "hex";
  material?: Material;
}) {
  return (
    <group position={position} rotation={rotation}>
      <mesh geometry={headGeometry(diameter, height, kind)} material={material} castShadow receiveShadow />
      <mesh geometry={recessGeometry(diameter, height, drive)} material={MAT.rubber} position-y={height + 0.005} />
    </group>
  );
}
