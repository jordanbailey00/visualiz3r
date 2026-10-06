"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import {
  BoxGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  InstancedMesh,
  Object3D,
  Path,
  Shape,
  type Material,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { cached, roundedBox } from "./geometry";
import { MAT, emissive } from "./materials";

type Vec3 = [number, number, number];
type Pt = [number, number];

/**
 * Port convention: opening faces +Z at z = 0, body extends to z = −depth,
 * bottom of the shell at y = 0, centred on x = 0.
 */

function outlineShape(pts: Pt[]) {
  const s = new Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) s.lineTo(p[0], p[1]);
  s.closePath();
  return s;
}

function outlinePath(pts: Pt[]) {
  const s = new Path();
  s.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) s.lineTo(p[0], p[1]);
  s.closePath();
  return s;
}

/** Inset a convex polygon toward its centroid by roughly `t`. */
function inset(pts: Pt[], t: number): Pt[] {
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  return pts.map(([x, y]) => {
    const dx = x - cx;
    const dy = y - cy;
    return [x - Math.sign(dx) * Math.min(Math.abs(dx), t), y - Math.sign(dy) * Math.min(Math.abs(dy), t)];
  });
}

/** Hollow metal shell with the given cross-section, open at the front. */
function shellGeometry(key: string, pts: Pt[], wall: number, depth: number) {
  return cached(`shell:${key}:${wall}:${depth}`, () => {
    const outer = outlineShape(pts);
    outer.holes.push(outlinePath(inset(pts, wall).reverse()));
    const g = new ExtrudeGeometry(outer, { depth, bevelEnabled: false });
    g.translate(0, 0, -depth);
    return g;
  });
}

function solidGeometry(key: string, pts: Pt[], depth: number) {
  return cached(`solid:${key}:${depth}`, () => {
    const g = new ExtrudeGeometry(outlineShape(pts), { depth, bevelEnabled: false });
    g.translate(0, 0, -depth);
    return g;
  });
}

function Port({
  pts,
  keyName,
  depth,
  wall = 0.3,
  tongue,
  tongueMat = MAT.plasticBlack,
  shellMat = MAT.steel,
  position,
  rotation,
}: {
  pts: Pt[];
  keyName: string;
  depth: number;
  wall?: number;
  tongue?: [w: number, h: number, y: number];
  tongueMat?: Material;
  shellMat?: Material;
  position?: Vec3;
  rotation?: Vec3;
}) {
  const inner = inset(pts, wall);
  return (
    <group position={position} rotation={rotation}>
      <mesh geometry={shellGeometry(keyName, pts, wall, depth)} material={shellMat} castShadow receiveShadow />
      {/* dark cavity back wall */}
      <mesh geometry={solidGeometry(`${keyName}-back`, inner, 0.4)} material={MAT.plasticBlack} position-z={-depth + 0.6} />
      {tongue && (
        <mesh
          geometry={cached(`tongue:${keyName}`, () => {
            const g = new BoxGeometry(tongue[0], tongue[1], depth - 1.2);
            g.translate(0, 0, -(depth - 1.2) / 2 - 0.9);
            return g;
          })}
          material={tongueMat}
          position-y={tongue[2]}
        />
      )}
      {tongue && (
        <mesh
          geometry={cached(`tongue-pins:${keyName}`, () => {
            const n = Math.max(4, Math.round(tongue[0] / 0.6));
            const parts = [];
            for (let i = 0; i < n; i++) {
              const b = new BoxGeometry(tongue[0] / n - 0.18, 0.04, depth * 0.45);
              b.translate(-tongue[0] / 2 + (tongue[0] / n) * (i + 0.5), tongue[1] / 2 + 0.02, -depth * 0.3);
              parts.push(b);
            }
            return mergeGeometries(parts)!;
          })}
          material={MAT.gold}
          position-y={tongue[2]}
        />
      )}
    </group>
  );
}

/** Full-size DisplayPort receptacle (one chamfered corner). */
export function DisplayPort({ position, rotation }: { position?: Vec3; rotation?: Vec3 }) {
  const w = 16.6;
  const h = 5.3;
  const c = 1.6;
  const pts: Pt[] = [
    [-w / 2, 0],
    [w / 2 - c, 0],
    [w / 2, c],
    [w / 2, h],
    [-w / 2, h],
  ];
  return <Port pts={pts} keyName="dp" depth={14} tongue={[w - 4.5, 1.1, h / 2]} position={position} rotation={rotation} />;
}

