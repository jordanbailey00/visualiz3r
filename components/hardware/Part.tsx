"use client";

import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useMemo, useRef, type ReactNode } from "react";
import type { Group } from "three";
import { useExplorer } from "@/lib/hardware/store";
import { explodeProgress } from "./explode";

type Vec3 = [number, number, number];

export interface PartProps {
  /** Key into the device's `parts` content map. Unique within a device. */
  id: string;
  position?: Vec3;
  rotation?: Vec3;
  scale?: number | Vec3;
  /**
   * Displacement (parent space, mm) applied when the view is fully exploded.
   * Nested parts add their own displacement on top of their parent's.
   */
  explode?: Vec3;
  /**
   * Portion of the explode slider over which this part moves, e.g. [0, 0.5]
   * moves early and [0.5, 1] moves late. Defaults to the full range.
   */
  explodeRange?: [number, number];
  /** Extra rotation (radians, XYZ) reached when fully exploded. */
  explodeRotate?: Vec3;
  /** Shells/covers that turn see-through in X-ray mode. */
  cover?: boolean;
  children?: ReactNode;
}

/** Pointer travel (px) above which a click is treated as a drag. */
const DRAG_THRESHOLD = 5;

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * A selectable, explodable piece of hardware. Everything rendered inside it
 * (that is not inside a nested Part) belongs to it for hovering, selection,
 * focus mode and X-ray.
 */
export function Part({
  id,
  position,
  rotation,
  scale,
  explode,
  explodeRange,
  explodeRotate,
  cover,
  children,
}: PartProps) {
  const ref = useRef<Group>(null);
  const userData = useMemo(() => ({ partId: id, cover: !!cover }), [id, cover]);
  const base = position ?? ZERO;

  const baseRot = rotation ?? ZERO;

  useFrame(() => {
    const g = ref.current;
    if (!g || (!explode && !explodeRotate)) return;
    const range = explodeRange ?? FULL;
    const t = smoothstep(range[0], range[1], explodeProgress.value);
    if (explode) {
      g.position.set(base[0] + explode[0] * t, base[1] + explode[1] * t, base[2] + explode[2] * t);
    }
    if (explodeRotate) {
      g.rotation.set(
        baseRot[0] + explodeRotate[0] * t,
        baseRot[1] + explodeRotate[1] * t,
        baseRot[2] + explodeRotate[2] * t,
      );
    }
  });

  const onOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    useExplorer.getState().hover(id);
  };
  const onOut = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (useExplorer.getState().hoveredId === id) useExplorer.getState().hover(null);
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > DRAG_THRESHOLD) return;
    // Selecting leaves the camera alone; double-click (or F) flies to the part.
    useExplorer.getState().select(id);
  };
  const onDoubleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    useExplorer.getState().select(id, "focus");
  };

  return (
    <group
      ref={ref}
      position={base}
      rotation={rotation}
      scale={scale}
      userData={userData}
      onPointerOver={onOver}
      onPointerOut={onOut}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      {children}
    </group>
  );
}

const ZERO: Vec3 = [0, 0, 0];
const FULL: [number, number] = [0, 1];
