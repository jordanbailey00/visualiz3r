"use client";

import { useMemo, type ReactNode } from "react";
import { BoxGeometry, Matrix4, MeshPhysicalMaterial, PlaneGeometry, Quaternion, SphereGeometry, Vector3 } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { painted } from "@/lib/three/painter";
import { Part } from "../../Part";
import { Chip, markingMaterial, type MarkingSpec } from "../../kit/Chip";
import { cached, roundedBox } from "../../kit/geometry";
import { MAT, variant } from "../../kit/materials";
import { SmdField } from "../../kit/Passives";
import { DIE, DIE_BASE, paintDie } from "./dieArt";
import { Instances } from "./Instances";
import { DRAM, DRAM_TOP, INDUCTORS, OPEN_CHIP, PINS, PMIC, RGB_MCU, SPD_HUB, T2, edgeY, pinX } from "./layout";
import { DRAM_BALLS, PASSIVES, faceItems, pcbGeometry, pcbMaterials, type PassiveGroup, type Side } from "./pcb";

type Vec3 = [number, number, number];

/**
 * A frame whose local XZ plane is one face of the board with +Y pointing out
 * of it, so kit parts (which sit on y = 0) can be placed on either side.
 * World (X, Y) on the face ↔ local (±X, −Y).
 */
export function Face({ side, children }: { side: Side; children: ReactNode }) {
  return side === "front" ? (
    <group position-z={T2} rotation-x={Math.PI / 2}>
      {children}
    </group>
  ) : (
    <group position-z={-T2} rotation={[-Math.PI / 2, Math.PI, 0]}>
      {children}
    </group>
  );
}

const ONE = new Vector3(1, 1, 1);
const NO_ROT = new Quaternion();
const at = (x: number, y: number, z: number, s: Vector3 = ONE, q: Quaternion = NO_ROT) => new Matrix4().compose(new Vector3(x, y, z), q, s);

// ---------------------------------------------------------------------------
// Board and edge connector
// ---------------------------------------------------------------------------

/** The bare PCB: painted front and back, bevelled FR-4 edges. */
export function ModulePcb() {
  const [back, front] = pcbMaterials();
  const edge = variant("ram-fr4", MAT.fr4, { color: "#4e5538", roughness: 0.68 });
  return <mesh geometry={pcbGeometry()} material={[back, front, edge]} castShadow receiveShadow />;
}

/** 288 hard-gold contacts, 144 per side at 0.85 mm pitch, following the curved edge. */
export function EdgeContacts() {
  const geo = useMemo(
    () =>
      cached("ram-contacts", () => {
        const parts: BoxGeometry[] = [];
        for (let i = 0; i < 144; i++) {
          const x = pinX(i);
          const y0 = edgeY(x) + PINS.padGap;
          const h = PINS.padTop - y0;
          for (const z of [T2 + 0.014, -T2 - 0.014]) {
            const b = new BoxGeometry(PINS.padW, h, 0.028);
            b.translate(x, y0 + h / 2, z);
            parts.push(b);
          }
        }
        return mergeGeometries(parts)!;
      }),
    [],
  );
  return <mesh geometry={geo} material={MAT.gold} receiveShadow />;
}

// ---------------------------------------------------------------------------
// DRAM packages
// ---------------------------------------------------------------------------

const DRAM_MARK: MarkingSpec = {
  lines: ["D5X16G8-60", "AQ2509  KTW", "N6Y4 0132"],
  logo: "wave",
  ink: "#97989d",
  base: "#323438",
  scale: 0.95,
};

const moldMat = () => variant("ram-dram-mold", MAT.epoxy, { color: "#323438", roughness: 0.62 });
const substrateMat = () => variant("ram-dram-sub", MAT.substrate, { color: "#1f231d", roughness: 0.5, clearcoat: 0.3 });
const ballGeo = () => cached("ram-ball", () => new SphereGeometry(1, 10, 6));

function decalGeo(w: number, d: number) {
  return cached(`ram-decal:${w}:${d}`, () => {
    const g = new PlaneGeometry(w, d);
    g.rotateX(-Math.PI / 2);
    return g;
  });
}