/** Full-size HDMI receptacle (trapezoidal). */
export function Hdmi({ position, rotation, micro = false }: { position?: Vec3; rotation?: Vec3; micro?: boolean }) {
  const w = micro ? 7.2 : 15.2;
  const h = micro ? 3.0 : 5.9;
  const c = micro ? 1.0 : 1.9;
  const pts: Pt[] = [
    [-w / 2 + c, 0],
    [w / 2 - c, 0],
    [w / 2, c * 0.8],
    [w / 2, h],
    [-w / 2, h],
    [-w / 2, c * 0.8],
  ];
  return (
    <Port
      pts={pts}
      keyName={micro ? "uhdmi" : "hdmi"}
      depth={micro ? 7.5 : 11.5}
      tongue={[w - (micro ? 2.4 : 4.2), micro ? 0.55 : 1.0, h * 0.55]}
      position={position}
      rotation={rotation}
    />
  );
}

/** USB Type-C receptacle (stadium shaped). */
export function UsbC({ position, rotation }: { position?: Vec3; rotation?: Vec3 }) {
  const w = 8.94;
  const h = 3.26;
  const r = h / 2;
  const pts: Pt[] = [];
  for (let i = 0; i <= 10; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / 10;
    pts.push([w / 2 - r + r * Math.cos(a), r + r * Math.sin(a)]);
  }
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI / 2 + (Math.PI * i) / 10;
    pts.push([-w / 2 + r + r * Math.cos(a), r + r * Math.sin(a)]);
  }
  return <Port pts={pts} keyName="usbc" depth={7.4} wall={0.25} tongue={[5.6, 0.7, h / 2]} position={position} rotation={rotation} />;
}

/**
 * USB Type-A receptacle. `stacked` builds a double-decker; `usb3` gives the
 * blue tongue of SuperSpeed ports.
 */
export function UsbA({
  position,
  rotation,
  stacked = false,
  usb3 = false,
  depth = 14,
}: {
  position?: Vec3;
  rotation?: Vec3;
  stacked?: boolean;
  usb3?: boolean;
  depth?: number;
}) {
  const w = 13.1;
  const h = 5.7;
  const pts: Pt[] = [
    [-w / 2, 0],
    [w / 2, 0],
    [w / 2, h],
    [-w / 2, h],
  ];
  const tongueMat = usb3 ? MAT.plasticBlue : MAT.plasticBlack;
  const levels = stacked ? [0.4, h + 2.1] : [0];
  return (
    <group position={position} rotation={rotation}>
      {stacked && (
        <mesh
          geometry={roundedBox(w + 1.2, 2 * h + 3.2, depth, 0.4)}
          material={MAT.steel}
          position={[0, h + 1.6, -depth / 2 - 0.05]}
          castShadow
          receiveShadow
        />
      )}
      {levels.map((y, i) => (
        <Port
          key={i}
          pts={pts}
          keyName="usba"
          depth={depth}
          wall={0.35}
          tongue={[w - 2.4, 1.6, h * 0.62]}
          tongueMat={tongueMat}
          position={[0, y, stacked ? 0.05 : 0]}
        />
      ))}
    </group>
  );
}

