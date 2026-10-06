"use client";

import { useMemo } from "react";
import { MeshPhysicalMaterial, type BufferGeometry } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { FONT_COND, FONT_SANS, rng, type Surface } from "@/lib/three/painter";
import { Part } from "../../Part";
import { cached, flatFace, roundedBox } from "../../kit/geometry";
import { MAT, variant } from "../../kit/materials";
import { SmdField, type SmdItem } from "../../kit/Passives";
import { CCD, IOD, flat, matrixCode, paintCcd, paintIod, satin } from "./floorplan";
import { DIES, DIE_T, DIE_Y, EX, IHS, PKG, TIM_T, type DieSpec } from "./layout";
import { Spin } from "./Reveal";
import {
  LGA,
  alignBottom,
  alignTop,
  decalPlane,
  extrudeY,
  lgaPoints,
  notchedSquarePoints,
  paintOnce,
  paintedMaterial,
  roundedPolygon,
  roundedRectPoints,
  shapeBounds,
  shapeFrom,
  Slab,
} from "./shapes";

type Pt = [number, number];

// ---------------------------------------------------------------------------
// Outlines
// ---------------------------------------------------------------------------

/** 40 × 40 mm substrate with the two semicircular orientation notches. */
function substratePoints(): Pt[] {
  const h = PKG.half;
  const arc = (cx: number, from: number, to: number): Pt[] => {
    const out: Pt[] = [];
    for (let i = 0; i <= 8; i++) {
      const a = from + ((to - from) * i) / 8;
      out.push([cx + PKG.keyR * Math.cos(a), PKG.keyZ + PKG.keyR * Math.sin(a)]);
    }
    return out;
  };
  const corners: Pt[] = [
    [-h, -h],
    [h, -h],
    ...arc(h, -Math.PI / 2, -Math.PI * 1.5),
    [h, h],
    [-h, h],
    ...arc(-h, Math.PI / 2, -Math.PI / 2),
  ];
  const radii = corners.map((_, i) => (i === 0 || i === 1 || i === 11 || i === 12 ? 0.6 : 0));
  return roundedPolygon(corners, radii, 4);
}

const notch = (half: number, inset: number, outerR = 0.45, innerR = 0.75) => ({
  centers: IHS.notchCenters,
  width: IHS.notchW + 2 * inset,
  depth: half - IHS.notchInner - inset,
  outerR: Math.max(0.05, outerR - inset),
  innerR: innerR + inset,
});

const SKIRT_PTS = notchedSquarePoints(IHS.skirt, 2.2, notch(IHS.skirt, 0));
const PLATEAU_BEVEL = 0.3;
const PLATEAU_PTS = notchedSquarePoints(IHS.plateau, 1.8, notch(IHS.plateau, 0));
/** Plateau outline shrunk by the bevel: the flat face that carries the markings. */
const PLATEAU_FLAT_PTS = notchedSquarePoints(
  IHS.plateau - PLATEAU_BEVEL,
  1.8 - PLATEAU_BEVEL,
  notch(IHS.plateau - PLATEAU_BEVEL, PLATEAU_BEVEL, 0.45, 0.75),
);
const CAVITY_PTS = roundedRectPoints(0, 0, IHS.cavity * 2, IHS.cavity * 2, 1.5);

export const SUBSTRATE_SHAPE = shapeFrom(substratePoints());

/** Package capacitors: two rows of four in each of the eight cut-outs. */
export const PACKAGE_CAPS: SmdItem[] = (() => {
  const out: SmdItem[] = [];
  for (let side = 0; side < 4; side++) {
    for (const c of IHS.notchCenters) {
      for (const depth of [18.25, 16.45]) {
        for (const o of [-2.1, -0.7, 0.7, 2.1]) {
          // Side 0 = back edge; rotate by 90° steps like the outline.
          let [x, z] = [c + o, -depth];
          for (let j = 0; j < side; j++) [x, z] = [-z, x];
          out.push([x, z, side % 2 === 0 ? 90 : 0]);
        }
      }
    }
  }
  return out;
})();

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

