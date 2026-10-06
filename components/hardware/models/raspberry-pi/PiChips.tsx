"use client";

import { useMemo } from "react";
import { BoxGeometry, ExtrudeGeometry, Shape, type BufferGeometry } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { FONT_COND, FONT_SANS, rng } from "@/lib/three/painter";
import { BallGrid, Chip, markingMaterial, type MarkingSpec } from "../../kit/Chip";
import { cached, roundedBox } from "../../kit/geometry";
import { MAT, variant } from "../../kit/materials";
import { SmdField, rowOf, type SmdItem } from "../../kit/Passives";
import { dieShotMaterial } from "./dieFloorplan";
import { CRYSTALS, INDUCTOR, SOC, SOC_Y, WIFI, wx, wz } from "./layout";
import { decalDown, decalUp, paintedMaterial } from "./paint";

type Vec3 = [number, number, number];

// ---------------------------------------------------------------------------
// BCM2712 package
// ---------------------------------------------------------------------------

/** Organic substrate: build-up layers with the die's bump pads and tiny capacitors. */
function substrateTopMaterial() {
  const S = SOC.size;
  return paintedMaterial("soc-substrate", S, S, 48, { color: "#3a3a22", rough: 0.42, metal: 0, height: 0.4 }, (p) => {
    const c = S / 2;
    const { w, d } = SOC.die;
    // Fine routing radiating from the die area.
    const r = rng(3);
    for (let i = 0; i < 260; i++) {
      const a = r() * Math.PI * 2;
      const r0 = 4.5 + r() * 0.6;
      const r1 = r0 + 1.5 + r() * 2.5;
      p.polyline(
        [
          [c + Math.cos(a) * r0, c + Math.sin(a) * r0 * 0.8],
          [c + Math.cos(a) * r1, c + Math.sin(a) * r1 * 0.8],
        ],
        0.03,
        { color: "#56502c", rough: 0.35, metal: 0.2, height: 0.45 },
      );
    }
    // Die footprint: a field of C4 bump pads.
    p.rect(c - w / 2 - 0.2, c - d / 2 - 0.2, w + 0.4, d + 0.4, { color: "#2c2b1a", rough: 0.4, metal: 0, height: 0.42 });
    for (let x = c - w / 2 + 0.2; x < c + w / 2 - 0.1; x += 0.3)
      for (let y = c - d / 2 + 0.2; y < c + d / 2 - 0.1; y += 0.3) p.circle(x, y, 0.07, { color: "#cfb070", rough: 0.25, metal: 1, height: 0.5 });
    // Adhesive bead where the lid flanges sit.
    for (const y of [c - SOC.lid.halfD + 0.6, c + SOC.lid.halfD - 1.8]) p.rect(0.5, y, S - 1, 1.2, { color: "#5b5a4e", rough: 0.8, metal: 0, height: 0.48 });
    p.text("BCM2712", c, c + d / 2 + 0.75, 0.42, { color: "#8a8256", rough: 0.6, metal: 0, height: 0.45 }, { align: "center", baseline: "middle", font: FONT_COND, weight: 700 });
  });
}

/** Die-side decoupling capacitors on the substrate, under the lid. */
const DIE_CAPS: SmdItem[] = [
  ...rowOf(-6.6, -4.25, 6.6, -4.25, 14, 90),
  ...rowOf(-6.6, 4.25, 6.6, 4.25, 14, 90),
  ...rowOf(-5.2, -2.6, -5.2, 2.6, 6, 0),
  ...rowOf(5.2, -2.6, 5.2, 2.6, 6, 0),
];

export function SocSubstrate() {
  const S = SOC.size;
  return (
    <group>
      <mesh geometry={roundedBox(S, SOC.substrateT, S, 0.12)} material={MAT.substrate} position-y={SOC.ballH + SOC.substrateT / 2} castShadow receiveShadow />
      <mesh geometry={decalUp(S - 0.25, S - 0.25)} material={substrateTopMaterial()} position-y={SOC_Y.substrateTop + 0.002} />
      <BallGrid w={S} d={S} pitch={0.8} inset={0.9} y={SOC.ballH / 2} r={0.19} />
      {/* Underfill fillet around the die */}
      <mesh geometry={roundedBox(SOC.die.w + 0.5, 0.12, SOC.die.d + 0.5, 0.05)} material={MAT.underfill} position-y={SOC_Y.substrateTop + 0.06} />
      <group position-y={SOC_Y.substrateTop}>
        <SmdField items={DIE_CAPS} size="0201" kind="cap" />
      </group>
    </group>
  );
}

