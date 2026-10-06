"use client";

import { Billboard, Text } from "@react-three/drei";
import { useMemo } from "react";
import { CylinderGeometry, MeshBasicMaterial, Quaternion, SphereGeometry, Vector3 } from "three";
import { cached } from "../../kit/geometry";
import { Grow } from "./motion";

type Vec3 = [number, number, number];

/** Local font shipped with the app (troika reads woff directly). */
export const LABEL_FONT = "/fonts/inter-latin-600-normal.woff";

const leaderMat = new MeshBasicMaterial({ color: "#cfe3ff" });
const dotGeo = new SphereGeometry(1, 12, 8);
const UP = new Vector3(0, 1, 0);

/**
 * An annotation for the magnified views: a dot on the feature, a thin leader
 * line and a camera-facing text label. It grows out of the dot over `range`,
 * so it is invisible while the model is assembled. Place it inside the
 * <Part> it describes so hovering the label highlights that part.
 */
export function Callout({
  at,
  label,
  text,
  size = 1.2,
  range,
  align = "left",
}: {
  /** Point on the feature (local coordinates). */
  at: Vec3;
  /** Where the text sits. */
  label: Vec3;
  text: string;
  size?: number;
  range: [number, number];
  align?: "left" | "right";
}) {
  const leader = useMemo(() => {
    const a = new Vector3(...at);
    const b = new Vector3(...label);
    const dir = b.clone().sub(a);
    const len = dir.length();
    return {
      geo: cached("callout-leader", () => new CylinderGeometry(1, 1, 1, 6, 1, true)),
      mid: dir.clone().multiplyScalar(0.5),
      len,
      q: new Quaternion().setFromUnitVectors(UP, dir.normalize()),
      rel: [label[0] - at[0], label[1] - at[1], label[2] - at[2]] as Vec3,
    };
  }, [at, label]);
  const r = size * 0.035;
  return (
    <Grow range={range} position={at}>
      <mesh geometry={dotGeo} material={leaderMat} scale={size * 0.12} />
      <mesh geometry={leader.geo} material={leaderMat} position={leader.mid} quaternion={leader.q} scale={[r, leader.len, r]} />
      <Billboard position={leader.rel}>
        <Text
          font={LABEL_FONT}
          fontSize={size}
          color="#eef4ff"
          anchorX={align}
          anchorY="middle"
          outlineWidth={size * 0.09}
          outlineColor="#060a12"
          maxWidth={size * 18}
          lineHeight={1.15}
          position={[align === "left" ? size * 0.3 : -size * 0.3, 0, 0]}
        >
          {text}
        </Text>
      </Billboard>
    </Grow>
  );
}
