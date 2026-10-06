"use client";

import { useLayoutEffect, useRef } from "react";
import type { BufferGeometry, InstancedMesh, Material, Matrix4 } from "three";

/**
 * Many copies of one geometry in a single draw call. Instance transforms are
 * written whenever `matrices` changes (pass a memoised array).
 */
export function Instances({
  geometry,
  material,
  matrices,
  shadows = true,
}: {
  geometry: BufferGeometry;
  material: Material | Material[];
  matrices: Matrix4[];
  shadows?: boolean;
}) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    matrices.forEach((mx, i) => m.setMatrixAt(i, mx));
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
    m.computeBoundingBox();
  }, [matrices]);
  return <instancedMesh ref={ref} args={[geometry, material, matrices.length]} castShadow={shadows} receiveShadow />;
}
