"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, type ReactNode } from "react";
import type { Group } from "three";
import { isWithin, useExplorer } from "@/lib/hardware/store";
import { explodeProgress } from "../explode";
import { partObjects } from "../sceneState";

type Vec3 = [number, number, number];

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Grows its children out of `from` (world mm) as the explode slider passes
 * through `range`; hidden otherwise. Children are authored at full size in
 * world coordinates. `partIds` are kept invisible while collapsed so labels,
 * outlines and picking ignore them.
 */
export function Reveal({
  from,
  range = [0.8, 1],
  partIds = [],
  children,
}: {
  from: Vec3;
  range?: [number, number];
  partIds?: string[];
  children: ReactNode;
}) {
  const ref = useRef<Group>(null);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const t = smoothstep(range[0], range[1], explodeProgress.value);
    const s = Math.max(t, 1e-3);
    g.scale.setScalar(s);
    g.position.set(from[0] * (1 - s), from[1] * (1 - s), from[2] * (1 - s));
    const show = t > 0.002;
    g.visible = show;
    const hidden = useExplorer.getState().hidden;
    for (const id of partIds) {
      const o = partObjects.get(id);
      if (o) o.visible = show && !hidden[id];
    }
  });
  return (
    <group ref={ref} scale={1e-3} position={from} visible={false}>
      {children}
    </group>
  );
}

/**
 * When a part inside `rootId` is selected while the model is assembled, open
 * the exploded view first, then fly to the part once it has grown in.
 */
export function useAutoExplode(rootId: string) {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = useExplorer.subscribe((s, prev) => {
      if (!s.selectedId || s.selectedId === prev.selectedId) return;
      const inside = !!s.nodes[rootId] && isWithin(s.nodes, s.selectedId, rootId);
      if (!inside || s.explode >= 0.98) return;
      const id = s.selectedId;
      useExplorer.getState().setExplode(1);
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (useExplorer.getState().selectedId === id) useExplorer.getState().focusPart(id);
      }, 1600);
    });
    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, [rootId]);
}