/** Gigabit Ethernet RJ45 jack with integrated magnetics and link LEDs. */
export function Rj45({ position, rotation, depth = 21 }: { position?: Vec3; rotation?: Vec3; depth?: number }) {
  const w = 15.9;
  const h = 13.4;
  // Opening outline (with the latch notch at the bottom).
  const ow = 11.7;
  const oh = 7.0;
  const opening: Pt[] = [
    [-ow / 2, 2.2],
    [-2.2, 2.2],
    [-2.2, 0.8],
    [2.2, 0.8],
    [2.2, 2.2],
    [ow / 2, 2.2],
    [ow / 2, 2.2 + oh],
    [-ow / 2, 2.2 + oh],
  ];
  const body = useMemo(
    () =>
      cached("rj45-body", () => {
        const outer = outlineShape([
          [-w / 2, 0],
          [w / 2, 0],
          [w / 2, h],
          [-w / 2, h],
        ]);
        outer.holes.push(outlinePath([...opening].reverse()));
        const g = new ExtrudeGeometry(outer, { depth: 1.2, bevelEnabled: false });
        g.translate(0, 0, -1.2);
        return g;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  return (
    <group position={position} rotation={rotation}>
      {/* stamped shield */}
      <mesh geometry={roundedBox(w, h, depth - 1.2, 0.5)} material={MAT.steel} position={[0, h / 2, -depth / 2 - 0.6]} castShadow receiveShadow />
      {/* face with opening */}
      <mesh geometry={body} material={MAT.steel} castShadow />
      {/* plastic cavity */}
      <mesh geometry={solidGeometry("rj45-cav", inset(opening, 0.05), 0.6)} material={MAT.plasticBlack} position-z={-9} />
      {/* contact fingers */}
      <mesh
        geometry={cached("rj45-pins", () => {
          const parts = [];
          for (let i = 0; i < 8; i++) {
            const b = new BoxGeometry(0.35, 0.3, 6);
            b.rotateX(0.5);
            b.translate(-3.6 + i * 1.02, 2.2 + oh - 1.4, -5);
            parts.push(b);
          }
          return mergeGeometries(parts)!;
        })}
        material={MAT.gold}
      />
      {/* link / activity LEDs */}
      <mesh geometry={roundedBox(2.6, 1.4, 0.4, 0.2)} material={emissive("#7dff6a", 2.2)} position={[-w / 2 + 2.2, h - 1.6, 0.05]} />
      <mesh geometry={roundedBox(2.6, 1.4, 0.4, 0.2)} material={emissive("#ffb547", 2.2)} position={[w / 2 - 2.2, h - 1.6, 0.05]} />
    </group>
  );
}

const dummy = new Object3D();

/**
 * Pin header: plastic base with square gold pins. Origin at the board,
 * centred on the pin field; pins stand along +Y.
 */
export function PinHeader({
  cols,
  rows = 2,
  pitch = 2.54,
  pinLength = 8.5,
  baseHeight = 2.5,
  position,
  rotation,
  baseMaterial = MAT.plasticBlack,
  pinMaterial = MAT.gold,
}: {
  cols: number;
  rows?: number;
  pitch?: number;
  pinLength?: number;
  baseHeight?: number;
  position?: Vec3;
  rotation?: Vec3;
  baseMaterial?: Material;
  pinMaterial?: Material;
}) {
  const ref = useRef<InstancedMesh>(null);
  const n = cols * rows;
  const pinGeo = cached(`pin:${pitch}:${pinLength}`, () => {
    const s = pitch * 0.25;
    const g = new BoxGeometry(s, pinLength, s);
    g.translate(0, pinLength / 2, 0);
    return g;
  });
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    let k = 0;
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        dummy.position.set((i - (cols - 1) / 2) * pitch, 0, (j - (rows - 1) / 2) * pitch);
        dummy.updateMatrix();
        m.setMatrixAt(k++, dummy.matrix);
      }
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [cols, rows, pitch]);
  return (
    <group position={position} rotation={rotation}>
      <mesh
        geometry={roundedBox(cols * pitch, baseHeight, rows * pitch, 0.25)}
        material={baseMaterial}
        position-y={baseHeight / 2}
        castShadow
        receiveShadow
      />
      <instancedMesh ref={ref} args={[pinGeo, pinMaterial, n]} castShadow />
    </group>
  );
}

/**
 * Small wire-to-board header (JST/Molex style) in natural or white nylon:
 * a walled shroud with pins inside. Opening faces +Y.
 */
export function WireHeader({
  pins = 4,
  pitch = 1.25,
  position,
  rotation,
  material = MAT.plasticWhite,
}: {
  pins?: number;
  pitch?: number;
  position?: Vec3;
  rotation?: Vec3;
  material?: Material;
}) {
  const w = pins * pitch + 1.6;
  const d = 3.6;
  const h = 4;
  const geo = useMemo(
    () =>
      cached(`wirehdr:${pins}:${pitch}`, () => {
        const outer = outlineShape([
          [-w / 2, -d / 2],
          [w / 2, -d / 2],
          [w / 2, d / 2],
          [-w / 2, d / 2],
        ]);
        outer.holes.push(
          outlinePath(
            [
              [-w / 2 + 0.5, -d / 2 + 0.5],
              [w / 2 - 0.5, -d / 2 + 0.5],
              [w / 2 - 0.5, d / 2 - 0.5],
              [-w / 2 + 0.5, d / 2 - 0.5],
            ].reverse() as Pt[],
          ),
        );
        const g = new ExtrudeGeometry(outer, { depth: h, bevelEnabled: false });
        g.rotateX(-Math.PI / 2);
        return g;
      }),
    [pins, pitch, w, d, h],
  );
  return (
    <group position={position} rotation={rotation}>
      <mesh geometry={geo} material={material} castShadow receiveShadow />
      <mesh geometry={roundedBox(w - 0.9, 0.6, d - 0.9, 0.1)} material={material} position-y={0.3} />
      <mesh
        geometry={cached(`wirehdr-pins:${pins}:${pitch}`, () => {
          const parts = [];
          for (let i = 0; i < pins; i++) {
            const b = new BoxGeometry(0.3, 3.2, 0.3);
            b.translate((i - (pins - 1) / 2) * pitch, 1.6, 0);
            parts.push(b);
          }
          return mergeGeometries(parts)!;
        })}
        material={MAT.tin}
      />
    </group>
  );
}

/**
 * 12V-2x6 (16-pin) GPU power connector: 2×6 power pins plus 4 sense pins in
 * a black housing. Opening faces +Z.
 */
export function Power16Pin({ position, rotation }: { position?: Vec3; rotation?: Vec3 }) {
  const w = 18.9;
  const h = 7.9;
  const d = 10;
  const cavities = useMemo(
    () =>
      cached("p16-cav", () => {
        const parts = [];
        for (let r = 0; r < 2; r++)
          for (let i = 0; i < 6; i++) {
            const b = new BoxGeometry(2.4, 2.4, 0.6);
            b.translate((i - 2.5) * 3.0, 2.6 + r * 3.0, 0.02);
            parts.push(b);
          }
        for (let i = 0; i < 4; i++) {
          const b = new BoxGeometry(1.1, 1.1, 0.6);
          b.translate((i - 1.5) * 3.0, 0.75, 0.02);
          parts.push(b);
        }
        return mergeGeometries(parts)!;
      }),
    [],
  );
  return (
    <group position={position} rotation={rotation}>
      <mesh geometry={roundedBox(w, h, d, 0.4)} material={MAT.plasticBlack} position={[0, h / 2, -d / 2]} castShadow receiveShadow />
      <mesh geometry={cavities} material={MAT.rubber} />
      {/* latch */}
      <mesh geometry={roundedBox(4.5, 1.2, 4, 0.3)} material={MAT.plasticBlack} position={[0, h + 0.6, -2.2]} />
    </group>
  );
}

/** Flat flex cable (FFC/FPC) connector with a hinged locking actuator. Opening faces +Z. */
export function FfcConnector({
  width = 17,
  position,
  rotation,
  latch = "#1a1a1a",
}: {
  width?: number;
  position?: Vec3;
  rotation?: Vec3;
  latch?: string;
}) {
  return (
    <group position={position} rotation={rotation}>
      <mesh geometry={roundedBox(width, 1.6, 4.2, 0.2)} material={MAT.nylon} position={[0, 0.8, -2.1]} castShadow receiveShadow />
      <mesh geometry={roundedBox(width - 1.5, 0.7, 1.6, 0.2)} material={latch === "#1a1a1a" ? MAT.plasticBlack : MAT.plasticWhite} position={[0, 1.9, -0.6]} castShadow />
      <mesh
        geometry={cached(`ffc-pins:${width}`, () => {
          const parts = [];
          const n = Math.round((width - 3) / 0.5);
          for (let i = 0; i < n; i++) {
            const b = new BoxGeometry(0.18, 0.15, 1.2);
            b.translate(-((n - 1) * 0.5) / 2 + i * 0.5, 0.08, -4.6);
            parts.push(b);
          }
          return mergeGeometries(parts)!;
        })}
        material={MAT.tin}
      />
    </group>
  );
}

/** Cylindrical standoff / spacer. */
export function Standoff({ height, radius = 2.5, position, hex = true }: { height: number; radius?: number; position?: Vec3; hex?: boolean }) {
  const geo = cached(`standoff:${height}:${radius}:${hex}`, () => {
    const g = new CylinderGeometry(radius, radius, height, hex ? 6 : 24);
    g.translate(0, height / 2, 0);
    return g;
  });
  return <mesh geometry={geo} material={MAT.steel} position={position} castShadow receiveShadow />;
}
