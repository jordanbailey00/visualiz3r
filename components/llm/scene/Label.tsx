"use client";

import { Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { Vector3, type Object3D } from "three";

export const FONT_URL = "/fonts/inter-latin-600-normal.woff";
export const FONT_BOLD_URL = "/fonts/inter-latin-700-normal.woff";
export const FONT_MONO_URL = "/fonts/jetbrains-mono-latin-500-normal.woff";

const tmp = new Vector3();

/**
 * Text label in world units that hides itself when the camera is farther than
 * `fadeFar` (keeps the overview readable) or nearer than `fadeNear`.
 */
export function Label({
  text,
  position,
  size = 2,
  color = "#cbd5e1",
  anchorX = "center",
  anchorY = "middle",
  fadeFar = Infinity,
  fadeNear = 0,
  bold = false,
  mono = false,
  maxWidth,
  rotation,
  opacity = 1,
}: {
  text: string;
  position: [number, number, number];
  size?: number;
  color?: string;
  anchorX?: "left" | "center" | "right";
  anchorY?: "top" | "middle" | "bottom";
  fadeFar?: number;
  fadeNear?: number;
  bold?: boolean;
  mono?: boolean;
  maxWidth?: number;
  rotation?: [number, number, number];
  opacity?: number;
}) {
  const ref = useRef<Object3D>(null);
  useFrame(({ camera }) => {
    const o = ref.current;
    if (!o || (fadeFar === Infinity && fadeNear === 0)) return;
    o.getWorldPosition(tmp);
    const d = tmp.distanceTo(camera.position);
    o.visible = d < fadeFar && d > fadeNear;
  });
  return (
    <Text
      ref={ref}
      position={position}
      rotation={rotation}
      fontSize={size}
      color={color}
      anchorX={anchorX}
      anchorY={anchorY}
      font={mono ? FONT_MONO_URL : bold ? FONT_BOLD_URL : FONT_URL}
      maxWidth={maxWidth}
      fillOpacity={opacity}
      outlineWidth={size * 0.06}
      outlineColor="#05070b"
      outlineOpacity={0.8}
    >
      {text}
    </Text>
  );
}
