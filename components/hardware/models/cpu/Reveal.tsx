"use client";

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { Euler, Quaternion, Vector3, type Group, type Object3D } from "three";
import { useExplorer } from "@/lib/hardware/store";
import { explodeProgress } from "../../explode";
import type { Vec3 } from "./layout";

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Eased progress of the exploded view over a sub-range of the slider. */
export function explodeT(range: [number, number]) {
  return smoothstep(range[0], range[1], explodeProgress.value);
}

export interface Pose {
  position: Vec3;
  rotation?: Vec3;
  scale: number;
}

const ZERO: Vec3 = [0, 0, 0];
/** Scale used while hidden: far too small to be hit by a pointer ray. */
const HIDDEN_SCALE = 1e-4;

/**
 * Content that only exists in the exploded view. While the slider is below
 * `range` it is invisible and shrunk to a speck at `hidden` (inside the
 * assembled model, so it never affects camera framing or picking). Over the
 * range it zooms from `from` to `to`: position and rotation interpolate,
 * scale grows geometrically so the magnification feels like a smooth zoom.
 *
 * The <Part> groups inside are kept invisible while hidden, so overlays that
 * consult a part's own `visible` flag (name tags) skip them too; parts the
 * user hid from the tree stay hidden.
 */
export function Reveal({
  range,
  hidden,
  from,
  to,
  arc = 6,
  children,
}: {
  range: [number, number];
  hidden: Vec3;
  from: Pose;
  to: Pose;
  /** Height (mm) of the arc travelled on the way, for a lifting feel. */
  arc?: number;
  children: ReactNode;
}) {
  const ref = useRef<Group>(null);
  const parts = useRef<Object3D[]>([]);
  useLayoutEffect(() => {
    const list: Object3D[] = [];
    ref.current?.traverse((o) => {
      if (o.userData?.partId) list.push(o);
    });
    parts.current = list;
  }, []);
  const k = useMemo(
    () => ({
      p0: new Vector3(...from.position),
      p1: new Vector3(...to.position),
      q0: new Quaternion().setFromEuler(new Euler(...(from.rotation ?? ZERO))),
      q1: new Quaternion().setFromEuler(new Euler(...(to.rotation ?? ZERO))),
      hidden: new Vector3(...hidden),
    }),
    [from, to, hidden],
  );

  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const t = explodeT(range);
    const hiddenIds = useExplorer.getState().hidden;
    for (const o of parts.current) o.visible = t > 1e-4 && !hiddenIds[o.userData.partId as string];
    if (t <= 1e-4) {
      if (g.visible || g.scale.x !== HIDDEN_SCALE) {
        g.visible = false;
        g.position.copy(k.hidden);
        g.scale.setScalar(HIDDEN_SCALE);
      }
      return;
    }
    g.visible = true;
    g.position.lerpVectors(k.p0, k.p1, t);
    // Rise along a gentle arc so the zoom reads as "lifting out" of the chip.
    g.position.y += Math.sin(t * Math.PI) * arc;
    g.quaternion.slerpQuaternions(k.q0, k.q1, t);
    g.scale.setScalar(from.scale * Math.pow(to.scale / from.scale, t));
  });

  return (
    <group ref={ref} position={hidden} scale={HIDDEN_SCALE} visible={false}>
      {children}
    </group>
  );
}

/**
 * Rotation driven by the explode slider over its own range (the dies lift
 * first, then flip, which a single <Part> range cannot express).
 */
export function Spin({ rotate, range, children }: { rotate: Vec3; range: [number, number]; children: ReactNode }) {
  const ref = useRef<Group>(null);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const t = explodeT(range);
    g.rotation.set(rotate[0] * t, rotate[1] * t, rotate[2] * t);
  });
  return <group ref={ref}>{children}</group>;
}

/** Opacity of a material driven by the explode slider (for fading guides). */
export function useExplodeFade(range: [number, number], apply: (t: number) => void) {
  useFrame(() => apply(explodeT(range)));
}