const MASK: Surface = { color: "#2f5a37", rough: 0.42, metal: 0, height: 0.3 };
const TIN: Surface = { color: "#c4c8cc", rough: 0.3, metal: 1, height: 0.62 };
const GOLD: Surface = { color: "#e2b866", rough: 0.22, metal: 1, height: 0.62 };

function substrateTopMaterial() {
  const b = shapeBounds(SUBSTRATE_SHAPE);
  const maps = paintOnce("cpu-substrate-top", b.w, b.h, 30, MASK, (p) => {
    alignTop([p.c, p.m, p.hgt], b);
    const rand = rng(41);
    // Adhesive bead left by the lid's feet (visible once the lid is lifted).
    p.polygon(SKIRT_PTS, { color: "#3c3f40", rough: 0.85, metal: 0, height: 0.36 });
    p.polygon(CAVITY_PTS, MASK);
    // Faint copper planes under the mask between the dies.
    p.roundRect(-12.6, -12.6, 25.2, 25.2, 1.2, { color: "#346340", rough: 0.4, metal: 0, height: 0.34 });
    // C4 bump pads under each die (seen once the dies are lifted off).
    for (const d of DIES) {
      p.rect(d.x - d.w / 2 - 0.25, d.z - d.d / 2 - 0.25, d.w + 0.5, d.d + 0.5, { color: "#4a4436", rough: 0.4, metal: 0, height: 0.4 });
      for (let z = d.z - d.d / 2 + 0.15; z < d.z + d.d / 2 - 0.1; z += 0.2) {
        for (let x = d.x - d.w / 2 + 0.15; x < d.x + d.w / 2 - 0.1; x += 0.2) p.circle(x, z, 0.065, { ...TIN, color: "#d3d6da" });
      }
    }
    // Capacitor pads in the cut-outs, plus scattered micro-vias.
    for (const [x, z, r] of PACKAGE_CAPS) {
      const along = r === 90;
      for (const s of [-1, 1]) {
        const px = along ? x : x + s * 0.38;
        const pz = along ? z + s * 0.38 : z;
        p.rect(px - (along ? 0.3 : 0.16), pz - (along ? 0.16 : 0.3), along ? 0.6 : 0.32, along ? 0.32 : 0.6, TIN);
      }
    }
    for (let i = 0; i < 180; i++) {
      const a = rand() * Math.PI * 2;
      const r = 14.9 + rand() * 4.6;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (Math.abs(x) > 19.5 || Math.abs(z) > 19.5) continue;
      p.circle(x, z, 0.09, { color: "#3e6e47", rough: 0.4, metal: 0, height: 0.36 });
    }
    // Gold pin-1 triangle in the front-left corner.
    p.polygon(
      [
        [-19.55, 19.55],
        [-19.55, 17.0],
        [-17.0, 19.55],
      ],
      GOLD,
    );
    // Substrate laser marks inside the lid area.
    const ink: Surface = { color: "#a9c0a6", rough: 0.6, metal: 0, height: 0.32 };
    p.text("S1718-A2  2504", -1.6, 11.6, 0.62, ink, { font: FONT_COND, weight: 600 });
    matrixCode(p, -4.6, 9.4, 2.4, 14, 7, ink);
  });
  return paintedMaterial("cpu-substrate-top", maps, { bumpScale: 0.25, clearcoat: 0.4, clearcoatRoughness: 0.35 });
}

function landsMaterial() {
  const b = shapeBounds(SUBSTRATE_SHAPE);
  const maps = paintOnce("cpu-lands", b.w, b.h, 28, MASK, (p) => {
    alignBottom([p.c, p.m, p.hgt], b);
    p.mirrorText = true;
    const d = LGA.padD;
    for (const [x, z] of lgaPoints()) p.circle(x, z, d / 2, GOLD);
    // Silkscreen pin-1 corner mark and a few test pads near the edge.
    const silk: Surface = { color: "#e7ece4", rough: 0.75, metal: 0, height: 0.5 };
    p.polygon(
      [
        [-19.6, 19.6],
        [-19.6, 17.9],
        [-17.9, 19.6],
      ],
      silk,
    );
    for (const x of [-12, -6, 6, 12]) p.circle(x, -19.45, 0.28, GOLD);
    p.text("1718", 14.2, 19.45, 0.62, silk, { font: FONT_COND, weight: 700, baseline: "middle" });
  });
  return paintedMaterial("cpu-lands", maps, { bumpScale: 0.3, clearcoat: 0.3, clearcoatRoughness: 0.4 });
}

