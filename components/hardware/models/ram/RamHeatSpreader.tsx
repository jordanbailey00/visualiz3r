"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import {
  BoxGeometry,
  CanvasTexture,
  Color,
  ExtrudeGeometry,
  InstancedMesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  Object3D,
  PlaneGeometry,
  SRGBColorSpace,
  type BufferAttribute,
  type Shape,
} from "three";
import { FONT_COND, FONT_SANS, painted, rng } from "@/lib/three/painter";
import { Part } from "../../Part";
import { cached, polygonShape, roundedBox } from "../../kit/geometry";
import { MAT, variant } from "../../kit/materials";
import { DRAM_TOP, HS, LIGHT, PAD, PCB, T2 } from "./layout";

/** Height of one half (local y runs 0 … H from its bottom edge). */
const H = HS.y1 - HS.y0;
const W = HS.x1 - HS.x0;

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/**
 * Extrude a shape (local XY) toward +Z from z0 with a rounded bevel. When `uv`
 * is set, the outer (+Z) cap gets planar UVs over the half's full face so a
 * painted texture lines up; geometry groups are 0 = inner cap, 1 = outer cap,
 * 2 = walls.
 */
function plate(shape: Shape, z0: number, t: number, bevel: number, segments = 2, uv = false) {
  const depth = Math.max(0.01, t - 2 * bevel);
  const g = new ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: segments, curveSegments: 10 });
  g.translate(0, 0, z0 + bevel);
  const lids = g.groups.find((gr) => gr.materialIndex === 0)!;
  const sides = g.groups.find((gr) => gr.materialIndex === 1)!;
  if (uv) {
    const pos = g.getAttribute("position") as BufferAttribute;
    const uvs = g.getAttribute("uv") as BufferAttribute;
    for (let i = lids.start; i < lids.start + lids.count; i++) uvs.setXY(i, (pos.getX(i) - HS.x0) / W, pos.getY(i) / H);
    uvs.needsUpdate = true;
  }
  const half = lids.count / 2;
  g.clearGroups();
  g.addGroup(lids.start, half, 0);
  g.addGroup(lids.start + half, half, 1);
  g.addGroup(sides.start, sides.count, 2);
  return g;
}

