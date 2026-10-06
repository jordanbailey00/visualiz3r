"use client";

import { useFrame } from "@react-three/fiber";
import { useRef, type ReactNode } from "react";
import type { Group } from "three";
import { useExplorer } from "@/lib/hardware/store";
import { explodeProgress } from "../../explode";
import { partObjects } from "../../sceneState";

type Vec3 = [number, number, number];

/** Same easing as <Part> so custom motions stay in step with it. */
export function ease(range: [number, number], x = explodeProgress.value) {
  const t = Math.min(1, Math.max(0, (x - range[0]) / (range[1] - range[0])));
  return t * t * (3 - 2 * t);
}

export interface Stage {
  /** Slice of the explode slider over which this stage plays. */
  range: [number, number];
  /** Translation added by this stage (parent space). */
  move?: Vec3;
  /** Euler rotation (radians) added by this stage. */
  rotate?: Vec3;
}

/**
 * A group that follows several explode stages in sequence — e.g. slide a card
 * out of its socket, *then* lift it. `<Part explode>` only supports a single
 * straight move; stages add up, so a later stage can undo an earlier tilt.
 * Rotation happens about the group's origin (its `position`).
 */
export function Stages({
  stages,
  position,
  rotation,
  children,
}: {
  stages: Stage[];
  position?: Vec3;
  rotation?: Vec3;
  children?: ReactNode;
}) {
  const ref = useRef<Group>(null);
  const p0 = position ?? [0, 0, 0];
  const r0 = rotation ?? [0, 0, 0];
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    let px = p0[0];
    let py = p0[1];
    let pz = p0[2];
    let rx = r0[0];
    let ry = r0[1];
    let rz = r0[2];
    for (const s of stages) {
      const t = ease(s.range);
      if (t === 0) continue;
      if (s.move) {
        px += s.move[0] * t;
        py += s.move[1] * t;
        pz += s.move[2] * t;
      }
      if (s.rotate) {
        rx += s.rotate[0] * t;
        ry += s.rotate[1] * t;
        rz += s.rotate[2] * t;
      }
    }
    g.position.set(px, py, pz);
    g.rotation.set(rx, ry, rz);
  });
  return (
    <group ref={ref} position={p0} rotation={r0}>
      {children}
    </group>
  );
}

/**
 * Scales its children from `from` to `to` over `range` of the explode slider —
 * used for the magnified "deep dive" views that grow out of a chip. While
 * fully collapsed the group is hidden so it costs nothing and can't be hit.
 */
export function Grow({
  range,
  from = 0,
  to = 1,
  position,
  children,
}: {
  range: [number, number];
  from?: number;
  to?: number;
  position?: Vec3;
  children?: ReactNode;
}) {
  const ref = useRef<Group>(null);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const t = ease(range);
    const s = Math.max(1e-4, from + (to - from) * t);
    g.scale.setScalar(s);
    g.visible = s > 2e-3;
  });
  const s0 = Math.max(1e-4, from);
  return (
    <group ref={ref} position={position} scale={s0} visible={s0 > 2e-3}>
      {children}
    </group>
  );
}

/**
 * Like the kit's `Reveal`: grows children (authored at full size in world
 * coordinates) out of `from` over `range`, and keeps `partIds` invisible
 * while collapsed. The difference: while fully collapsed the group waits at
 * `park` — a point inside the assembled device — because the camera's home
 * framing measures every object, visible or not, and a view parked at its
 * exploded `from` point in mid-air would shrink the assembled shot.
 */
export function ParkedReveal({
  from,
  park,
  range,
  partIds = [],
  children,
}: {
  from: Vec3;
  park: Vec3;
  range: [number, number];
  partIds?: string[];
  children?: ReactNode;
}) {
  const ref = useRef<Group>(null);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const t = ease(range);
    const s = Math.max(t, 1e-3);
    const p = t > 0 ? from : park;
    g.scale.setScalar(s);
    g.position.set(p[0] * (1 - s), p[1] * (1 - s), p[2] * (1 - s));
    const show = t > 0.002;
    g.visible = show;
    const hidden = useExplorer.getState().hidden;
    for (const id of partIds) {
      const o = partObjects.get(id);
      if (o) o.visible = show && !hidden[id];
    }
  });
  return (
    <group ref={ref} scale={1e-3} position={park} visible={false}>
      {children}
    </group>
  );
}
