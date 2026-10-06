"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import {
  BoxGeometry,
  CurvePath,
  InstancedMesh,
  LineCurve3,
  Object3D,
  QuadraticBezierCurve3,
  SphereGeometry,
  TubeGeometry,
  Vector3,
  type Material,
} from "three";
import { cached } from "./geometry";
import { MAT } from "./materials";

type Vec3 = [number, number, number];

const dummy = new Object3D();

/**
 * A stack of thin heatsink fins (one draw call). Fins are plates in the YZ
 * plane, repeated along X starting at `from` with the given pitch.
 */
export function FinStack({
  count,
  pitch = 1.8,
  thickness = 0.35,
  height,
  depth,
  position,
  material = MAT.fin,
  skip,
}: {
  count: number;
  pitch?: number;
  thickness?: number;
  /** Fin height (Y). */
  height: number;
  /** Fin depth (Z). */
  depth: number;
  position?: Vec3;
  material?: Material;
  /** Return true to leave a gap at fin i (e.g. for a pipe bend or screw). */
  skip?: (i: number) => boolean;
}) {
  const ref = useRef<InstancedMesh>(null);
  const geo = cached(`fin:${thickness}:${height}:${depth}`, () => {
    const g = new BoxGeometry(thickness, height, depth);
    g.translate(0, height / 2, 0);
    return g;
  });
  const indices = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < count; i++) if (!skip?.(i)) out.push(i);
    return out;
  }, [count, skip]);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const x0 = -((count - 1) * pitch) / 2;
    indices.forEach((i, k) => {
      dummy.position.set(x0 + i * pitch, 0, 0);
      dummy.updateMatrix();
      m.setMatrixAt(k, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
    m.computeBoundingBox();
  }, [indices, count, pitch]);
  return (
    <group position={position}>
      <instancedMesh ref={ref} args={[geo, material, indices.length]} castShadow receiveShadow />
    </group>
  );
}

/**
 * Smooth path through `points` with corners rounded to `bend` radius —
 * the way a heat pipe is bent on a mandrel.
 */
export function bentPath(points: Vec3[], bend: number) {
  const path = new CurvePath<Vector3>();
  const P = points.map((p) => new Vector3(...p));
  let cur = P[0].clone();
  for (let i = 1; i < P.length - 1; i++) {
    const a = P[i - 1];
    const b = P[i];
    const c = P[i + 1];
    const inDir = b.clone().sub(a).normalize();
    const outDir = c.clone().sub(b).normalize();
    const r = Math.min(bend, b.distanceTo(a) / 2, b.distanceTo(c) / 2);
    const p1 = b.clone().addScaledVector(inDir, -r);
    const p2 = b.clone().addScaledVector(outDir, r);
    if (cur.distanceTo(p1) > 1e-4) path.add(new LineCurve3(cur.clone(), p1));
    path.add(new QuadraticBezierCurve3(p1, b.clone(), p2));
    cur = p2;
  }
  path.add(new LineCurve3(cur, P[P.length - 1].clone()));
  return path;
}

const tipGeo = new SphereGeometry(1, 16, 10);

/** Nickel-plated copper heat pipe along a bent path, with sealed ends. */
export function HeatPipe({
  points,
  radius = 3,
  bend = 9,
  material = MAT.nickel,
}: {
  points: Vec3[];
  radius?: number;
  bend?: number;
  material?: Material;
}) {
  const geo = useMemo(() => {
    const path = bentPath(points, bend);
    const len = path.getLength();
    return new TubeGeometry(path, Math.max(24, Math.round(len / 2)), radius, 18, false);
  }, [points, radius, bend]);
  const a = points[0];
  const b = points[points.length - 1];
  return (
    <group>
      <mesh geometry={geo} material={material} castShadow receiveShadow />
      <mesh geometry={tipGeo} material={material} position={a} scale={radius} />
      <mesh geometry={tipGeo} material={material} position={b} scale={[radius, radius, radius]} />
    </group>
  );
}
