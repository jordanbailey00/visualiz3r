"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  Euler,
  InstancedMesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  Object3D,
  SphereGeometry,
  Vector3,
  type Material,
} from "three";
import { painted, rng, type Painter } from "@/lib/three/painter";
import { Part } from "../../Part";
import { cached } from "../../kit/geometry";
import { useAutoExplode } from "../../kit/Reveal";
import { MAT, variant } from "../../kit/materials";
import { Callout } from "./Callout";
import { DEEP, DRIVE_Y, NANDS, STACK, dieY, dieZ } from "./layout";
import { memo } from "./memo";
import { ParkedReveal } from "./motion";
import { Anchor } from "./ZoomGuide";
import { CHANNEL, NAND_DIE, NAND_FLOOR, paintCapTop, paintChannelStrip, paintCmosFace, paintNandDie } from "./paintDies";

type Vec3 = [number, number, number];
type Rect = { x: number; y: number; w: number; h: number };

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/** Accumulates quads with per-face normals, fixing the winding to match. */
class Mesher {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, n: Vec3, uvs?: [number, number][]) {
    const e1 = new Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const e2 = new Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    const flip = e1.cross(e2).dot(new Vector3(...n)) < 0;
    const order = flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
    const v = [a, b, c, d];
    const t = uvs ?? [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    for (const i of order) {
      this.pos.push(...v[i]);
      this.nor.push(...n);
      this.uv.push(...t[i]);
    }
  }
  build() {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute("normal", new BufferAttribute(new Float32Array(this.nor), 3));
    g.setAttribute("uv", new BufferAttribute(new Float32Array(this.uv), 2));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

/**
 * Closed annular sector (a slice of a thick tube): radii r0…r1, angles
 * a0…a0+da measured from +X toward +Z, spanning y0…y1. Used for the cut-open
 * layers of a vertical NAND string.
 */
function sector(m: Mesher, r0: number, r1: number, y0: number, y1: number, a0: number, da: number, seg = 28) {
  const P = (r: number, a: number, y: number): Vec3 => [r * Math.cos(a), y, r * Math.sin(a)];
  for (let i = 0; i < seg; i++) {
    const t0 = a0 + (da * i) / seg;
    const t1 = a0 + (da * (i + 1)) / seg;
    const tm = (t0 + t1) / 2;
    const out: Vec3 = [Math.cos(tm), 0, Math.sin(tm)];
    m.quad(P(r1, t0, y0), P(r1, t1, y0), P(r1, t1, y1), P(r1, t0, y1), out);
    if (r0 > 0) m.quad(P(r0, t0, y0), P(r0, t1, y0), P(r0, t1, y1), P(r0, t0, y1), [-out[0], 0, -out[2]]);
    m.quad(P(r0, t0, y1), P(r1, t0, y1), P(r1, t1, y1), P(r0, t1, y1), [0, 1, 0]);
    m.quad(P(r0, t0, y0), P(r1, t0, y0), P(r1, t1, y0), P(r0, t1, y0), [0, -1, 0]);
  }
  const a1 = a0 + da;
  m.quad(P(r0, a0, y0), P(r1, a0, y0), P(r1, a0, y1), P(r0, a0, y1), [Math.sin(a0), 0, -Math.cos(a0)]);
  m.quad(P(r0, a1, y0), P(r1, a1, y0), P(r1, a1, y1), P(r0, a1, y1), [-Math.sin(a1), 0, Math.cos(a1)]);
}

/** Flat quads lying on y = `y`, with UVs addressing their rect of a W × H texture. */
function regionQuads(rects: Rect[], W: number, H: number, y: number) {
  const m = new Mesher();
  for (const r of rects) {
    const x0 = r.x - W / 2;
    const x1 = r.x + r.w - W / 2;
    const z0 = r.y - H / 2;
    const z1 = r.y + r.h - H / 2;
    const u0 = r.x / W;
    const u1 = (r.x + r.w) / W;
    const v0 = 1 - r.y / H;
    const v1 = 1 - (r.y + r.h) / H;
    m.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [0, 1, 0], [
      [u0, v0],
      [u1, v0],
      [u1, v1],
      [u0, v1],
    ]);
  }
  return m.build();
}

const dummy = new Object3D();

/** Many axis-aligned boxes in one draw call: [cx, cy, cz, sx, sy, sz]. */
function Boxes({ items, material, cast = true }: { items: number[][]; material: Material | Material[]; cast?: boolean }) {
  const ref = useRef<InstancedMesh>(null);
  const geo = cached("unit-box", () => new BoxGeometry(1, 1, 1));
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    items.forEach(([x, y, z, sx, sy, sz], i) => {
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(sx, sy, sz);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
    m.computeBoundingBox();
  }, [items]);
  return <instancedMesh ref={ref} args={[geo, material, items.length]} castShadow={cast} receiveShadow />;
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

const once = <T extends Material>(key: string, make: () => T) => memo(`mat:${key}`, make);

const M = {
  // Schematic materials: only partly metallic so they read under studio light.
  tungsten: () => once("3d-w", () => variant("3d-w", MAT.steel, { color: "#7d8796", metalness: 0.4, roughness: 0.42 })),
  selectGate: () => once("3d-sg", () => variant("3d-sg", MAT.steel, { color: "#4f82c8", metalness: 0.45, roughness: 0.42 })),
  oxide: () => once("3d-ox", () => variant("3d-ox", MAT.plasticWhite, { color: "#e4e8ed", roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.35 })),
  poly: () => once("3d-poly", () => variant("3d-poly", MAT.plasticWhite, { color: "#7e3a26", roughness: 0.48 })),
  silicon: () => once("3d-si", () => variant("3d-si", MAT.silicon, { color: "#46505f", iridescence: 0.2 })),
  nitride: () => once("3d-nit", () => variant("3d-nit", MAT.plasticWhite, { color: "#e0a23a", roughness: 0.4 })),
  tunnel: () => once("3d-tun", () => variant("3d-tun", MAT.plasticWhite, { color: "#9fd3ee", roughness: 0.35 })),
  channel: () => once("3d-chan", () => variant("3d-chan", MAT.plasticWhite, { color: "#8f4d2c", roughness: 0.45 })),
  core: () => once("3d-core", () => variant("3d-core", MAT.plasticWhite, { color: "#f1f3f5", roughness: 0.45 })),
  cells: () => once("3d-cells", () => new MeshBasicMaterial({ color: "#ffffff", toneMapped: false })),
  electron: () =>
    once("3d-e", () => new MeshPhysicalMaterial({ color: "#2f7bff", emissive: "#3d8bff", emissiveIntensity: 2.2, roughness: 0.3 })),
};

/** A material painted once with `paint` (colour + roughness/metalness maps). */
function texturedMaterial(key: string, w: number, h: number, ppm: number, paint: (p: Painter) => void, extra = {}) {
  return once(key, () => {
    const maps = painted(key, w, h, ppm, { color: "#202020", rough: 0.5, metal: 0, height: 0.5 }, paint);
    return new MeshPhysicalMaterial({
      map: maps.map,
      roughnessMap: maps.rmMap,
      metalnessMap: maps.rmMap,
      roughness: 1,
      metalness: 1,
      ...extra,
    });
  });
}

/** Labelled floorplan of the NAND die for the magnified view. */
function floorplanMaterial(offset: boolean) {
  return once(`nand-floor:${offset}`, () => {
    const maps = painted("ssd-nand-floorplan", NAND_DIE.w, NAND_DIE.h, 190, { color: "#14161c", rough: 0.2, metal: 0.6, height: 0.5 }, (p) =>
      paintNandDie(p, true),
    );
    return new MeshPhysicalMaterial({
      map: maps.map,
      roughnessMap: maps.rmMap,
      metalnessMap: maps.rmMap,
      roughness: 1,
      metalness: 1,
      iridescence: 0.35,
      iridescenceIOR: 1.7,
      iridescenceThicknessRange: [220, 600],
      polygonOffset: offset,
      polygonOffsetFactor: offset ? -1 : 0,
      polygonOffsetUnits: offset ? -2 : 0,
    });
  });
}

// ---------------------------------------------------------------------------
// The 3D NAND cut-away (block-local mm, origin at the bottom of the front face)
// ---------------------------------------------------------------------------

/** Dimensions of the magnified 3D NAND block. */
export const B3D = (() => {
  const layers = 28; // 2 source-select + 24 word lines + 2 drain-select
  const ox = 0.42;
  const gate = 0.5;
  const pitch = ox + gate;
  const cmosH = 2.4;
  const srcH = 0.8;
  const base = cmosH + srcH;
  const stackTop = base + layers * pitch;
  const capTop = stackTop + 1.24;
  // Channel holes: staggered rows 3.6 mm apart along X, 2 mm apart in Z. The
  // front face (z = 8) cuts row 0 through its axes; the right face (x = 12.6)
  // cuts the odd rows through theirs.
  const pitchX = 3.6;
  const x0 = -12.6;
  const x1 = 12.6;
  const zBack = -7.6;
  const zSlit = -7.25;
  const zFront = 8;
  const stepW = 0.45;
  const xLeft = (k: number) => x0 - (layers - 1 - k) * stepW;
  const gateY = (k: number) => base + k * pitch + ox;
  const channels: [number, number, number][] = []; // x, z, row
  for (let r = 0; r < 8; r++) {
    const z = zFront - 2 * r;
    const xs = r % 2 === 0 ? -10.8 : -9.0;
    for (let i = 0; i < 7; i++) channels.push([xs + pitchX * i, z, r]);
  }
  return {
    layers,
    ox,
    gate,
    pitch,
    cmosH,
    srcH,
    base,
    stackTop,
    capTop,
    x0,
    x1,
    zBack,
    zSlit,
    zFront,
    stepW,
    xLeft,
    gateY,
    channels,
    chanY0: base - 0.4,
    chanY1: stackTop + 0.55,
    isSelect: (k: number) => k < 2 || k >= layers - 2,
  };
})();

const onFront = (row: number) => row === 0;
const onRight = (x: number, row: number) => row % 2 === 1 && Math.abs(x - B3D.x1) < 0.01;

/** Programmed level (0…7) of the cell at channel `c`, word line `k`. */
function cellLevel(c: number, k: number) {
  const r = rng(c * 131 + k * 17 + 7);
  r();
  return Math.floor(r() * 8);
}

/** Erased cells stay dim slate; each extra level of trapped charge glows warmer. */
const LEVEL_COLORS = Array.from({ length: 8 }, (_, L) => new Color("#2c3a4c").lerp(new Color("#ffc65a"), Math.pow(L / 7, 0.85)));

function CellsMesh() {
  const ref = useRef<InstancedMesh>(null);
  const width = CHANNEL.blocking - CHANNEL.tunnel;
  const geo = cached("3d-cell", () => new BoxGeometry(width, B3D.gate * 0.96, 0.03));
  const cells = useMemo(() => {
    const out: { x: number; y: number; z: number; rotY: number; level: number }[] = [];
    const off = (CHANNEL.blocking + CHANNEL.tunnel) / 2;
    B3D.channels.forEach(([x, z, row], ci) => {
      const front = onFront(row);
      if (!front && !onRight(x, row)) return;
      for (let k = 2; k < B3D.layers - 2; k++) {
        const y = B3D.gateY(k) + B3D.gate / 2;
        const level = cellLevel(ci, k);
        for (const s of [-1, 1]) {
          if (front) out.push({ x: x + s * off, y, z: B3D.zFront + 0.016, rotY: 0, level });
          else out.push({ x: B3D.x1 + 0.016, y, z: z + s * off, rotY: Math.PI / 2, level });
        }
      }
    });
    return out;
  }, []);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    cells.forEach((c, i) => {
      dummy.position.set(c.x, c.y, c.z);
      dummy.rotation.set(0, c.rotY, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      m.setColorAt(i, LEVEL_COLORS[c.level]);
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
    m.computeBoundingBox();
  }, [cells]);
  return <instancedMesh ref={ref} args={[geo, M.cells(), cells.length]} />;
}
function channelStripGeometry() {
  return cached("3d-strips", () => {
    const m = new Mesher();
    const w = CHANNEL.r;
    const y0 = B3D.chanY0;
    const y1 = B3D.chanY1;
    for (const [x, z, row] of B3D.channels) {
      if (onFront(row)) {
        const zf = B3D.zFront + 0.008;
        m.quad([x - w, y0, zf], [x + w, y0, zf], [x + w, y1, zf], [x - w, y1, zf], [0, 0, 1]);
      } else if (onRight(x, row)) {
        const xf = B3D.x1 + 0.008;
        m.quad([xf, y0, z + w], [xf, y0, z - w], [xf, y1, z - w], [xf, y1, z + w], [1, 0, 0]);
      }
    }
    return m.build();
  });
}

const unitBox = () => cached("unit-box", () => new BoxGeometry(1, 1, 1));

/**
 * The magnified cut-away of the memory array (one erase block's worth of
 * strings), authored at its final place and size; <NandDeepDive> grows it
 * out of the highlighted erase block on the magnified die.
 */
export function NandArray3D() {
  const B = B3D;
  const data = useMemo(() => {
    const depth = B.zFront - B.zSlit;
    const zc = (B.zFront + B.zSlit) / 2;
    const wl: number[][] = [];
    const sg: number[][] = [];
    const ox: number[][] = [];
    for (let k = 0; k < B.layers; k++) {
      const xl = B.xLeft(k);
      const len = B.x1 - xl;
      const cx = (xl + B.x1) / 2;
      ox.push([cx, B.base + k * B.pitch + B.ox / 2, zc, len, B.ox, depth]);
      (B.isSelect(k) ? sg : wl).push([cx, B.gateY(k) + B.gate / 2, zc, len, B.gate, depth]);
    }
    const left = B.xLeft(0) - 0.5;
    const full = B.x1 - left;
    // One bit line over every channel column (staggered rows interleave).
    const bitLines: number[][] = [];
    for (let x = -10.8; x <= B.x1 + 1e-6; x += 1.8) {
      bitLines.push([x, B.capTop + 0.22, (B.zBack + B.zFront) / 2 + 0.2, 0.62, 0.44, B.zFront - B.zBack + 0.4]);
    }
    // Staircase contacts: one tungsten plug per layer, landing on its step.
    const plugs: number[][] = [];
    const pads: number[][] = [];
    for (let k = 0; k < B.layers; k++) {
      const x = B.xLeft(k) + B.stepW / 2;
      const yb = B.gateY(k) + B.gate;
      const h = B.capTop - yb;
      const z = k % 2 === 0 ? 2.2 : -1.6;
      plugs.push([x, yb + h / 2, z, 0.3, h, 0.3]);
      pads.push([x, B.capTop + 0.08, z, 0.44, 0.16, 1.0]);
    }
    return { wl, sg, ox, left, full, bitLines, plugs, pads };
  }, [B]);

  const capMats = useMemo(() => {
    const w = B.x1 - B.x0;
    const d = B.zFront - B.zSlit;
    const top = texturedMaterial("3d-cap-top", w, d, 24, (p) =>
      paintCapTop(
        p,
        w,
        d,
        B.x0,
        B.zSlit,
        B.channels.map(([x, z]) => [x, z]),
        [B.zBack, B.zSlit],
      ),
    );
    const o = M.oxide();
    return [o, o, top, o, o, o];
  }, [B]);
  const stripMat = texturedMaterial("3d-strip", CHANNEL.r * 2, B.chanY1 - B.chanY0, 40, (p) => paintChannelStrip(p, B.chanY1 - B.chanY0));
  const cmosMat = texturedMaterial("3d-cmos", data.full, B.cmosH, 30, (p) => paintCmosFace(p, data.full, B.cmosH), {
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const cmosFace = cached("3d-cmos-face", () => {
    const m = new Mesher();
    const z = B.zFront + 0.006;
    m.quad([data.left, 0, z], [B.x1, 0, z], [B.x1, B.cmosH, z], [data.left, B.cmosH, z], [0, 0, 1]);
    return m.build();
  });
  const zMid = (B.zBack + B.zFront) / 2;
  const depthAll = B.zFront - B.zBack;
  const capW = B.x1 - B.x0;
  const T = 1.75;
  const show: [number, number] = [0.95, 1];
  const L = -38;

  const b = DEEP.block;
  return (
    <Part id="nand-3d" position={b.at}>
      <group scale={b.scale}>
        {/* Oxide between the layers, and the capping oxide with the channel tops. */}
        <Boxes items={data.ox} material={M.oxide()} />
        <mesh geometry={unitBox()} material={capMats} position={[(B.x0 + B.x1) / 2, (B.stackTop + B.capTop) / 2, (B.zSlit + B.zFront) / 2]} scale={[capW, B.capTop - B.stackTop, B.zFront - B.zSlit]} castShadow receiveShadow />

        <Part id="word-lines">
          <Boxes items={data.wl} material={M.tungsten()} />
          <Callout at={[-9.0, B.gateY(16) + 0.25, B.zFront]} label={[L, B.gateY(20), 9]} text={"Word lines · 24 shown\n(200+ in a real chip)"} size={T} range={show} align="right" />
        </Part>
        <Part id="select-gates">
          <Boxes items={data.sg} material={M.selectGate()} />
          <Callout at={[-9.0, B.gateY(27) + 0.25, B.zFront]} label={[L, B.capTop + 3.5, 9]} text="Select gates" size={T} range={show} align="right" />
        </Part>
        <Part id="channel-strings">
          <mesh geometry={channelStripGeometry()} material={stripMat} />
          <Callout at={[-3.6, B.gateY(4), B.zFront]} label={[-14, -4.5, 15]} text={"Vertical channel = one NAND string"} size={T} range={show} align="right" />
        </Part>
        <Part id="charge-trap-cells">
          <CellsMesh />
          <Callout at={[7.915, B.gateY(3) + 0.25, B.zFront + 0.03]} label={[9, -8.5, 15]} text={"Charge-trap cells (glow = stored level)"} size={T} range={show} />
        </Part>
        <Part id="bit-lines">
          <Boxes items={data.bitLines} material={MAT.copper} />
          <Callout at={[5.4, B.capTop + 0.45, 3]} label={[8, B.capTop + 7, 4]} text="Bit lines" size={T} range={show} />
        </Part>
        <Part id="wl-staircase">
          <Boxes items={data.plugs} material={M.tungsten()} />
          <Boxes items={data.pads} material={MAT.copper} />
          <Callout at={[B.xLeft(5) + 0.2, B.gateY(5) + 0.6, 2.2]} label={[L, B.gateY(8), 9]} text={"Staircase contacts"} size={T} range={show} align="right" />
        </Part>
        <Part id="source-line">
          <mesh geometry={unitBox()} material={M.poly()} position={[(data.left + B.x1) / 2, B.cmosH + B.srcH / 2, zMid]} scale={[data.full, B.srcH, depthAll]} castShadow receiveShadow />
          <mesh geometry={unitBox()} material={M.tungsten()} position={[(data.left + B.x1) / 2, (B.base + B.capTop) / 2, (B.zBack + B.zSlit) / 2]} scale={[data.full, B.capTop - B.base, B.zSlit - B.zBack]} castShadow receiveShadow />
          <Callout at={[-24, B.cmosH + B.srcH / 2, B.zFront]} label={[L, B.cmosH + 2.6, 9]} text="Source line" size={T} range={show} align="right" />
        </Part>
        <Part id="cmos-under-array">
          <mesh geometry={unitBox()} material={M.silicon()} position={[(data.left + B.x1) / 2, B.cmosH / 2, zMid]} scale={[data.full, B.cmosH, depthAll]} castShadow receiveShadow />
          <mesh geometry={cmosFace} material={cmosMat} />
          <Callout at={[-20, 0.9, B.zFront]} label={[L, -1.5, 9]} text={"CMOS logic under the array"} size={T} range={show} align="right" />
        </Part>
        <NandString />
        <Anchor name="block-0" position={[B.x0, B.capTop, B.zSlit]} />
        <Anchor name="block-1" position={[B.x1, B.capTop, B.zSlit]} />
        <Anchor name="block-2" position={[B.x1, B.capTop, B.zFront]} />
        <Anchor name="block-3" position={[B.x0, B.capTop, B.zFront]} />
      </group>
    </Part>
  );
}

// ---------------------------------------------------------------------------
// One string pulled out of the array and cut open
// ---------------------------------------------------------------------------

function stringGeometries() {
  return memo("3d-string", () => {
    const A0 = Math.PI / 2;
    const DA = Math.PI * 1.5;
    const B = B3D;
    const top = (k: number) => B.gateY(k) - B.chanY0;
    const gTop = top(B.layers - 1) + B.gate;
    const C = CHANNEL;
    const mk = (r0: number, r1: number, h: number) => {
      const m = new Mesher();
      sector(m, r0, r1, 0, h, A0, DA, 32);
      return m.build();
    };
    const shells = {
      blocking: mk(C.nitride, C.blocking, gTop + 0.25),
      nitride: mk(C.tunnel, C.nitride, gTop + 0.8),
      tunnel: mk(C.poly, C.tunnel, gTop + 1.25),
      channel: mk(C.core, C.poly, gTop + 1.75),
      core: mk(0, C.core, gTop + 1.45),
    };
    const wl = new Mesher();
    const sg = new Mesher();
    for (let k = 0; k < B.layers; k++) {
      sector(B.isSelect(k) ? sg : wl, C.blocking, C.blocking + 0.55, top(k), top(k) + B.gate, A0, DA, 32);
    }
    return { shells, wl: wl.build(), sg: sg.build() };
  });
}

/** TLC level stored in each cell of the pulled-out string (word lines 2…25). */
const stringLevel = (k: number) => (k * 5 + 3) % 8;

function Electrons() {
  const ref = useRef<InstancedMesh>(null);
  const geo = cached("3d-electron", () => new SphereGeometry(0.055, 10, 8));
  const pts = useMemo(() => {
    const out: Vec3[] = [];
    const B = B3D;
    const C = CHANNEL;
    const rMid = (C.nitride + C.tunnel) / 2;
    for (let k = 2; k < B.layers - 2; k++) {
      const level = stringLevel(k);
      const y0 = B.gateY(k) - B.chanY0 + 0.07;
      for (let e = 0; e < level; e++) {
        const y = y0 + (e % 4) * 0.115;
        const dr = (Math.floor(e / 4) - 0.5) * 0.065;
        // Alternate between the two cut faces of the open wedge.
        if (k % 2 === 0) out.push([0.07, y, rMid + dr]);
        else out.push([rMid + dr, y, 0.07]);
      }
    }
    return out;
  }, []);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    pts.forEach(([x, y, z], i) => {
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
    m.computeBoundingBox();
  }, [pts]);
  return <instancedMesh ref={ref} args={[geo, M.electron(), pts.length]} />;
}

function NandString() {
  const g = stringGeometries();
  const s = DEEP.string;
  // Height of word line k in the Part's frame (the string is scaled about its base).
  const yAt = (k: number) => B3D.chanY0 + s.scale * (B3D.gateY(k) + B3D.gate / 2 - B3D.chanY0);
  return (
    <Part id="nand-string" position={s.from} explode={[s.to[0] - s.from[0], s.to[1] - s.from[1], s.to[2] - s.from[2]]} explodeRange={s.range}>
      <group scale={s.scale} position-y={B3D.chanY0}>
        <group>
          <mesh geometry={g.shells.blocking} material={M.oxide()} castShadow receiveShadow />
          <mesh geometry={g.shells.nitride} material={M.nitride()} castShadow receiveShadow />
          <mesh geometry={g.shells.tunnel} material={M.tunnel()} castShadow receiveShadow />
          <mesh geometry={g.shells.channel} material={M.channel()} castShadow receiveShadow />
          <mesh geometry={g.shells.core} material={M.core()} castShadow receiveShadow />
          <mesh geometry={g.wl} material={M.tungsten()} castShadow receiveShadow />
          <mesh geometry={g.sg} material={M.selectGate()} castShadow receiveShadow />
        </group>
        <Part id="trapped-charge">
          <Electrons />
          <Callout at={[0.07, B3D.gateY(13) - B3D.chanY0 + 0.25, 0.65]} label={[3.4, B3D.gateY(10) - B3D.chanY0, 1.2]} text={"Trapped electrons\n(more = higher level)"} size={1.75 / s.scale} range={[0.97, 1]} />
        </Part>
      </group>
      <Callout at={[0.9, yAt(23), 0.9]} label={[5.5, yAt(26) + 2.5, 2]} text={"One string, cut open"} size={1.75} range={[0.97, 1]} />
    </Part>
  );
}

// ---------------------------------------------------------------------------
// The magnified die and its regions
// ---------------------------------------------------------------------------

const SLAB_T = 0.16;

/** Where the deep-dive views come from and go to, in world coordinates. */
function deepPoses() {
  return memo("ssd-deep-poses", () => {
    const d = DEEP.die;
    const F = NAND_FLOOR;
    const k = STACK.dies - 1;
    const stackTop: Vec3 = [DEEP.pkgAt[0], DEEP.pkgAt[1] + dieY(k) + STACK.dieT / 2, DEEP.pkgAt[2] + dieZ(k)];
    const blockCenter = new Vector3(F.block.x + F.block.w / 2 - NAND_DIE.w / 2, SLAB_T / 2, F.block.y + F.block.h / 2 - NAND_DIE.h / 2);
    const eraseBlock = blockCenter.multiplyScalar(d.mag).applyEuler(new Euler(...d.tilt)).add(new Vector3(...d.at));
    // While collapsed, both views wait inside package U4 on the assembled drive.
    const park: Vec3 = [NANDS[1].x, DRIVE_Y + 0.8, NANDS[1].z];
    return { stackTop, eraseBlock: eraseBlock.toArray() as Vec3, park };
  });
}

/**
 * The top die of the opened package, magnified and tilted toward the viewer
 * as a labelled floorplan. Regions are separate meshes over one texture so
 * each can be selected; the erase block is where the 3D cut-away comes from.
 */
export function MagnifiedDie() {
  const F = NAND_FLOOR;
  const W = NAND_DIE.w;
  const H = NAND_DIE.h;
  const geos = useMemo(() => {
    const y = SLAB_T / 2 + 0.0015;
    return {
      base: regionQuads([{ x: 0, y: 0, w: W, h: H }], W, H, SLAB_T / 2),
      planes: regionQuads(F.planes, W, H, y),
      pageBuffers: regionQuads(F.pageBuffers, W, H, y),
      decoders: regionQuads([F.rowDecoders], W, H, y),
      pumps: regionQuads([F.pumps], W, H, y),
      periphery: regionQuads([F.logic, F.regs, F.pads], W, H, y),
      block: regionQuads([F.block], W, H, y + 0.0015),
      page: regionQuads([F.page], W, H, y + 0.003),
    };
  }, [F, W, H]);
  const edge = variant("ssd-die-edge-mag", MAT.silicon, { iridescence: 0.1, roughness: 0.3, color: "#3a3e48" });
  const top = floorplanMaterial(false);
  const over = floorplanMaterial(true);
  const d = DEEP.die;
  const slabTop = SLAB_T / 2;
  const blk = F.block;
  return (
    <Part id="nand-die" position={d.at} rotation={d.tilt}>
      <group scale={d.mag}>
        {corners(W, H).map(([x, z], i) => (
          <Anchor key={i} name={`die-${i}`} position={[x, slabTop, z]} />
        ))}
        {[
          [blk.x, blk.y],
          [blk.x + blk.w, blk.y],
          [blk.x + blk.w, blk.y + blk.h],
          [blk.x, blk.y + blk.h],
        ].map(([x, y], i) => (
          <Anchor key={i} name={`eblock-${i}`} position={[x - W / 2, slabTop, y - H / 2]} />
        ))}
        <mesh geometry={cached("ssd-mag-slab", () => new BoxGeometry(W, SLAB_T, H))} material={edge} castShadow receiveShadow />
        <mesh geometry={geos.base} material={top} />
        <Part id="memory-planes">
          <mesh geometry={geos.planes} material={over} />
        </Part>
        <Part id="page-buffers">
          <mesh geometry={geos.pageBuffers} material={over} />
        </Part>
        <Part id="row-decoders">
          <mesh geometry={geos.decoders} material={over} />
        </Part>
        <Part id="charge-pumps">
          <mesh geometry={geos.pumps} material={over} />
        </Part>
        <Part id="nand-periphery">
          <mesh geometry={geos.periphery} material={over} />
        </Part>
        <Part id="erase-block">
          <mesh geometry={geos.block} material={over} />
          <Part id="flash-page">
            <mesh geometry={geos.page} material={over} />
          </Part>
        </Part>
      </group>
    </Part>
  );
}

const DIE_IDS = ["inside-nand", "nand-die", "memory-planes", "page-buffers", "row-decoders", "charge-pumps", "nand-periphery", "erase-block", "flash-page"];
const ARRAY_IDS = [
  "nand-3d",
  "word-lines",
  "select-gates",
  "channel-strings",
  "charge-trap-cells",
  "bit-lines",
  "wl-staircase",
  "source-line",
  "cmos-under-array",
  "nand-string",
  "trapped-charge",
];

/**
 * "Inside the flash": near full explode a copy of U4's top die grows out of
 * the opened package into a magnified floorplan, then the highlighted erase
 * block grows into the 3D cut-away of the array. Picking any of these parts
 * from the tree while the drive is assembled opens the exploded view first.
 */
export function NandDeepDive() {
  useAutoExplode("inside-nand");
  const p = deepPoses();
  return (
    <Part id="inside-nand">
      <ParkedReveal from={p.stackTop} park={p.park} range={DEEP.die.range} partIds={DIE_IDS}>
        <MagnifiedDie />
      </ParkedReveal>
      <ParkedReveal from={p.eraseBlock} park={p.park} range={DEEP.block.range} partIds={ARRAY_IDS}>
        <NandArray3D />
      </ParkedReveal>
    </Part>
  );
}

/** Corners (x, z) of a W × H rectangle centred on the origin, in loop order. */
function corners(W: number, H: number): [number, number][] {
  return [
    [-W / 2, -H / 2],
    [W / 2, -H / 2],
    [W / 2, H / 2],
    [-W / 2, H / 2],
  ];
}
