"use client";

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { BufferAttribute, BufferGeometry, LineBasicMaterial, LineSegments, Vector3, type Object3D } from "three";
import { ease } from "./motion";

type Vec3 = [number, number, number];

/** Named empty objects whose world positions the guides follow. */
const anchors = new Map<string, Object3D>();

/** An invisible marker registered under `name` (place it inside any moving frame). */
export function Anchor({ name, position }: { name: string; position: Vec3 }) {
  const ref = useRef<Object3D>(null);
  useLayoutEffect(() => {
    const o = ref.current;
    if (!o) return;
    anchors.set(name, o);
    return () => {
      if (anchors.get(name) === o) anchors.delete(name);
    };
  }, [name]);
  return <object3D ref={ref} position={position} />;
}

const tmp = new Vector3();
const noRaycast = () => {};

/**
 * Faint lines joining the corners of a feature to the corners of its
 * magnified view — the "zoom cone" of a technical illustration. `from` and
 * `to` are lists of anchor names (same length). The lines fade in over
 * `range` of the explode slider and are never pickable.
 */
export function ZoomGuide({ from, to, range, color = "#9cc4ff" }: { from: string[]; to: string[]; range: [number, number]; color?: string }) {
  const ref = useRef<LineSegments>(null);
  const { geo, mat } = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(from.length * 6), 3));
    const m = new LineBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false });
    return { geo: g, mat: m };
  }, [from.length, color]);
  useFrame(() => {
    const line = ref.current;
    if (!line) return;
    const t = ease(range);
    line.visible = t > 0.01;
    if (!line.visible) return;
    mat.opacity = 0.45 * t;
    const pos = geo.getAttribute("position") as BufferAttribute;
    line.updateWorldMatrix(true, false);
    const inv = line.matrixWorld.clone().invert();
    for (let i = 0; i < from.length; i++) {
      const a = anchors.get(from[i]);
      const b = anchors.get(to[i]);
      if (!a || !b) return;
      a.getWorldPosition(tmp).applyMatrix4(inv);
      pos.setXYZ(i * 2, tmp.x, tmp.y, tmp.z);
      b.getWorldPosition(tmp).applyMatrix4(inv);
      pos.setXYZ(i * 2 + 1, tmp.x, tmp.y, tmp.z);
    }
    pos.needsUpdate = true;
    geo.computeBoundingSphere();
  });
  return <lineSegments ref={ref} geometry={geo} material={mat} raycast={noRaycast} frustumCulled={false} renderOrder={2} />;
}