/** The polished back of the die with a faint laser marking. */
function dieBackMaterial() {
  const { w, d } = SOC.die;
  return paintedMaterial(
    "die-back",
    w,
    d,
    90,
    { color: "#2a2d36", rough: 0.07, metal: 0.8, height: 0.5 },
    (p) => {
      const ink = { color: "#3b3f4a", rough: 0.32, metal: 0.6, height: 0.48 };
      p.text("BCM2712C1", 0.5, 0.95, 0.42, ink, { font: FONT_COND, weight: 700 });
      p.text("T6P3 22A3", 0.5, 1.55, 0.32, ink, { font: FONT_COND, weight: 600 });
      p.circle(w - 0.5, d - 0.5, 0.12, ink);
    },
    { bumpMap: null, iridescence: 0.45, iridescenceIOR: 1.7, iridescenceThicknessRange: [250, 650] },
  );
}

/** The silicon die (centred on its own origin) with bumps and its circuit side below. */
export function SocDie() {
  const { w, t, d } = SOC.die;
  return (
    <group>
      <mesh geometry={roundedBox(w, t, d, 0.04)} material={MAT.silicon} castShadow receiveShadow />
      <mesh geometry={decalUp(w - 0.08, d - 0.08)} material={dieBackMaterial()} position-y={t / 2 + 0.002} />
      <mesh geometry={decalDown(w - 0.08, d - 0.08)} material={dieShotMaterial()} position-y={-t / 2 - 0.002} />
      <BallGrid w={w} d={d} pitch={0.42} inset={0.3} y={-t / 2 - SOC.bump / 2} r={0.06} />
    </group>
  );
}

/** Thermal interface material between die and lid (centred on its own origin). */
export function SocTim() {
  return <mesh geometry={roundedBox(SOC.die.w - 0.3, SOC.timT, SOC.die.d - 0.3, 0.02)} material={MAT.thermalPaste} />;
}

/** The stamped "top-hat" heat spreader: a flat plateau over the die, two glued flanges. */
function lidGeometry() {
  return cached("pi5-soc-lid", () => {
    const { w, t, plateau, flange, halfD } = SOC.lid;
    const y0 = SOC_Y.substrateTop;
    const yt = SOC_Y.lidTop;
    const yi = SOC_Y.lidInner;
    // Cross-section in (z, y), extruded along x.
    const prof = new Shape();
    const pts: [number, number][] = [
      [-halfD, y0],
      [-halfD, y0 + t],
      [-flange, y0 + t],
      [-plateau, yt],
      [plateau, yt],
      [flange, y0 + t],
      [halfD, y0 + t],
      [halfD, y0],
      [flange + 0.16, y0],
      [plateau + 0.16, yi],
      [-(plateau + 0.16), yi],
      [-(flange + 0.16), y0],
    ];
    prof.moveTo(pts[0][0], pts[0][1]);
    for (const q of pts.slice(1)) prof.lineTo(q[0], q[1]);
    prof.closePath();
    const body = new ExtrudeGeometry(prof, { depth: w - 0.6, bevelEnabled: false });
    body.rotateY(Math.PI / 2);
    body.translate(-(w - 0.6) / 2, 0, 0);
    // Drawn-down end walls close the cup.
    const end = new Shape();
    const e: [number, number][] = [
      [-(flange + 0.2), y0],
      [-(flange + 0.2), y0 + t],
      [-plateau, yt],
      [plateau, yt],
      [flange + 0.2, y0 + t],
      [flange + 0.2, y0],
    ];
    end.moveTo(e[0][0], e[0][1]);
    for (const q of e.slice(1)) end.lineTo(q[0], q[1]);
    end.closePath();
    const parts: BufferGeometry[] = [body];
    for (const sx of [-1, 1]) {
      const g = new ExtrudeGeometry(end, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 2 });
      g.rotateY(Math.PI / 2);
      g.translate(sx < 0 ? -w / 2 + 0.08 : w / 2 - 0.38, 0, 0);
      parts.push(g);
    }
    // Flange plates under the end walls so the outline reads as one stamping.
    for (const sz of [-1, 1]) {
      const b = new BoxGeometry(0.6, t, halfD - flange);
      b.translate(0, y0 + t / 2, sz * (flange + (halfD - flange) / 2));
      const l = b.clone();
      l.translate(-(w / 2 - 0.3), 0, 0);
      const r = b.clone();
      r.translate(w / 2 - 0.3, 0, 0);
      parts.push(l, r);
    }
    const merged = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))!;
    merged.computeVertexNormals();
    return merged;
  });
}

