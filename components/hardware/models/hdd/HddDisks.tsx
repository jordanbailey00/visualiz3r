"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type ReactNode } from "react";
import { CylinderGeometry, Matrix4, type Group } from "three";
import { useExplorer } from "@/lib/hardware/store";
import { explodeProgress } from "../../explode";
import { Part } from "../../Part";
import { cached, roundedBox } from "../../kit/geometry";
import { TorxScrews } from "./Screws";
import { crease, lathe, merge, placed, polarAnnulus, shapeOf, slab, type Pt } from "./geom";
import { CLAMP, DISK, HUB, SPACER, Y, diskBottom, diskTop } from "./layout";
import { HM } from "./materials";

/** Spin speed while animating: slow enough to see (a real drive turns 120 times a second). */
export const SPIN_RPS = 1.1;

export function smooth(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Rotates its children about the spindle axis while the explorer animates. */
export function Spinner({ children }: { children: ReactNode }) {
  const ref = useRef<Group>(null);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g || !useExplorer.getState().animate) return;
    // Counter-clockwise seen from above, as in real drives.
    g.rotation.y += Math.min(dt, 0.1) * SPIN_RPS * Math.PI * 2;
  });
  return <group ref={ref}>{children}</group>;
}

// ---------------------------------------------------------------------------
// Spindle motor
// ---------------------------------------------------------------------------

/** Motor base: flange pressed into the floor bore, stator post and fixed shaft. */
export function MotorBase() {
  const geo = useMemo(
    () =>
      cached("hdd-motor-base", () =>
        lathe(
          [
            [0, 0.4],
            [16.6, 0.4],
            [16.95, 0.75],
            [16.95, Y.floor - 0.05],
            [17.7, Y.floor - 0.05],
            [17.7, Y.floor + 0.35],
            [16.1, Y.floor + 0.4],
            [10.4, Y.floor + 0.4],
            [10.4, Y.floor + 0.9],
            [5.4, Y.floor + 0.9],
            [5.4, 8.3],
            [2.0, 8.3],
            [2.0, HUB.top - 0.1],
            [1.7, HUB.top],
            [0, HUB.top],
          ],
          72,
        ),
      ),
    [],
  );
  return (
    <group>
      <mesh geometry={geo} material={HM.hub} castShadow receiveShadow />
      {/* threaded hole in the top of the fixed shaft for the cover screw */}
      <mesh geometry={cached("hdd-shaft-hole", () => crease(new CylinderGeometry(0.95, 0.95, 0.05, 20)))} material={HM.hole} position-y={HUB.top + 0.02} />
    </group>
  );
}

/** Nine-slot stator: laminated steel star with a copper coil on every tooth. */
export function Stator() {
  const { core, coils } = useMemo(() => {
    const teeth = 9;
    const core = cached("hdd-stator-core", () => {
      const pts: Pt[] = [];
      const n = teeth * 24;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const local = ((a / (Math.PI * 2)) * teeth) % 1; // 0…1 across one tooth pitch
        const d = Math.abs(local - 0.5);
        const r = d < 0.4 ? 9.15 : 6.1;
        pts.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
      const hole: Pt[] = [];
      for (let i = 0; i < 40; i++) {
        const a = -(i / 40) * Math.PI * 2;
        hole.push([Math.cos(a) * 5.0, Math.sin(a) * 5.0]);
      }
      return slab(shapeOf(pts, [hole]), 8.3, 12.7, 0.15);
    });
    const coils = cached("hdd-stator-coils", () => {
      // Each tooth carries a rounded bundle of enamelled wire that bulges above
      // and below the lamination stack.
      const one = roundedBox(2.7, 5.5, 3.1, 0.95, 3);
      const parts = [];
      for (let k = 0; k < teeth; k++) {
        const a = ((k + 0.5) / teeth) * Math.PI * 2;
        const m = new Matrix4().makeRotationY(-a).setPosition(Math.cos(a) * 7.55, 10.5, Math.sin(a) * 7.55);
        parts.push(placed(one, m));
      }
      return merge(parts);
    });
    return { core, coils };
  }, []);
  return (
    <group>
      <mesh geometry={core} material={HM.lamination} castShadow receiveShadow />
      <mesh geometry={coils} material={HM.enamel} castShadow receiveShadow />
    </group>
  );
}