const PKG = {
  sub: () => roundedBox(DRAM.w, DRAM.substrate, DRAM.h, 0.05, 1),
  mold: () => roundedBox(DRAM.w - 0.08, DRAM.mold, DRAM.h - 0.08, 0.12, 2),
  decal: () => decalGeo(DRAM.w - 0.5, DRAM.h - 0.5),
  /** Encapsulant over the bond-wire window on the ball side (board-on-chip package). */
  ridge: () => roundedBox(1.9, 0.12, 9.4, 0.05, 1),
};
const Y_SUB = DRAM.standoff + DRAM.substrate / 2;
const Y_MOLD = DRAM.standoff + DRAM.substrate + DRAM.mold / 2;
const BALL_SCALE = new Vector3(0.21, 0.15, 0.21);

/** Ball matrices of one package centred at local (x, z). */
function ballMatrices(x: number, z: number, sx: number) {
  return DRAM_BALLS.map(([bx, by]) => at(x + sx * bx, DRAM.standoff * 0.5, z - by, BALL_SCALE));
}

/**
 * A row of identical FBGA packages on one face (instanced): substrate, mould
 * body with laser marking, the window encapsulant and 82 solder balls each.
 */
export function DramPackages({ side, xs }: { side: Side; xs: number[] }) {
  const sx = side === "front" ? 1 : -1;
  const m = useMemo(() => {
    const centres = xs.map((x): [number, number] => [sx * x, -DRAM.y]);
    return {
      sub: centres.map(([x, z]) => at(x, Y_SUB, z)),
      mold: centres.map(([x, z]) => at(x, Y_MOLD, z)),
      decal: centres.map(([x, z]) => at(x, DRAM_TOP + 0.003, z)),
      ridge: centres.map(([x, z]) => at(x, DRAM.standoff - 0.06, z)),
      balls: centres.flatMap(([x, z]) => ballMatrices(x, z, sx)),
    };
  }, [xs, sx]);
  return (
    <Face side={side}>
      <Instances geometry={PKG.sub()} material={substrateMat()} matrices={m.sub} />
      <Instances geometry={PKG.mold()} material={moldMat()} matrices={m.mold} />
      <Instances geometry={PKG.decal()} material={markingMaterial(DRAM.w - 0.5, DRAM.h - 0.5, DRAM_MARK)} matrices={m.decal} shadows={false} />
      <Instances geometry={PKG.ridge()} material={moldMat()} matrices={m.ridge} shadows={false} />
      <Instances geometry={ballGeo()} material={MAT.tin} matrices={m.balls} shadows={false} />
    </Face>
  );
}

let dieFaceMat: MeshPhysicalMaterial | null = null;
/** Circuit side of the DRAM die (the real-scale floorplan). */
export function dieFaceMaterial() {
  if (dieFaceMat) return dieFaceMat;
  const maps = painted("ram-die-face", DIE.w, DIE.h, 160, DIE_BASE, (p) => paintDie(p));
  dieFaceMat = new MeshPhysicalMaterial({
    map: maps.map,
    roughnessMap: maps.rmMap,
    metalnessMap: maps.rmMap,
    roughness: 1,
    metalness: 1,
    iridescence: 0.3,
    iridescenceIOR: 1.7,
    iridescenceThicknessRange: [240, 640],
  });
  return dieFaceMat;
}

/** Die thickness as modelled (real dies are ≈0.1 mm; doubled so it reads). */
const DIE_T = 0.2;
/** Die centre above the board surface inside the package. */
const DIE_Z = DRAM.standoff + DRAM.substrate + 0.03 + DIE_T / 2;

/** Where the opened chip's die ends up at full explode (for the zoom guide). */
export const OPEN_DIE_FINAL: Vec3 = [DRAM.xs[OPEN_CHIP], DRAM.y, T2 + DIE_Z + 3.2 + 5.5];
export const OPEN_DIE_SIZE: [number, number] = [DIE.w, DIE.h];