function lidMarkingMaterial() {
  const { w, plateau } = SOC.lid;
  const W = w - 1.2;
  const D = plateau * 2 - 0.5;
  return paintedMaterial(
    "soc-lid-mark",
    W,
    D,
    70,
    { color: "#c9c7c2", rough: 0.46, metal: 0.85, height: 0.5 },
    (p) => {
      // Fine brushing marks.
      const r = rng(12);
      for (let i = 0; i < 160; i++) {
        const y = r() * D;
        const v = 190 + Math.floor(r() * 30);
        p.rect(0, y, W, 0.03, { color: `rgb(${v},${v - 2},${v - 6})`, rough: 0.4 + r() * 0.12, metal: 0.85 });
      }
      const ink = { color: "#7b7a76", rough: 0.62, metal: 0.55, height: 0.47 };
      p.text("BCM2712C1", W / 2, D * 0.33, 1.65, ink, { align: "center", baseline: "middle", font: FONT_SANS, weight: 800, letterSpacing: 0.06 });
      p.text("ZPKFSB06  2338", W / 2, D * 0.58, 0.95, ink, { align: "center", baseline: "middle", font: FONT_COND, weight: 700 });
      p.text("T93P2 15  TAIWAN", W / 2, D * 0.77, 0.85, ink, { align: "center", baseline: "middle", font: FONT_COND, weight: 700 });
      p.polygon(
        [
          [0.35, D - 0.35],
          [1.1, D - 0.35],
          [0.35, D - 1.1],
        ],
        ink,
      );
    },
    { bumpScale: 0.25, clearcoat: 0 },
  );
}

/** Satin nickel: bright but diffuse, like the real lid's fine-brushed finish. */
const lidMetal = () => variant("pi5-lid", MAT.nickel, { color: "#c9c7c2", roughness: 0.48, metalness: 0.85 });

