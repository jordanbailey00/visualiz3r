"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { InstancedMesh, Object3D, ShapeGeometry, type Material } from "three";
import { cached } from "../../kit/geometry";
import { lathe, shapeOf, type Pt } from "./geom";
import { HM } from "./materials";

type Vec3 = [number, number, number];

/** Pan head profile [radius, y] for a lathe, base on y = 0. */
function headGeo(d: number, h: number) {
  return cached(`hdd-torx-head:${d}:${h}`, () => {
    const r = d / 2;
    const pts: Pt[] = [
      [0, 0],
      [r, 0],
      [r, h * 0.45],
    ];
    for (let i = 1; i <= 6; i++) {
      const t = i / 6;
      pts.push([r - r * 0.28 * (1 - Math.cos((t * Math.PI) / 2)), h * 0.45 + h * 0.55 * Math.sin((t * Math.PI) / 2)]);
    }
    pts.push([0, h]);
    return lathe(pts, 32);
  });
}

/** Six-lobed Torx recess, drawn as a dark star on the head's crown. */
function recessGeo(d: number, h: number) {
  return cached(`hdd-torx-recess:${d}:${h}`, () => {
    const r0 = d * 0.2;
    const pts: Pt[] = [];
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const r = r0 * (1 + 0.32 * Math.cos(6 * a));
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    const g = new ShapeGeometry(shapeOf(pts));
    // ShapeGeometry faces +Z; turn it to face +Y and sit just above the crown.
    g.rotateX(-Math.PI / 2);
    g.translate(0, h + 0.004, 0);
    return g;
  });
}

const dummy = new Object3D();

/**
 * Many identical Torx pan-head screws in two draw calls. Each point is where
 * the head sits on its surface; heads face +Y unless `down` is set.
 */
export function TorxScrews({
  points,
  d = 4.2,
  h = 1.0,
  material = HM.screw,
  down = false,
}: {
  points: Vec3[];
  d?: number;
  h?: number;
  material?: Material;
  down?: boolean;
}) {
  const heads = useRef<InstancedMesh>(null);
  const recesses = useRef<InstancedMesh>(null);
  const geos = useMemo(() => ({ head: headGeo(d, h), recess: recessGeo(d, h) }), [d, h]);
  useLayoutEffect(() => {
    for (const m of [heads.current, recesses.current]) {
      if (!m) continue;
      points.forEach(([x, y, z], i) => {
        dummy.position.set(x, y, z);
        dummy.rotation.set(down ? Math.PI : 0, (i * 1.37) % (Math.PI * 2), 0);
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
      });
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
      m.computeBoundingBox();
    }
  }, [points, down]);
  if (points.length === 0) return null;
  return (
    <group>
      <instancedMesh ref={heads} args={[geos.head, material, points.length]} castShadow receiveShadow />
      <instancedMesh ref={recesses} args={[geos.recess, HM.hole, points.length]} />
    </group>
  );
}