/**
 * The chip that opens up: the mould cap lifts away, and the die (mounted face
 * down over the substrate's bond window) rises and turns over to show its
 * circuitry — the magnified views above grow out of it.
 */
export function OpenedChip() {
  const X = DRAM.xs[OPEN_CHIP];
  const balls = useMemo(() => ballMatrices(0, 0, 1), []);
  const dieMats = useMemo(() => {
    const si = MAT.silicon;
    return [si, si, si, si, si, dieFaceMaterial()];
  }, []);
  return (
    <Part id="dram-chip" position={[X, DRAM.y, T2]}>
      <group rotation-x={Math.PI / 2}>
        <mesh geometry={PKG.sub()} material={substrateMat()} position-y={Y_SUB} castShadow receiveShadow />
        <mesh geometry={PKG.ridge()} material={moldMat()} position-y={DRAM.standoff - 0.06} />
        <Instances geometry={ballGeo()} material={MAT.tin} matrices={balls} shadows={false} />
        {/* die-attach film */}
        <mesh geometry={roundedBox(DIE.w + 0.1, 0.03, DIE.h + 0.1, 0.01, 1)} material={MAT.underfill} position-y={DRAM.standoff + DRAM.substrate + 0.015} />
      </group>
      <Part id="dram-mold" explode={[0, 15, 3.5]} explodeRotate={[-0.42, 0, 0]} explodeRange={[0.52, 0.8]}>
        <group rotation-x={Math.PI / 2}>
          <mesh geometry={PKG.mold()} material={moldMat()} position-y={Y_MOLD} castShadow receiveShadow />
          <mesh geometry={PKG.decal()} material={markingMaterial(DRAM.w - 0.5, DRAM.h - 0.5, DRAM_MARK)} position-y={DRAM_TOP + 0.003} />
        </group>
      </Part>
      <Part id="dram-die" position={[0, 0, DIE_Z]} explode={[0, 0, 5.5]} explodeRotate={[0, Math.PI, 0]} explodeRange={[0.6, 0.9]}>
        <mesh geometry={cached("ram-die-box", () => new BoxGeometry(DIE.w, DIE.h, DIE_T))} material={dieMats} castShadow receiveShadow />
      </Part>
    </Part>
  );
}

// ---------------------------------------------------------------------------
// Power, management and passives
// ---------------------------------------------------------------------------

/** SMD passives of one group on both faces. */
export function PassiveFields({ group }: { group: PassiveGroup }) {
  const sets = useMemo(
    () =>
      (["front", "back"] as Side[]).map((side) => ({
        side,
        fields: PASSIVES.filter((s) => s.side === side && s.group === group).map((s) => ({ ...s, local: faceItems(side, s.items) })),
      })),
    [group],
  );
  return (
    <>
      {sets.map(({ side, fields }) =>
        fields.length ? (
          <Face key={side} side={side}>
            {fields.map((f, i) => (
              <SmdField key={i} items={f.local} size={f.size} kind={f.kind} />
            ))}
          </Face>
        ) : null,
      )}
    </>
  );
}

const inductorMat = () => variant("ram-inductor", MAT.ferrite, { color: "#6a6e75", roughness: 0.48, metalness: 0.45 });

/**
 * Moulded metal-composite power inductor: a grey block with tin terminals
 * folded around both ends and a printed value. Sits on y = 0 of a <Face>.
 */
function SmallInductor({ x, y, w, h, t, label }: { x: number; y: number; w: number; h: number; t: number; label: string }) {
  const term = 0.32;
  return (
    <group position={[x, 0, -y]}>
      <mesh geometry={roundedBox(w - 2 * term + 0.04, t, h, 0.1, 2)} material={inductorMat()} position-y={t / 2} castShadow receiveShadow />
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={roundedBox(term, t * 0.98, h * 0.94, 0.06, 1)} material={MAT.tin} position={[s * (w / 2 - term / 2), t / 2, 0]} castShadow />
      ))}
      <mesh
        geometry={decalGeo(w - 2 * term - 0.3, h - 0.5)}
        material={markingMaterial(w - 2 * term - 0.3, h - 0.5, { lines: [label], pin1: false, ink: "#d8d9dc", base: "#6a6e75", scale: 1.6 })}
        position-y={t + 0.003}
      />
    </group>
  );
}