export function SocLid() {
  const { w, plateau } = SOC.lid;
  return (
    <group>
      <mesh geometry={lidGeometry()} material={lidMetal()} castShadow receiveShadow />
      <mesh geometry={decalUp(w - 1.2, plateau * 2 - 0.5)} material={lidMarkingMaterial()} position-y={SOC_Y.lidTop + 0.003} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Wireless module
// ---------------------------------------------------------------------------

/** Stamped tin-plated shield can (open-bottom box) with vent holes. */
function shieldGeometry() {
  return cached("pi5-wifi-can", () => {
    const { w, d, h } = WIFI;
    const t = 0.15;
    const parts: BufferGeometry[] = [];
    const top = new BoxGeometry(w, t, d);
    top.translate(0, h - t / 2, 0);
    parts.push(top);
    for (const sx of [-1, 1]) {
      const b = new BoxGeometry(t, h - 0.1, d);
      b.translate(sx * (w / 2 - t / 2), (h - 0.1) / 2 + 0.05, 0);
      parts.push(b);
    }
    for (const sz of [-1, 1]) {
      const b = new BoxGeometry(w, h - 0.1, t);
      b.translate(0, (h - 0.1) / 2 + 0.05, sz * (d / 2 - t / 2));
      parts.push(b);
    }
    return mergeGeometries(parts)!;
  });
}

function shieldTopMaterial() {
  const { w, d } = WIFI;
  return paintedMaterial("wifi-can-top", w, d, 50, { color: "#c3c6ca", rough: 0.3, metal: 1, height: 0.5 }, (p) => {
    // Embossed rim and a field of small vent / inspection holes.
    p.strokeRect(0.5, 0.5, w - 1, d - 1, 0.25, { color: "#b4b7bb", rough: 0.34, metal: 1, height: 0.62 });
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 5; j++) p.circle(2.3 + i * 2.0, 2.2 + j * 2.2, 0.32, { color: "#1b1d20", rough: 0.8, metal: 0.2, height: 0.1 });
    // Pick-and-place pad left plain; faint lot code.
    p.text("W5C 2335", w - 0.9, d - 0.9, 0.55, { color: "#9fa3a8", rough: 0.5, metal: 0.8, height: 0.48 }, { align: "right", font: FONT_COND, weight: 700 });
  });
}

const canMetal = () => variant("pi5-can", MAT.tin, { color: "#c5c8cc", roughness: 0.3 });

export function WifiShield() {
  return (
    <group>
      <mesh geometry={shieldGeometry()} material={canMetal()} castShadow receiveShadow />
      <mesh geometry={decalUp(WIFI.w - 0.02, WIFI.d - 0.02)} material={shieldTopMaterial()} position-y={WIFI.h + 0.002} />
    </group>
  );
}

/** The radio itself plus its crystal and RF passives, hidden under the can. */
export function WifiChip() {
  return (
    <group>
      <Chip kind="bga" size={[4.9, 0.55, 4.4]} position={[0.6, 0, -1.2]} standoff={0.18} marking={{ lines: ["43455", "WLAN/BT", "2334"], scale: 1.1 }} />
      <Crystal position={[-3.0, 0, 3.6]} size={[2.0, 0.6, 1.6]} label="37.4" />
      <SmdField items={[...rowOf(-3.6, -4.8, 3.8, -4.8, 9, 90), ...rowOf(3.8, 2.0, 3.8, 5.2, 4, 0), ...rowOf(-1.2, 5.4, 2.2, 5.4, 5, 90)]} size="0201" />
      <SmdField items={[[-3.6, 0.2, 0], [-3.6, 1.2, 0], [1.0, 2.9, 90]]} size="0402" kind="res" />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Small parts
// ---------------------------------------------------------------------------

/** SMD crystal: ceramic base with a seam-welded metal lid and a frequency marking. */
export function Crystal({ position, size, label, rotation }: { position?: Vec3; size: Vec3; label: string; rotation?: Vec3 }) {
  const [w, h, d] = size;
  const lidMat = paintedMaterial(`xtal:${w}:${d}:${label}`, w - 0.3, d - 0.3, 120, { color: "#c4c6c9", rough: 0.26, metal: 1, height: 0.5 }, (p) => {
    const ink = { color: "#55575c", rough: 0.6, metal: 0.4, height: 0.46 };
    const W = w - 0.3;
    const D = d - 0.3;
    p.text(label, W / 2, D * 0.42, Math.min(D * 0.36, W / 4.5), ink, { align: "center", baseline: "middle", font: FONT_COND, weight: 700 });
    p.text("K3A", W / 2, D * 0.78, Math.min(D * 0.24, W / 6), ink, { align: "center", baseline: "middle", font: FONT_COND, weight: 600 });
  });
  return (
    <group position={position} rotation={rotation}>
      <mesh geometry={roundedBox(w, h * 0.45, d, 0.08)} material={MAT.ceramic} position-y={h * 0.225 + 0.04} castShadow receiveShadow />
      <mesh geometry={roundedBox(w - 0.25, h * 0.55, d - 0.25, 0.08)} material={MAT.nickel} position-y={h * 0.45 + h * 0.275 + 0.04} castShadow />
      <mesh geometry={decalUp(w - 0.3, d - 0.3)} material={lidMat} position-y={h + 0.042} />
    </group>
  );
}

export function Crystals() {
  return (
    <group>
      {CRYSTALS.map((c, i) => (
        <Crystal key={i} position={[wx(c.x), 0, wz(c.z)]} size={[c.w, 0.75, c.d]} label={c.label} />
      ))}
    </group>
  );
}

/** "R47" = 0.47 µH. */
const INDUCTOR_MARK: MarkingSpec = { lines: ["R47"], pin1: false, ink: "#9c9ea3", base: "#2f3034", scale: 1.6 };

/** Thin-film power inductor (2520): dark composite body, tinned end terminals. */
export function Inductor({ position }: { position?: Vec3 }) {
  const { w, h, d } = INDUCTOR;
  const term = useMemo(
    () =>
      cached("pi5-ind-term", () => {
        const a = new BoxGeometry(w * 0.96, h * 0.92, 0.42);
        a.translate(0, h * 0.46, -d / 2 + 0.21);
        const b = a.clone();
        b.translate(0, 0, d - 0.42);
        return mergeGeometries([a, b])!;
      }),
    [w, h, d],
  );
  return (
    <group position={position}>
      <mesh geometry={roundedBox(w, h, d - 0.6, 0.12)} material={MAT.ferrite} position-y={h / 2} castShadow receiveShadow />
      <mesh geometry={term} material={MAT.tin} castShadow />
      <mesh geometry={decalUp(w - 0.3, d - 1.0)} material={markingMaterial(w - 0.3, d - 1.0, INDUCTOR_MARK)} position-y={h + 0.002} />
    </group>
  );
}

