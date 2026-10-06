"use client";

import { BoxGeometry, PlaneGeometry, type Material, type MeshPhysicalMaterial } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { BallGrid, markingMaterial, type MarkingSpec } from "../../kit/Chip";
import { cached, roundedBox } from "../../kit/geometry";
import { MAT, variant } from "../../kit/materials";

/** Dark glass-epoxy edge of a black circuit board. */
export const laminateEdge = () => variant("ssd-laminate", MAT.fr4, { color: "#3d3f2c", roughness: 0.7 });

type Vec3 = [number, number, number];

const flat = new Map<string, MeshPhysicalMaterial>();

/**
 * The kit's laser-marking material without polygon offset. The kit decals
 * are pulled toward the camera by a slope-scaled depth offset, which at
 * oblique angles is ~0.4 mm — enough to show through the SSD label lying
 * 0.06 mm above the chips. These decals instead float 10 µm above the body.
 */
export function flatMarking(w: number, d: number, spec: MarkingSpec, glossy = false) {
  const key = `${w}:${d}:${JSON.stringify(spec)}:${glossy}`;
  let m = flat.get(key);
  if (!m) {
    m = markingMaterial(w, d, spec, glossy).clone();
    m.polygonOffset = false;
    flat.set(key, m);
  }
  return m;
}

export const DECAL_LIFT = 0.01;

export function decal(w: number, d: number) {
  return cached(`ssd-flat-decal:${w}:${d}`, () => {
    const g = new PlaneGeometry(w, d);
    g.rotateX(-Math.PI / 2);
    return g;
  });
}

/** Tiny QFN/DFN terminals on the package edges (two opposite sides). */
function dfnTerminals(w: number, d: number, pins: number) {
  return cached(`ssd-dfn:${w}:${d}:${pins}`, () => {
    const parts: BoxGeometry[] = [];
    const pitch = (w * 0.8) / pins;
    for (let i = 0; i < pins; i++) {
      const x = -w * 0.4 + pitch * (i + 0.5);
      for (const s of [-1, 1]) {
        const b = new BoxGeometry(pitch * 0.55, 0.1, 0.32);
        b.translate(x, 0.05, s * (d / 2 - 0.14));
        parts.push(b);
      }
    }
    return mergeGeometries(parts)!;
  });
}

/**
 * A moulded package with a flat (offset-free) marking: BGA balls underneath
 * or DFN terminals on two sides. Sits on the board at y = 0.
 */
export function MarkedPackage({
  size,
  position,
  marking,
  standoff = 0.25,
  balls,
  dfnPins,
  body = MAT.epoxy,
}: {
  size: Vec3;
  position?: Vec3;
  marking: MarkingSpec;
  standoff?: number;
  balls?: { pitch: number; hollow?: number };
  dfnPins?: number;
  body?: Material;
}) {
  const [w, h, d] = size;
  const r = Math.min(0.2, h * 0.25);
  const top = standoff + h;
  return (
    <group position={position}>
      <mesh geometry={roundedBox(w, h, d, r)} material={body} position-y={standoff + h / 2} castShadow receiveShadow />
      <mesh geometry={decal(w - 2 * r, d - 2 * r)} material={flatMarking(w - 2 * r, d - 2 * r, marking)} position-y={top + DECAL_LIFT} />
      {balls && <BallGrid w={w} d={d} pitch={balls.pitch} inset={balls.pitch} y={standoff / 2} r={standoff * 0.62} hollow={balls.hollow} />}
      {dfnPins && <mesh geometry={dfnTerminals(w, d, dfnPins)} material={MAT.tin} />}
    </group>
  );
}