/** PMIC: 5 V in, VDD / VDDQ (1.1 V) and VPP (1.8 V) out through three buck converters. */
export function PmicCluster() {
  return (
    <Part id="pmic" explode={[0, 0, 2.6]} explodeRange={[0.5, 0.95]}>
      <Face side="front">
        <Chip
          kind="qfn"
          size={[PMIC.size, PMIC.t, PMIC.size]}
          position={[PMIC.x, 0, -PMIC.y]}
          pins={6}
          marking={{ lines: ["PM5100", "Y2509R"], logo: "triangle", scale: 1.15, base: "#1d1e21", ink: "#9a9ba0" }}
        />
      </Face>
      <Part id="inductors" explode={[0, 0, 1.6]} explodeRange={[0.6, 1]}>
        <Face side="front">
          {INDUCTORS.map((l, i) => (
            <SmallInductor key={i} {...l} />
          ))}
        </Face>
      </Part>
      <Part id="pmic-caps">
        <PassiveFields group="pmic" />
      </Part>
    </Part>
  );
}

export function SpdHub() {
  return (
    <Face side="front">
      <Chip
        kind="qfn"
        size={[SPD_HUB.w, SPD_HUB.t, SPD_HUB.h]}
        position={[SPD_HUB.x, 0, -SPD_HUB.y]}
        pins={3}
        marking={{ lines: ["5118", "HB25"], scale: 1.3, base: "#1d1e21", ink: "#9a9ba0" }}
      />
    </Face>
  );
}

export function RgbController() {
  return (
    <Face side="front">
      <Chip
        kind="qfn"
        size={[RGB_MCU.size, RGB_MCU.t, RGB_MCU.size]}
        position={[RGB_MCU.x, 0, -RGB_MCU.y]}
        pins={5}
        marking={{ lines: ["LC32G", "2509"], logo: "square", scale: 1.15, base: "#1d1e21", ink: "#9a9ba0" }}
      />
    </Face>
  );
}

/** Chip positions per rank and sub-channel (front = rank 0, back = rank 1). */
const SUB_A = DRAM.xs.slice(0, 4);
const SUB_B = DRAM.xs.slice(4);
const SUB_A_FRONT = SUB_A.filter((_, i) => i !== OPEN_CHIP);

/** The module's printed circuit board with everything soldered to it. */
export function RamBoard() {
  return (
    <>
      <ModulePcb />
      <Part id="edge-contacts">
        <EdgeContacts />
      </Part>
      <Part id="rank-0" explode={[0, 0, 3.2]} explodeRange={[0.42, 0.88]}>
        <Part id="rank0-a">
          <DramPackages side="front" xs={SUB_A_FRONT} />
          <OpenedChip />
        </Part>
        <Part id="rank0-b">
          <DramPackages side="front" xs={SUB_B} />
        </Part>
      </Part>
      <Part id="rank-1" explode={[0, 0, -3.2]} explodeRange={[0.42, 0.88]}>
        <Part id="rank1-a">
          <DramPackages side="back" xs={SUB_A} />
        </Part>
        <Part id="rank1-b">
          <DramPackages side="back" xs={SUB_B} />
        </Part>
      </Part>
      <PmicCluster />
      <Part id="spd-hub" explode={[0, 0, 2.2]} explodeRange={[0.5, 0.95]}>
        <SpdHub />
      </Part>
      <Part id="rgb-controller" explode={[0, 0, 2.2]} explodeRange={[0.5, 0.95]}>
        <RgbController />
      </Part>
      <Part id="decoupling">
        <PassiveFields group="decoupling" />
      </Part>
      <Part id="resistors">
        <PassiveFields group="resistors" />
      </Part>
    </>
  );
}