/** Laser-etched nickel top of the heat spreader. */
function ihsTopMaterial() {
  const shape = shapeFrom(PLATEAU_FLAT_PTS);
  const b = shapeBounds(shape);
  const nickel: Surface = { color: "#d9d9d5", rough: 0.4, metal: 1, height: 0.5 };
  const maps = paintOnce("cpu-ihs-top", b.w, b.h, 30, nickel, (p) => {
    satin(p, nickel, 3, 1, 5, 0.8);
    // Slightly hazier band toward the edges where the lid was stamped.
    p.c.save();
    const g = p.c.createRadialGradient(b.w / 2, b.h / 2, b.w * 0.2, b.w / 2, b.h / 2, b.w * 0.75);
    g.addColorStop(0, "rgba(255,255,255,0.04)");
    g.addColorStop(1, "rgba(0,0,0,0.07)");
    p.c.fillStyle = g;
    p.c.fillRect(0, 0, b.w, b.h);
    p.c.restore();

    const ink: Surface = { color: "#5d6064", rough: 0.68, metal: 0.55, height: 0.42 };
    const x0 = 2.9;
    // Generic mark: a hexagon with a stylised core inside.
    const cx = x0 + 1.55;
    const cy = 4.3;
    const hex: Pt[] = [];
    for (let i = 0; i < 6; i++) hex.push([cx + 1.55 * Math.cos((i * Math.PI) / 3 + Math.PI / 6), cy + 1.55 * Math.sin((i * Math.PI) / 3 + Math.PI / 6)]);
    p.polyline([...hex, hex[0]], 0.32, ink);
    p.rect(cx - 0.55, cy - 0.55, 1.1, 1.1, ink);
    p.text("16-CORE DESKTOP PROCESSOR", x0 + 4.0, cy + 0.05, 1.45, ink, {
      font: FONT_SANS,
      weight: 700,
      baseline: "middle",
      letterSpacing: 0.06,
      maxWidth: 24,
    });
    p.text("X-1657", x0, 11.3, 4.8, ink, { font: FONT_SANS, weight: 800, baseline: "middle", letterSpacing: 0.15 });
    p.text("16 CORES · 32 THREADS · 170 W", x0, 15.6, 1.3, ink, { font: FONT_SANS, weight: 600, baseline: "middle" });
    p.polyline(
      [
        [x0, 17.4],
        [b.w - 2.9, 17.4],
      ],
      0.08,
      ink,
    );
    matrixCode(p, x0, 19.2, 6.6, 18, 11, ink);
    const tx = x0 + 8.4;
    const lines = ["100-000001657", "9KT4127P40018", "DIFFUSED IN TAIWAN", "MADE IN MALAYSIA"];
    lines.forEach((l, i) =>
      p.text(l, tx, 20.1 + i * 1.95, i < 2 ? 1.3 : 1.12, ink, { font: FONT_COND, weight: 600, baseline: "middle" }),
    );
    p.text("© 2025", b.w - 2.9, 29.6, 0.95, ink, { font: FONT_SANS, weight: 600, baseline: "middle", align: "right" });
    // Small etched pin-1 triangle, matching the gold one on the substrate.
    p.polygon(
      [
        [2.4, b.h - 2.4],
        [2.4, b.h - 4.0],
        [4.0, b.h - 2.4],
      ],
      ink,
    );
  });
  return paintedMaterial("cpu-ihs-top", maps, {
    bumpScale: 0.2,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

/** Gold-plated underside of the lid, with the solder imprints of the three dies. */
function ihsUnderMaterial() {
  const shape = shapeFrom(CAVITY_PTS);
  const b = shapeBounds(shape);
  const maps = paintOnce("cpu-ihs-under", b.w, b.h, 16, { color: "#d1a95c", rough: 0.32, metal: 1, height: 0.5 }, (p) => {
    alignBottom([p.c, p.m, p.hgt], b);
    const rand = rng(5);
    for (const d of DIES) {
      p.roundRect(d.x - d.w / 2 + 0.15, d.z - d.d / 2 + 0.15, d.w - 0.3, d.d - 0.3, 0.3, { color: "#b9bcc1", rough: 0.42, metal: 1, height: 0.6 });
      for (let i = 0; i < 40; i++) {
        p.circle(d.x + (rand() - 0.5) * d.w * 0.9, d.z + (rand() - 0.5) * d.d * 0.9, 0.2 + rand() * 0.5, {
          color: "#a7aaaf",
          rough: 0.5,
          metal: 1,
          height: 0.56,
        });
      }
    }
  });
  return paintedMaterial("cpu-ihs-under", maps, { bumpScale: 0.2 });
}

let indiumMat: MeshPhysicalMaterial | null = null;
/** Reflowed indium: soft, silvery, faintly mottled. */
function indiumMaterial() {
  if (indiumMat) return indiumMat;
  const base: Surface = { color: "#c2c5ca", rough: 0.24, metal: 1, height: 0.5 };
  const maps = paintOnce("cpu-indium", 12, 12, 40, base, (p) => satin(p, base, 4, 2, 1, 0.7));
  indiumMat = paintedMaterial("cpu-indium", maps, { bumpScale: 0.25 });
  return indiumMat;
}

const dieShots = new Map<string, MeshPhysicalMaterial>();
/** Circuit side of a die: the floorplan as a die photograph, with C4 bumps. */
function dieShotMaterial(kind: "ccd" | "iod") {
  let m = dieShots.get(kind);
  if (m) return m;
  const { w, h } = kind === "ccd" ? CCD : IOD;
  const maps = paintOnce(`cpu-dieshot-${kind}`, w, h, kind === "ccd" ? 72 : 64, flat("#121418"), (p) =>
    kind === "ccd" ? paintCcd(p, { bumps: true }) : paintIod(p, { bumps: true }),
  );
  m = paintedMaterial(`cpu-dieshot-${kind}`, maps, {
    bumpScale: 0.12,
    iridescence: 0.25,
    iridescenceIOR: 1.6,
    iridescenceThicknessRange: [300, 600],
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  dieShots.set(kind, m);
  return m;
}

const dieBacks = new Map<string, MeshPhysicalMaterial>();
/** Back of a die: gold backside metallisation (so indium wets it) with a laser ID. */
function dieBackMaterial(d: DieSpec) {
  const key = `${d.w}x${d.d}:${d.id}`;
  let m = dieBacks.get(key);
  if (m) return m;
  const maps = paintOnce(`cpu-dieback-${key}`, d.w, d.d, 40, { color: "#d8ae5c", rough: 0.24, metal: 1, height: 0.5 }, (p) => {
    const ink: Surface = { color: "#a07c3a", rough: 0.5, metal: 0.9, height: 0.45 };
    const ccd = d.id !== "io-die";
    p.text(ccd ? "CCD-8C  N5" : "IOD  N6", 0.6, 0.9, 0.55, ink, { font: FONT_COND, weight: 700, baseline: "middle" });
    p.text(ccd ? `2338 ${d.id === "ccd-0" ? "A" : "B"}17` : "2341 C02", 0.6, 1.65, 0.45, ink, { font: FONT_COND, weight: 600, baseline: "middle" });
    matrixCode(p, d.w - 1.9, 0.4, 1.4, 12, d.id.length * 3 + (ccd ? 1 : 5), ink);
  });
  m = paintedMaterial(`cpu-dieback-${key}`, maps, {
    bumpScale: 0.15,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  dieBacks.set(key, m);
  return m;
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

/** Organic substrate (sides + top) and the underfill fillets of the dies. */
export function Substrate() {
  const underfill = useMemo(
    () =>
      cached("cpu-underfill", () => {
        const parts = DIES.map((d) => roundedBox(d.w + 0.5, 0.16, d.d + 0.5, 0.07).clone().translate(d.x, PKG.t + 0.08, d.z));
        return mergeGeometries(parts)!;
      }),
    [],
  );
  return (
    <group>
      <Slab shape={SUBSTRATE_SHAPE} y0={0} y1={PKG.t} top={substrateTopMaterial()} side={MAT.substrate} />
      <mesh geometry={underfill} material={MAT.underfill} receiveShadow />
    </group>
  );
}

/** Gold LGA lands on the underside: exactly 1718 of them. */
export function LgaLands() {
  const geo = useMemo(() => cached("cpu-lands-face", () => flatFace(SUBSTRATE_SHAPE, shapeBounds(SUBSTRATE_SHAPE), true)), []);
  return <mesh geometry={geo} material={landsMaterial()} position-y={-0.001} />;
}

export function PackageCaps() {
  return (
    <group position-y={PKG.t}>
      <SmdField items={PACKAGE_CAPS} size="0402" kind="cap" />
    </group>
  );
}

/**
 * The heat spreader: eight legs glued to the substrate, a recess for the
 * dies, and a thick plateau for the cooler — all one piece of plated copper.
 */
export function HeatSpreader() {
  const body = useMemo(
    () =>
      cached("cpu-ihs-body", () => {
        const ring = extrudeY(shapeFrom(SKIRT_PTS, [CAVITY_PTS]), IHS.feet, IHS.skirtTop, 0.15);
        const ceiling = extrudeY(shapeFrom(CAVITY_PTS), IHS.ceiling, IHS.skirtTop - 0.01, 0);
        const plateau = extrudeY(shapeFrom(PLATEAU_PTS), IHS.skirtTop - 0.01, IHS.top, PLATEAU_BEVEL, 8);
        const parts: BufferGeometry[] = [ring, ceiling, plateau];
        return mergeGeometries(parts)!;
      }),
    [],
  );
  const top = useMemo(() => {
    const s = shapeFrom(PLATEAU_FLAT_PTS);
    return cached("cpu-ihs-topface", () => flatFace(s, shapeBounds(s), false));
  }, []);
  const under = useMemo(() => {
    const s = shapeFrom(CAVITY_PTS);
    return cached("cpu-ihs-underface", () => flatFace(s, shapeBounds(s), true));
  }, []);
  return (
    <group>
      <mesh geometry={body} material={variant("cpu-ihs-nickel", MAT.nickel, { color: "#d8d7d3", roughness: 0.3 })} castShadow receiveShadow />
      <mesh geometry={top} material={ihsTopMaterial()} position-y={IHS.top + 0.002} receiveShadow />
      <mesh geometry={under} material={ihsUnderMaterial()} position-y={IHS.ceiling - 0.004} />
    </group>
  );
}

/** Indium preforms soldered between each die and the lid. */
export function SolderTim() {
  return (
    <group>
      {DIES.map((d) => (
        <mesh
          key={d.id}
          geometry={roundedBox(d.w - 0.3, TIM_T, d.d - 0.3, 0.09)}
          material={indiumMaterial()}
          position={[d.x, DIE_Y + DIE_T / 2 + TIM_T / 2, d.z]}
          castShadow
          receiveShadow
        />
      ))}
    </group>
  );
}

/**
 * A bare die mounted circuit-side down. In the exploded view it lifts, then
 * flips to show the floorplan (the I/O die flips about Z: it is longer in Z).
 */
export function Die({ spec }: { spec: DieSpec }) {
  const kind = spec.id === "io-die" ? "iod" : "ccd";
  const flipAxis: [number, number, number] = kind === "iod" ? [0, 0, Math.PI] : [Math.PI, 0, 0];
  return (
    <Part
      id={spec.id}
      position={[spec.x, DIE_Y, spec.z]}
      explode={[0, EX.dieLift.lift, 0]}
      explodeRange={EX.dieLift.range}
    >
      <Spin rotate={flipAxis} range={EX.dieFlip.range}>
        <mesh geometry={roundedBox(spec.w, DIE_T, spec.d, 0.05)} material={MAT.silicon} castShadow receiveShadow />
        <mesh geometry={decalPlane(spec.w - 0.06, spec.d - 0.06)} material={dieBackMaterial(spec)} position-y={DIE_T / 2 + 0.002} />
        <mesh
          geometry={decalPlane(spec.w - 0.04, spec.d - 0.04, true)}
          material={dieShotMaterial(kind)}
          position-y={-DIE_T / 2 - 0.002}
        />
      </Spin>
    </Part>
  );
}