/** Rotor: the hub the disks sit on, with the ring magnet on its inside. */
export function Hub() {
  const { hub, magnet } = useMemo(
    () => ({
      hub: cached("hdd-hub", () =>
        lathe(
          [
            [11.0, HUB.flangeBottom],
            [15.3, HUB.flangeBottom],
            [HUB.flangeR, HUB.flangeBottom + 0.3],
            [HUB.flangeR, DISK.bottom],
            [HUB.r + 0.05, DISK.bottom],
            [HUB.r, DISK.bottom + 0.1],
            [HUB.r, HUB.top - 0.3],
            [HUB.r - 0.3, HUB.top],
            [2.6, HUB.top],
            [2.6, 14.0],
            [4.3, 14.0],
            [4.3, HUB.top - 1.8],
            [11.0, HUB.top - 1.8],
          ],
          96,
        ),
      ),
      magnet: cached("hdd-rotor-magnet", () =>
        lathe(
          [
            [9.65, 7.8],
            [11.0, 7.8],
            [11.0, 13.4],
            [9.65, 13.4],
          ],
          64,
        ),
      ),
    }),
    [],
  );
  const holes = useMemo(() => {
    const pts: [number, number, number][] = [];
    for (let k = 0; k < CLAMP.screws; k++) {
      const a = ((k + 0.5) / CLAMP.screws) * Math.PI * 2;
      pts.push([Math.cos(a) * CLAMP.screwR, HUB.top, Math.sin(a) * CLAMP.screwR]);
    }
    return pts;
  }, []);
  return (
    <group>
      <mesh geometry={hub} material={HM.hub} castShadow receiveShadow />
      <mesh geometry={magnet} material={HM.rotorMagnet} />
      {/* threaded holes for the clamp screws, visible once the clamp lifts */}
      {holes.map((p, i) => (
        <mesh key={i} geometry={cached("hdd-hub-hole", () => crease(new CylinderGeometry(0.85, 0.85, 0.04, 16)))} material={HM.hole} position={[p[0], p[1] + 0.02, p[2]]} />
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Disk stack
// ---------------------------------------------------------------------------

function platterGeos() {
  return {
    top: cached("hdd-platter-top", () => polarAnnulus(DISK.ri, DISK.r - 0.15, DISK.t, true)),
    bottom: cached("hdd-platter-bottom", () => polarAnnulus(DISK.ri, DISK.r - 0.15, 0, false)),
    edge: cached("hdd-platter-edge", () =>
      lathe(
        [
          [DISK.r - 0.15, 0],
          [DISK.r, 0.15],
          [DISK.r, DISK.t - 0.15],
          [DISK.r - 0.15, DISK.t],
        ],
        180,
      ),
    ),
    bore: cached("hdd-platter-bore", () =>
      lathe(
        [
          [DISK.ri, DISK.t],
          [DISK.ri, 0],
        ],
        64,
      ),
    ),
  };
}

/** Explode spread: how far apart neighbouring layers move (mm per level). */
export const SPREAD = { step: 9, range: [0.42, 0.85] as [number, number] };

/**
 * Five platters, each a mirror-polished aluminium disk carrying a magnetic
 * film on both faces. In the exploded view they fan apart vertically.
 */
export function Platters() {
  const g = useMemo(platterGeos, []);
  const refs = useRef<(Group | null)[]>([]);
  useFrame(() => {
    const t = smooth(SPREAD.range[0], SPREAD.range[1], explodeProgress.value);
    refs.current.forEach((r, i) => {
      if (r) r.position.y = diskBottom(i) + i * SPREAD.step * t;
    });
  });
  return (
    <group>
      {Array.from({ length: DISK.count }, (_, i) => (
        <group key={i} ref={(el) => void (refs.current[i] = el)} position-y={diskBottom(i)}>
          <mesh geometry={g.top} material={HM.platter} receiveShadow castShadow />
          <mesh geometry={g.bottom} material={HM.platter} receiveShadow />
          <mesh geometry={g.edge} material={HM.platterEdge} castShadow />
          <mesh geometry={g.bore} material={HM.platterEdge} />
        </group>
      ))}
    </group>
  );
}

/** Precision spacer rings that set the gap between platters. */
export function Spacers() {
  const geo = useMemo(
    () =>
      cached("hdd-spacer", () => {
        const h = DISK.gap;
        return lathe(
          [
            [SPACER.ri + 0.1, 0],
            [SPACER.ro - 0.15, 0],
            [SPACER.ro, 0.15],
            [SPACER.ro, h - 0.15],
            [SPACER.ro - 0.15, h],
            [SPACER.ri + 0.1, h],
            [SPACER.ri, h - 0.1],
            [SPACER.ri, 0.1],
          ],
          96,
        );
      }),
    [],
  );
  const refs = useRef<(Group | null)[]>([]);
  useFrame(() => {
    const t = smooth(SPREAD.range[0], SPREAD.range[1], explodeProgress.value);
    refs.current.forEach((r, i) => {
      if (r) r.position.y = diskTop(i) + (i + 0.5) * SPREAD.step * t;
    });
  });
  return (
    <group>
      {Array.from({ length: DISK.count - 1 }, (_, i) => (
        <group key={i} ref={(el) => void (refs.current[i] = el)} position-y={diskTop(i)}>
          <mesh geometry={geo} material={HM.spacer} castShadow receiveShadow />
        </group>
      ))}
    </group>
  );
}

/** Spring-steel disk clamp: a dished ring that presses the stack onto the hub flange. */
export function Clamp() {
  const geo = useMemo(
    () =>
      cached("hdd-clamp", () => {
        const b = HUB.top;
        const p = diskTop(DISK.count - 1);
        return lathe(
          [
            [4.6, b],
            [11.9, b],
            [12.6, b + 0.02],
            [14.1, p + 0.22],
            [14.6, p],
            [15.7, p],
            [CLAMP.ro, p + 0.2],
            [CLAMP.ro, p + 0.42],
            [15.6, p + 0.62],
            [12.9, CLAMP.top - 0.12],
            [11.6, CLAMP.top],
            [5.2, CLAMP.top],
            [4.6, CLAMP.top - 0.4],
          ],
          128,
        );
      }),
    [],
  );
  return <mesh geometry={geo} material={HM.clamp} castShadow receiveShadow />;
}

export function clampScrewPoints(): [number, number, number][] {
  const pts: [number, number, number][] = [];
  for (let k = 0; k < CLAMP.screws; k++) {
    const a = ((k + 0.5) / CLAMP.screws) * Math.PI * 2;
    pts.push([Math.cos(a) * CLAMP.screwR, CLAMP.top, Math.sin(a) * CLAMP.screwR]);
  }
  return pts;
}

export function ClampScrews() {
  const pts = useMemo(clampScrewPoints, []);
  return <TorxScrews points={pts} d={2.9} h={0.55} material={HM.screw} />;
}

/** Wrapper used by the model: the whole stack spins together about the spindle. */
export function DiskStackParts() {
  return (
    <Spinner>
      <Part id="platters">
        <Platters />
      </Part>
      <Part id="spacers">
        <Spacers />
      </Part>
      <Part id="clamp" explode={[0, (DISK.count - 1) * SPREAD.step + 9, 0]} explodeRange={SPREAD.range}>
        <Clamp />
        <Part id="clamp-screws" explode={[0, 7, 0]} explodeRange={[0.3, 0.62]}>
          <ClampScrews />
        </Part>
      </Part>
    </Spinner>
  );
}