/** Outline of a half: rounded bottom corners, chamfered top corners. */
function halfOutline() {
  const x0 = HS.x0;
  const x1 = HS.x1;
  const y0 = 0;
  const y1 = H;
  const c = 2.6;
  const r = 1.2;
  const pts: [number, number][] = [];
  const arc = (cx: number, cy: number, a0: number, a1: number) => {
    for (let i = 0; i <= 5; i++) {
      const a = a0 + ((a1 - a0) * i) / 5;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  };
  arc(x0 + r, y0 + r, Math.PI, Math.PI * 1.5);
  arc(x1 - r, y0 + r, Math.PI * 1.5, Math.PI * 2);
  pts.push([x1, y1 - c], [x1 - c, y1], [x0 + c, y1], [x0, y1 - c]);
  return polygonShape(pts);
}

/** The black upper "armour" band with its angled step. */
const ARMOR: [number, number][] = [
  [HS.x0 + 0.7, 24.6],
  [13.6, 24.6],
  [20.2, 18.0],
  [HS.x1 - 0.7, 18.0],
  [HS.x1 - 0.7, H - 2.9],
  [HS.x1 - 3.3, H - 0.6],
  [HS.x0 + 3.3, H - 0.6],
  [HS.x0 + 0.7, H - 2.9],
];

/** Polished accent strip following the lower edge of the black band. */
function accentStrip() {
  const path: [number, number][] = [
    [HS.x0 + 1.2, 23.8],
    [13.25, 23.8],
    [19.85, 17.2],
    [HS.x1 - 1.2, 17.2],
  ];
  const w = 0.55;
  // Offset the polyline into a thin band (miter at the two bends).
  const up: [number, number][] = [];
  const dn: [number, number][] = [];
  for (let i = 0; i < path.length; i++) {
    const [x, y] = path[i];
    const a = path[Math.max(0, i - 1)];
    const b = path[Math.min(path.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    let nx = -dy / len;
    let ny = dx / len;
    if (i > 0 && i < path.length - 1) {
      const scale = 1 / Math.cos(Math.PI / 8);
      nx *= scale;
      ny *= scale;
    }
    up.push([x + (nx * w) / 2, y + (ny * w) / 2]);
    dn.push([x - (nx * w) / 2, y - (ny * w) / 2]);
  }
  return polygonShape([...up, ...dn.reverse()]);
}

/** Raised diagonal ribs at the lower right of each half. */
function ribShapes() {
  const out: Shape[] = [];
  for (let i = 0; i < 6; i++) {
    const x = 36.6 + i * 3.6;
    out.push(
      polygonShape([
        [x, 2.2],
        [x + 1.5, 2.2],
        [x + 1.5 + 6.2, 14.6],
        [x + 6.2, 14.6],
      ]),
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

let faceMat: MeshPhysicalMaterial | null = null;
/** Brushed silver aluminium with laser-etched lettering. */
function brushedFaceMaterial() {
  if (faceMat) return faceMat;
  const maps = painted("ram-hs-face", W, H, 16, { color: "#bcc1c8", rough: 0.3, metal: 1, height: 0.5 }, (p) => {
    const r = rng(23);
    // Brushing: many fine, low-contrast horizontal streaks of varying length.
    for (let i = 0; i < 1600; i++) {
      const y = r() * H;
      const v = r();
      const c = Math.round(181 + v * 18);
      const x0 = r() * W;
      const len = W * (0.15 + r() * 0.6);
      p.rect(x0 - len / 2, y, len, 0.025 + r() * 0.04, { color: `rgb(${c},${c + 4},${c + 9})`, rough: 0.25 + v * 0.1, metal: 1 });
    }
    // Laser etching: darker, satin and very slightly recessed.
    const etch = { color: "#3d4148", rough: 0.6, metal: 0.55, height: 0.38 };
    const fine = { color: "#5b6068", rough: 0.55, metal: 0.7, height: 0.42 };
    p.text("DDR5", 9.0, H - 7.4, 7.2, etch, { font: FONT_SANS, weight: 800, letterSpacing: 1.0, baseline: "alphabetic" });
    p.polyline(
      [
        [9.2, H - 5.6],
        [44, H - 5.6],
      ],
      0.3,
      etch,
    );
    p.text("PERFORMANCE MEMORY", 9.2, H - 3.9, 1.35, fine, { font: FONT_SANS, weight: 700, letterSpacing: 0.5, baseline: "middle" });
    p.text("32 GB  ·  6000 MT/s  ·  CL30", 9.2, H - 13.6, 1.3, fine, { font: FONT_COND, weight: 600, letterSpacing: 0.2, baseline: "middle" });
  });
  faceMat = new MeshPhysicalMaterial({
    map: maps.map,
    roughnessMap: maps.rmMap,
    metalnessMap: maps.rmMap,
    bumpMap: maps.bumpMap,
    bumpScale: 0.35,
    roughness: 1,
    metalness: 1,
    anisotropy: 0.7,
    clearcoat: 0.15,
    clearcoatRoughness: 0.3,
  });
  return faceMat;
}

let labelMat: MeshPhysicalMaterial | null = null;
const LABEL = { w: 42, h: 12.5, x: 12.5, y: 9.2 };
/** Product sticker: capacity, speed, timings, voltage, serial number. */
function labelMaterial() {
  if (labelMat) return labelMat;
  const maps = painted("ram-label", LABEL.w, LABEL.h, 22, { color: "#f2f2ee", rough: 0.55, metal: 0, height: 0.6 }, (p) => {
    const ink = { color: "#141416", rough: 0.6, metal: 0, height: 0.62 };
    const grey = { color: "#55575c", rough: 0.6, metal: 0, height: 0.61 };
    p.rect(0, 0, LABEL.w, 2.2, { color: "#1b1c20", rough: 0.5, metal: 0 });
    p.text("DDR5 PERFORMANCE MEMORY", 1.4, 1.15, 1.25, { color: "#f2f2ee", rough: 0.5, metal: 0 }, { font: FONT_SANS, weight: 800, letterSpacing: 0.25, baseline: "middle" });
    p.text("32GB (1×32GB)  DDR5-6000", 1.4, 4.1, 1.85, ink, { font: FONT_SANS, weight: 800, baseline: "middle" });
    p.text("CL30-38-38-96   1.35V", 1.4, 6.35, 1.55, ink, { font: FONT_SANS, weight: 700, baseline: "middle" });
    p.text("PC5-48000U  2Rx8   JEDEC 4800 CL40 1.1V", 1.4, 8.3, 1.05, grey, { font: FONT_COND, weight: 600, baseline: "middle" });
    p.text("S/N 2509A0731846    MADE IN TAIWAN", 1.4, 11.1, 1.0, grey, { font: FONT_COND, weight: 600, baseline: "middle" });
    // Barcode.
    const r = rng(41);
    let bx = 27.2;
    while (bx < LABEL.w - 1.4) {
      const bw = 0.12 + r() * 0.36;
      p.rect(bx, 3.0, bw, 5.8, ink);
      bx += bw + 0.12 + r() * 0.3;
    }
    // Compliance marks drawn as simple outlines.
    p.strokeRect(27.4, 9.8, 3.2, 1.6, 0.16, grey);
    p.text("RoHS", 29.0, 10.62, 0.8, grey, { align: "center", baseline: "middle", font: FONT_COND, weight: 700 });
    p.strokeRect(31.2, 9.8, 2.2, 1.6, 0.16, grey);
    p.text("ESD", 32.3, 10.62, 0.75, grey, { align: "center", baseline: "middle", font: FONT_COND, weight: 700 });
  });
  labelMat = new MeshPhysicalMaterial({
    map: maps.map,
    roughnessMap: maps.rmMap,
    metalnessMap: maps.rmMap,
    bumpMap: maps.bumpMap,
    bumpScale: 0.2,
    roughness: 1,
    metalness: 1,
    clearcoat: 0.25,
    clearcoatRoughness: 0.5,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  return labelMat;
}

const innerMat = () => variant("ram-hs-inner", MAT.aluminum, { color: "#8e949c", roughness: 0.5 });
const edgeMat = () => variant("ram-hs-edge", MAT.aluminum, { color: "#c3c8cf", roughness: 0.26 });
const armorMat = () => variant("ram-hs-armor", MAT.aluminumBlack, { color: "#1b1e23", roughness: 0.34, clearcoat: 0.55, clearcoatRoughness: 0.25 });

// ---------------------------------------------------------------------------
// Parts
// ---------------------------------------------------------------------------

/**
 * One heat-spreader half in its own frame: inner face at z = 0, bottom edge
 * at y = 0, outer face toward +Z. The back half is the same part turned 180°.
 */
function HalfBody() {
  const geos = useMemo(
    () => ({
      base: cached("ram-hs-base", () => plate(halfOutline(), 0, HS.plate, 0.22, 2, true)),
      armor: cached("ram-hs-armor", () => plate(polygonShape(ARMOR), HS.plate - 0.05, HS.relief + 0.05, 0.28, 2)),
      accent: cached("ram-hs-accent", () => {
        const g = new ExtrudeGeometry(accentStrip(), { depth: 0.12, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.1, bevelSegments: 2, curveSegments: 2 });
        g.translate(0, 0, HS.plate + 0.1);
        return g;
      }),
      ribs: cached("ram-hs-ribs", () => {
        const g = new ExtrudeGeometry(ribShapes(), { depth: 0.25, bevelEnabled: true, bevelThickness: 0.18, bevelSize: 0.18, bevelSegments: 2, curveSegments: 4 });
        g.translate(0, 0, HS.plate - 0.05 + 0.18);
        return g;
      }),
    }),
    [],
  );
  const baseMats = useMemo(() => [innerMat(), brushedFaceMaterial(), edgeMat()], []);
  const armorMats = useMemo(() => [armorMat(), armorMat(), variant("ram-hs-armor-edge", MAT.aluminumBlack, { color: "#30333a", roughness: 0.24 })], []);
  return (
    <group>
      <mesh geometry={geos.base} material={baseMats} castShadow receiveShadow />
      <mesh geometry={geos.armor} material={armorMats} castShadow receiveShadow />
      <mesh geometry={geos.ribs} material={armorMat()} castShadow receiveShadow />
      <mesh geometry={geos.accent} material={MAT.chrome} castShadow />
    </group>
  );
}

/** Thermal interface tape, in the half's frame (just inside its inner face). */
function PadBody() {
  const t = HS.inner - (T2 + DRAM_TOP);
  const geo = roundedBox(PAD.x1 - PAD.x0, PAD.y1 - PAD.y0, t, Math.min(0.25, t / 2 - 0.01), 2);
  const mat = variant("ram-pad", MAT.thermalPadPink, { color: "#d6a3a4", roughness: 0.95 });
  return <mesh geometry={geo} material={mat} position={[(PAD.x0 + PAD.x1) / 2, (PAD.y0 + PAD.y1) / 2 - HS.y0, -t / 2]} castShadow receiveShadow />;
}

/**
 * Both heat-spreader halves. Exploding opens them like a clamshell: each half
 * swings outward about its bottom edge and its thermal pad peels away from it.
 */
export function HeatSpreader() {
  return (
    <Part id="heat-spreader" cover>
      <Part id="spreader-front" position={[0, HS.y0, HS.inner]} explode={[0, 0, 10]} explodeRotate={[1.5, 0, 0]} explodeRange={[0, 0.55]}>
        <HalfBody />
        <Part id="thermal-pad-front" explode={[0, 0, -3.6]} explodeRange={[0.3, 0.7]}>
          <PadBody />
        </Part>
      </Part>
      <Part id="spreader-back" position={[0, HS.y0, -HS.inner]} explode={[0, 0, -10]} explodeRotate={[-1.5, 0, 0]} explodeRange={[0, 0.55]}>
        <group rotation-y={Math.PI}>
          <HalfBody />
          <Part id="module-label">
            <mesh geometry={cached("ram-label-plane", () => new PlaneGeometry(LABEL.w, LABEL.h))} material={labelMaterial()} position={[LABEL.x, LABEL.y, HS.plate + 0.03]} />
          </Part>
          <Part id="thermal-pad-back" explode={[0, 0, -3.6]} explodeRange={[0.3, 0.7]}>
            <PadBody />
          </Part>
        </group>
      </Part>
    </Part>
  );
}

// ---------------------------------------------------------------------------
// RGB light bar
// ---------------------------------------------------------------------------

/** Hue of the light bar at position t (0…1 along the module). */
function barColor(t: number) {
  return new Color().setHSL((0.55 + t * 0.75) % 1, 1.0, 0.5);
}

let diffuserMat: MeshPhysicalMaterial | null = null;
/** Frosted polycarbonate lit from inside with a rainbow gradient. */
function diffuserMaterial() {
  if (diffuserMat) return diffuserMat;
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 1024, 0);
  for (let i = 0; i <= 12; i++) g.addColorStop(i / 12, `#${barColor(i / 12).getHexString()}`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 64);
  // Hot spots above each LED.
  for (let i = 0; i < LIGHT.leds; i++) {
    const x = ((i + 0.5) / LIGHT.leds) * 1024;
    const rg = ctx.createRadialGradient(x, 64, 0, x, 64, 70);
    rg.addColorStop(0, "rgba(255,255,255,0.16)");
    rg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = rg;
    ctx.fillRect(x - 70, 0, 140, 64);
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  diffuserMat = new MeshPhysicalMaterial({
    color: "#e9edf3",
    roughness: 0.55,
    metalness: 0,
    emissive: "#ffffff",
    emissiveMap: tex,
    emissiveIntensity: 1.35,
    sheen: 0.4,
    clearcoat: 0.3,
    clearcoatRoughness: 0.6,
  });
  return diffuserMat;
}

const dummy = new Object3D();

let lensMat: MeshBasicMaterial | null = null;

/** Addressable RGB LEDs on a slim board that rests on the PCB's top edge. */
function LedStrip() {
  const bodyRef = useRef<InstancedMesh>(null);
  const lensRef = useRef<InstancedMesh>(null);
  const n = LIGHT.leds;
  const span = LIGHT.x1 - LIGHT.x0 - 6;
  const top = PCB.height + LIGHT.stripT;
  useLayoutEffect(() => {
    for (let i = 0; i < n; i++) {
      const x = LIGHT.x0 + 3 + (span * (i + 0.5)) / n;
      dummy.position.set(x, top + 0.3, 0);
      dummy.updateMatrix();
      bodyRef.current?.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, top + 0.62, 0);
      dummy.updateMatrix();
      lensRef.current?.setMatrixAt(i, dummy.matrix);
      lensRef.current?.setColorAt(i, barColor((i + 0.5) / n).multiplyScalar(2.2));
    }
    for (const m of [bodyRef.current, lensRef.current]) {
      if (!m) continue;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.computeBoundingSphere();
    }
  }, [n, span, top]);
  lensMat ??= new MeshBasicMaterial({ color: "#ffffff", toneMapped: false });
  return (
    <group>
      {/* LED board */}
      <mesh geometry={roundedBox(LIGHT.x1 - LIGHT.x0 - 2, LIGHT.stripT, 3.6, 0.2)} material={MAT.plasticWhite} position={[0, PCB.height + LIGHT.stripT / 2, 0]} castShadow receiveShadow />
      {/* clips that hold it on the module's top edge */}
      {[-46, 46].map((x) => (
        <mesh key={x} geometry={roundedBox(4.2, 3.4, 4.1, 0.4)} material={MAT.plasticBlack} position={[x, PCB.height - 0.9, 0]} castShadow />
      ))}
      <instancedMesh ref={bodyRef} args={[cached("ram-led-body", () => new BoxGeometry(2.0, 0.6, 2.0)), MAT.plasticWhite, n]} castShadow />
      <instancedMesh ref={lensRef} args={[cached("ram-led-lens", () => new BoxGeometry(1.3, 0.06, 1.3)), lensMat, n]} />
    </group>
  );
}

export function LightBar() {
  return (
    <Part id="light-bar" explode={[0, 10, 0]} explodeRange={[0, 0.3]}>
      <Part id="rgb-leds" explode={[0, -28, -40]} explodeRange={[0.28, 0.72]}>
        <LedStrip />
      </Part>
      <Part id="diffuser" explode={[0, -21.5, -40]} explodeRange={[0.28, 0.72]}>
        <mesh
          geometry={roundedBox(LIGHT.x1 - LIGHT.x0, LIGHT.y1 - LIGHT.y0, LIGHT.halfZ * 2, 1.2, 3)}
          material={diffuserMaterial()}
          position={[0, (LIGHT.y0 + LIGHT.y1) / 2, 0]}
          castShadow
        />
      </Part>
    </Part>
  );
}
