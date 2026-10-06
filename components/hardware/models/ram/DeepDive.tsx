"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  Matrix4,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Group,
  type Material,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { FONT_SANS, painted } from "@/lib/three/painter";
import { isWithin, useExplorer } from "@/lib/hardware/store";
import { explodeProgress } from "../../explode";
import { partObjects } from "../../sceneState";
import { Part } from "../../Part";
import { cached, roundedBox } from "../../kit/geometry";
import { MAT, emissive, variant } from "../../kit/materials";
import {
  BANK_GROUPS,
  BANK_LAYOUT,
  BANK_VIEW,
  BANKS,
  DIE,
  PERIPHERY,
  SPINE,
  padPositions,
  paintBank,
  paintLogic,
  paintMat,
  type Rect,
} from "./dieArt";
import { Instances } from "./Instances";
import { OPEN_DIE_FINAL, OPEN_DIE_SIZE, dieFaceMaterial } from "./RamBoard";
import { Tag, type TagKey } from "./tags";

type Vec3 = [number, number, number];

// ---------------------------------------------------------------------------
// Placement of the three magnified views (world mm, fully exploded)
// ---------------------------------------------------------------------------

/** The posters lean back so they face a camera looking down at the module. */
const TILT = -0.34;
const DIE_POS: Vec3 = [-76, 82, -12];
const BANK_POS: Vec3 = [-8, 80, -12];
const CELL_POS: Vec3 = [68, 66, -8];
const CELL_ROT: Vec3 = [0, 0, 0];

/** Die view: real die millimetres × 5. */
const DS = 5;
const DV = { w: DIE.w * DS, h: DIE.h * DS, t: 1.2 };
/** Bank magnified in the bank view (bank group 5, bank 1) and the mat shown as cells. */
const ZOOM_BANK = 5 * 4 + 1;
const ZOOM_MAT = 5 * BANK_VIEW.cols + 4;

/** Real die rect (canvas coords, mm) → die-view centre/size (local XY). */
function dieRect(r: Rect) {
  return {
    x: (r.x + r.w / 2 - DIE.w / 2) * DS,
    y: (DIE.h / 2 - (r.y + r.h / 2)) * DS,
    w: r.w * DS,
    h: r.h * DS,
  };
}

/** Bank-view rect (bank units, y up) → local XY centred on the bank. */
function bankRect(r: Rect) {
  return { x: r.x + r.w / 2 - BANK_VIEW.w / 2, y: r.y + r.h / 2 - BANK_VIEW.h / 2, w: r.w, h: r.h };
}

const ONE = new Vector3(1, 1, 1);
function frame(pos: Vec3, rot: Vec3) {
  return new Matrix4().compose(new Vector3(...pos), new Quaternion().setFromEuler(new Euler(...rot)), ONE);
}
const DIE_M = frame(DIE_POS, [TILT, 0, 0]);
const BANK_M = frame(BANK_POS, [TILT, 0, 0]);
const CELL_M = frame(CELL_POS, CELL_ROT);
const world = (m: Matrix4, x: number, y: number, z: number) => new Vector3(x, y, z).applyMatrix4(m);

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function boxAt(w: number, h: number, d: number, x: number, y: number, z: number) {
  const b = new BoxGeometry(w, h, d);
  b.translate(x, y, z);
  return b;
}

/** Thin rectangular frame (outline) in the XY plane, used to mark a zoom source. */
function rimGeometry(key: string, w: number, h: number, t: number, depth: number) {
  return cached(key, () =>
    mergeGeometries([
      boxAt(w + 2 * t, t, depth, 0, h / 2 + t / 2, 0),
      boxAt(w + 2 * t, t, depth, 0, -h / 2 - t / 2, 0),
      boxAt(t, h, depth, -w / 2 - t / 2, 0, 0),
      boxAt(t, h, depth, w / 2 + t / 2, 0, 0),
    ])!,
  );
}

/** Box whose +Z face carries `top` and every other face `side`. */
function topMats(top: Material, side: Material): Material[] {
  return [side, side, side, side, top, side];
}

const texMats = new Map<string, MeshPhysicalMaterial>();
/** Material from a painted texture (cached by key). */
function paintedMat(key: string, w: number, h: number, ppm: number, paint: Parameters<typeof painted>[5]) {
  let m = texMats.get(key);
  if (m) return m;
  const maps = painted(key, w, h, ppm, { color: "#191c24", rough: 0.2, metal: 0.6, height: 0.5 }, paint);
  m = new MeshPhysicalMaterial({
    map: maps.map,
    roughnessMap: maps.rmMap,
    metalnessMap: maps.rmMap,
    bumpMap: maps.bumpMap,
    bumpScale: 0.2,
    roughness: 1,
    metalness: 1,
    iridescence: 0.2,
    iridescenceIOR: 1.6,
    iridescenceThicknessRange: [260, 600],
  });
  texMats.set(key, m);
  return m;
}

const dieEdge = () => variant("ram-die-edge", MAT.silicon, { color: "#3a3f4a", roughness: 0.3, iridescence: 0 });
const blockSide = () => variant("ram-block-side", MAT.silicon, { color: "#4a515c", roughness: 0.4, metalness: 0.35, iridescence: 0 });

// ---------------------------------------------------------------------------
// Die view
// ---------------------------------------------------------------------------

const bankTopMat = () => paintedMat("ram-bank-top", BANK_VIEW.w, BANK_VIEW.h, 16, (p) => paintBank(p, 0, 0, BANK_VIEW.w, BANK_VIEW.h, 5, 0.12));
const logicMat = (hue: number, seed: number) =>
  paintedMat(`ram-logic:${hue}`, 2, 14, 40, (p) => paintLogic(p, 0, 0, 2, 14, hue, 0.16, seed, 900));

const BG_HUES = [205, 160, 45, 330, 270, 15, 120, 185];

/** Coloured rims marking the eight bank groups (vertex colours, one draw call). */
function bankGroupRims() {
  return cached("ram-bg-rims", () => {
    const parts: BufferGeometry[] = [];
    BANK_GROUPS.forEach((g, i) => {
      const r = dieRect(g);
      const t = 0.32;
      const z = DV.t / 2 + 0.2;
      const pieces = [
        boxAt(r.w + 2 * t, t, 0.4, r.x, r.y + r.h / 2 + t / 2, z),
        boxAt(r.w + 2 * t, t, 0.4, r.x, r.y - r.h / 2 - t / 2, z),
        boxAt(t, r.h, 0.4, r.x - r.w / 2 - t / 2, r.y, z),
        boxAt(t, r.h, 0.4, r.x + r.w / 2 + t / 2, r.y, z),
      ];
      const c = new Color().setHSL(BG_HUES[i] / 360, 0.75, 0.55);
      for (const b of pieces) {
        const n = b.getAttribute("position").count;
        const col = new Float32Array(n * 3);
        for (let k = 0; k < n; k++) col.set([c.r, c.g, c.b], k * 3);
        b.setAttribute("color", new Float32BufferAttribute(col, 3));
        parts.push(b);
      }
    });
    return mergeGeometries(parts)!;
  });
}

let rimMat: MeshStandardMaterial | null = null;
const rimMaterial = () => (rimMat ??= new MeshStandardMaterial({ vertexColors: true, metalness: 0.45, roughness: 0.35 }));

function DieView() {
  const banks = useMemo(() => {
    const geo = cached("ram-dv-bank", () => {
      const b = BANKS[0];
      return new BoxGeometry(b.w * DS, b.h * DS, 0.5);
    });
    const matrices = BANKS.map((b) => {
      const r = dieRect(b);
      return new Matrix4().makeTranslation(r.x, r.y, DV.t / 2 + 0.25);
    });
    return { geo, matrices };
  }, []);
  const pads = useMemo(
    () => padPositions().map(([u, v]) => new Matrix4().makeTranslation((u - DIE.w / 2) * DS, (DIE.h / 2 - v) * DS, DV.t / 2 + 0.36)),
    [],
  );
  const spine = (u0: number, u1: number, key: keyof typeof PERIPHERY) => {
    const { y0, y1 } = PERIPHERY[key];
    return dieRect({ x: u0, y: y0, w: u1 - u0, h: y1 - y0 });
  };
  const lx0 = SPINE.x0 + 0.02;
  const rx0 = SPINE.x1 - 0.02 - SPINE.logicW;
  const logicBlock = (key: keyof typeof PERIPHERY, hue: number, seed: number) =>
    [lx0, rx0].map((u, i) => {
      const r = spine(u, u + SPINE.logicW, key);
      return (
        <mesh key={i} geometry={roundedBox(r.w, r.h, 0.5, 0.08, 1)} material={topMats(logicMat(hue + i * 12, seed + i), dieEdge())} position={[r.x, r.y, DV.t / 2 + 0.25]} castShadow receiveShadow />
      );
    });
  const zb = dieRect(BANKS[ZOOM_BANK]);
  const top = DV.h / 2;
  return (
    <Part id="die-view" position={DIE_POS} rotation={[TILT, 0, 0]}>
      <mesh geometry={roundedBox(DV.w, DV.h, DV.t, 0.3, 2)} material={topMats(dieFaceMaterial(), dieEdge())} castShadow receiveShadow />
      <Tag k="dieTitle" at={[0, top + 2.2, 1]} scale={1.15} />
      <Part id="bank-groups">
        <mesh geometry={bankGroupRims()} material={rimMaterial()} castShadow />
        {BANK_GROUPS.map((g) => {
          const r = dieRect(g);
          const left = g.bg < 4;
          return <Tag key={g.bg} k={`bg${g.bg}` as TagKey} at={[left ? -DV.w / 2 - 8 : DV.w / 2 + 8, r.y - 1.2, 0.8]} to={[left ? -DV.w / 2 + 0.4 : DV.w / 2 - 0.4, r.y, 0.8]} scale={0.95} />;
        })}
        <Part id="banks">
          <Instances geometry={banks.geo} material={topMats(bankTopMat(), dieEdge())} matrices={banks.matrices} />
          <mesh geometry={rimGeometry("ram-zoom-bank-rim", zb.w + 0.1, zb.h + 0.1, 0.22, 0.25)} material={emissive("#7dd3fc", 1.2)} position={[zb.x, zb.y, DV.t / 2 + 0.6]} />
          <Tag k="bank" at={[DV.w / 2 + 11, zb.y + 1.8, 1]} to={[zb.x + zb.w / 2, zb.y + 0.8, DV.t / 2 + 0.6]} />
        </Part>
      </Part>
      <Part id="periphery">
        <Part id="cmd-logic">
          {logicBlock("cmd", 186, 3)}
          <Tag k="cmd" at={[0, top - 4, 6]} to={[1.9, spine(rx0, rx0 + SPINE.logicW, "cmd").y + 4, DV.t / 2 + 0.5]} />
        </Part>
        <Part id="io-pads">
          {logicBlock("data", 28, 5)}
          <mesh geometry={roundedBox(2.0, DIE.h * DS - 1.4, 0.22, 0.06, 1)} material={variant("ram-io-strip", MAT.substrate, { color: "#2b2f3a", roughness: 0.35, metalness: 0.4 })} position={[0, 0, DV.t / 2 + 0.11]} />
          <Instances geometry={cached("ram-pad", () => new BoxGeometry(0.42, 0.42, 0.12))} material={MAT.gold} matrices={pads} />
          <Tag k="io" at={[0, 3.6, 7]} to={[0.3, 0.2, DV.t / 2 + 0.4]} />
        </Part>
        <Part id="ecc-engine">
          {logicBlock("ecc", 290, 9)}
          <Tag k="ecc" at={[0, -top + 7.5, 6]} to={[1.9, spine(rx0, rx0 + SPINE.logicW, "ecc").y - 3, DV.t / 2 + 0.5]} />
        </Part>
      </Part>
    </Part>
  );
}

// ---------------------------------------------------------------------------
// Bank view
// ---------------------------------------------------------------------------

const matTopMat = () => {
  const L = BANK_LAYOUT.mats[0];
  return paintedMat("ram-mat-top", L.w, L.h, 60, (p) => paintMat(p, L.w, L.h));
};
const decoderMat = (key: string, w: number, h: number, hue: number, seed: number) =>
  paintedMat(`ram-dec:${key}`, w, h, 24, (p) => paintLogic(p, 0, 0, w, h, hue, 0.35, seed, 1400));

function stripsGeometry(key: string, rects: Rect[], depth: number) {
  return cached(key, () =>
    mergeGeometries(
      rects.map((r) => {
        const b = bankRect(r);
        return boxAt(b.w, b.h, depth, b.x, b.y, depth / 2);
      }),
    )!,
  );
}

function BankView() {
  const L = BANK_LAYOUT;
  const base = 0.5;
  const mats = useMemo(
    () => L.mats.map((r) => {
      const b = bankRect(r);
      return new Matrix4().makeTranslation(b.x, b.y, base + 0.3);
    }),
    [L],
  );
  const zm = bankRect(L.mats[ZOOM_MAT]);
  const row = bankRect(L.rowDec);
  const col = bankRect(L.colDec);
  const ctrl = bankRect(L.ctrl);
  const saMat = variant("ram-sa", MAT.gold, { color: "#c9a447", roughness: 0.38, metalness: 0.75 });
  const swdMat = variant("ram-swd", MAT.aluminum, { color: "#5fa7b8", roughness: 0.35, metalness: 0.55 });
  const hw = BANK_VIEW.w / 2;
  const hh = BANK_VIEW.h / 2;
  return (
    <Part id="bank-view" position={BANK_POS} rotation={[TILT, 0, 0]}>
      <mesh geometry={roundedBox(BANK_VIEW.w + 1.2, BANK_VIEW.h + 1.2, 1.0, 0.3, 2)} material={dieEdge()} position-z={0} castShadow receiveShadow />
      <Tag k="bankTitle" at={[0, hh + 2.2, 1]} scale={1.1} />
      <Part id="mats">
        <Instances geometry={cached("ram-bv-mat", () => new BoxGeometry(L.mats[0].w, L.mats[0].h, 0.6))} material={topMats(matTopMat(), dieEdge())} matrices={mats} />
        <mesh geometry={rimGeometry("ram-zoom-mat-rim", zm.w + 0.1, zm.h + 0.1, 0.2, 0.3)} material={emissive("#7dd3fc", 1.2)} position={[zm.x, zm.y, base + 0.65]} />
        <Tag k="mats" at={[zm.x - 4, zm.y + 6.8, 5]} to={[zm.x - 1.2, zm.y + 0.6, base + 0.65]} />
      </Part>
      <Part id="sense-amps">
        <mesh geometry={stripsGeometry("ram-bv-sa", L.sa, 0.75)} material={saMat} position-z={base} castShadow receiveShadow />
        <Tag k="sa" at={[hw + 7, bankRect(L.sa[2]).y - 2, 3]} to={[hw - 1, bankRect(L.sa[2]).y, base + 0.75]} />
      </Part>
      <Part id="swd-strips">
        <mesh geometry={stripsGeometry("ram-bv-swd", L.swd, 0.7)} material={swdMat} position-z={base} castShadow receiveShadow />
        <Tag k="swd" at={[hw + 7, hh - 6, 3]} to={[bankRect(L.swd[5]).x, hh - 4.5, base + 0.7]} />
      </Part>
      <Part id="row-decoder">
        <mesh geometry={roundedBox(row.w, row.h, 0.95, 0.1, 1)} material={topMats(decoderMat("row", row.w, row.h, 168, 21), dieEdge())} position={[row.x, row.y, base + 0.47]} castShadow receiveShadow />
        <Tag k="rowDec" at={[-hw - 5.5, row.y + 4, 3]} to={[row.x - 1, row.y + 4, base + 0.95]} />
      </Part>
      <Part id="column-decoder">
        <mesh geometry={roundedBox(col.w, col.h, 0.95, 0.1, 1)} material={topMats(decoderMat("col", col.w, col.h, 18, 22), dieEdge())} position={[col.x, col.y, base + 0.47]} castShadow receiveShadow />
        <mesh geometry={roundedBox(ctrl.w, ctrl.h, 1.1, 0.1, 1)} material={topMats(decoderMat("ctrl", ctrl.w, ctrl.h, 300, 23), dieEdge())} position={[ctrl.x, ctrl.y, base + 0.55]} castShadow receiveShadow />
        <Tag k="colDec" at={[col.x + 2, -hh - 5.6, 3]} to={[col.x + 2, col.y - 0.4, base + 0.95]} />
      </Part>
    </Part>
  );
}

// ---------------------------------------------------------------------------
// Cell view — a patch of the array: 4 bit lines × 6 word lines, 20 cells
// ---------------------------------------------------------------------------

const BL_X = [-12, -4, 4, 12];
const WL_Z = [-11, -6.6, -2.2, 2.2, 6.6, 11];
const AA_DX = 4;
const AA_DZ = 4.4;
const OPEN_WL = 3;
const CAP = { r: 1.45, y0: 4.2, y1: 17.2 };
const SUB = { x: 17.4, z: 14.4, depth: 4 };

/** Active areas: each silicon island holds two cells sharing one bit-line contact. */
const ACTIVE_AREAS: { cx: number; cz: number; ends: [number, number][] }[] = (() => {
  const out: { cx: number; cz: number; ends: [number, number][] }[] = [];
  BL_X.forEach((x, j) => {
    for (let k = -1; k < WL_Z.length; k++) {
      if ((k & 1) !== (j & 1)) continue;
      const cz = -11 + 4.4 * k + 2.2;
      const ends: [number, number][] = [
        [x - AA_DX, cz - AA_DZ],
        [x + AA_DX, cz + AA_DZ],
      ];
      if (ends.every(([ex, ez]) => Math.abs(ex) < SUB.x - 0.8 && Math.abs(ez) < SUB.z - 0.6)) out.push({ cx: x, cz, ends });
    }
  });
  return out;
})();
const CELLS = ACTIVE_AREAS.flatMap((a) => a.ends);
/** Which capacitors hold a "1" (charged). */
const CHARGED = CELLS.map((_, i) => (i * 7 + 3) % 5 < 3);

let senseTop: MeshPhysicalMaterial | null = null;
/** Top of the sense-amplifier block: a latch symbol per bit line. */
function senseTopMaterial() {
  if (senseTop) return senseTop;
  const w = 2 * SUB.x;
  const h = 5.6;
  const maps = painted("ram-sense-top", w, h, 40, { color: "#1d2129", rough: 0.35, metal: 0.4, height: 0.5 }, (p) => {
    const ink = { color: "#e7c873", rough: 0.3, metal: 0.9, height: 0.6 };
    const dim = { color: "#8b93a3", rough: 0.4, metal: 0.4, height: 0.55 };
    BL_X.forEach((x) => {
      const cx = x + SUB.x;
      // two cross-coupled inverters (triangles with bubbles)
      for (const [dy, dir] of [
        [1.7, 1],
        [3.9, -1],
      ] as [number, number][]) {
        p.polygon(
          [
            [cx - 1.1 * dir, dy - 0.8],
            [cx - 1.1 * dir, dy + 0.8],
            [cx + 0.9 * dir, dy],
          ],
          ink,
        );
        p.circle(cx + 1.15 * dir, dy, 0.24, ink);
      }
      p.polyline(
        [
          [cx + 1.4, 1.7],
          [cx + 1.9, 1.7],
          [cx + 1.9, 3.9],
          [cx + 1.1, 3.9],
        ],
        0.12,
        ink,
      );
      p.polyline(
        [
          [cx - 1.4, 3.9],
          [cx - 1.9, 3.9],
          [cx - 1.9, 1.7],
          [cx - 1.1, 1.7],
        ],
        0.12,
        ink,
      );
      p.text("SA", cx + 2.7, 2.8, 0.9, dim, { align: "left", baseline: "middle", font: FONT_SANS, weight: 700 });
    });
  });
  senseTop = new MeshPhysicalMaterial({ map: maps.map, roughnessMap: maps.rmMap, metalnessMap: maps.rmMap, bumpMap: maps.bumpMap, bumpScale: 0.2, roughness: 1, metalness: 1 });
  return senseTop;
}

let cellMats: ReturnType<typeof makeCellMaterials> | null = null;

function makeCellMaterials() {
  return {
    /** Cut silicon on the sides, shallow-trench-isolation oxide on top. */
    sub: [
      variant("ram-cv-si", MAT.silicon, { color: "#525a66", roughness: 0.42, metalness: 0.3, iridescence: 0 }),
      new MeshPhysicalMaterial({ color: "#262d38", roughness: 0.55, metalness: 0.1 }),
    ],
    aa: variant("ram-cv-aa", MAT.silicon, { color: "#a3abb8", roughness: 0.32, metalness: 0.35, iridescence: 0.2 }),
    /** Titanium-nitride word lines (golden), tungsten bit lines and contacts. */
    wl: variant("ram-cv-wl", MAT.copper, { color: "#b48a4e", roughness: 0.32, metalness: 0.9 }),
    bl: variant("ram-cv-bl", MAT.steel, { color: "#ccd4de", roughness: 0.22 }),
    snc: variant("ram-cv-snc", MAT.steel, { color: "#7f8897", roughness: 0.4 }),
    capOff: variant("ram-cv-cap", MAT.nickel, { color: "#a29a88", roughness: 0.32 }),
    capOn: variant("ram-cv-cap-on", MAT.nickel, { color: "#a29a88", roughness: 0.32, emissive: new Color("#1d7fc0"), emissiveIntensity: 0.28 }),
    /** Inside of the cup-shaped capacitors: dark when empty, glowing when charged. */
    cup: new MeshBasicMaterial({ color: "#11151c" }),
    cupOn: new MeshBasicMaterial({ color: new Color("#5cc8ff").multiplyScalar(1.8), toneMapped: false }),
  };
}

/** Materials of the cell view (created once and shared). */
function cellMaterials() {
  cellMats ??= makeCellMaterials();
  return cellMats;
}

function CellView() {
  const geos = useMemo(() => {
    const aa = cached("ram-cv-aa", () =>
      mergeGeometries(
        ACTIVE_AREAS.map(({ cx, cz }) => {
          const len = Math.hypot(2 * AA_DX, 2 * AA_DZ) + 2.4;
          const b = roundedBox(len, 0.5, 1.7, 0.2, 1).clone();
          b.rotateY(-Math.atan2(2 * AA_DZ, 2 * AA_DX));
          b.translate(cx, 0.2, cz);
          return b;
        }),
      )!,
    );
    const wl = (indices: number[]) =>
      mergeGeometries(indices.map((k) => roundedBox(SUB.x * 2 + 4.6, 0.6, 1.3, 0.15, 1).clone().translate(-2.3, 0.62, WL_Z[k])))!;
    const bl = cached("ram-cv-bl", () =>
      mergeGeometries([
        ...BL_X.map((x) => roundedBox(1.2, 0.8, SUB.z * 2 + 4, 0.15, 1).clone().translate(x, 2.6, 2)),
        ...ACTIVE_AREAS.map(({ cx, cz }) => new CylinderGeometry(0.42, 0.42, 2.1, 12).toNonIndexed().translate(cx, 1.3, cz)),
      ])!,
    );
    const snc = cached("ram-cv-snc", () => mergeGeometries(CELLS.map(([x, z]) => new CylinderGeometry(0.5, 0.55, CAP.y0, 12).translate(x, CAP.y0 / 2 + 0.2, z)))!);
    const capGeo = cached("ram-cv-cap", () => new CylinderGeometry(CAP.r, CAP.r * 0.93, CAP.y1 - CAP.y0, 28, 1).translate(0, (CAP.y0 + CAP.y1) / 2, 0));
    const cupGeo = cached("ram-cv-cup", () => new CylinderGeometry(CAP.r * 0.72, CAP.r * 0.72, 0.06, 24).translate(0, CAP.y1 + 0.02, 0));
    return {
      aa,
      wl: cached("ram-cv-wl", () => wl(WL_Z.map((_, k) => k).filter((k) => k !== OPEN_WL))),
      wlOpen: cached("ram-cv-wl-open", () => wl([OPEN_WL])),
      bl,
      snc,
      capGeo,
      cupGeo,
    };
  }, []);
  const caps = useMemo(() => {
    const on: Matrix4[] = [];
    const off: Matrix4[] = [];
    CELLS.forEach(([x, z], i) => (CHARGED[i] ? on : off).push(new Matrix4().makeTranslation(x, 0, z)));
    return { on, off };
  }, []);
  const m = cellMaterials();
  const subMats: Material[] = [m.sub[0], m.sub[0], m.sub[1], m.sub[0], m.sub[0], m.sub[0]];
  // Example cells for the "1" and "0" tags: a charged one on the right edge,
  // an empty one left of centre (kept apart from the other labels).
  const on = CELLS.find(([x], i) => CHARGED[i] && x === 16) ?? CELLS[0];
  const off = CELLS.find(([x, z], i) => !CHARGED[i] && x === -8 && z > 0 && z < 8) ?? CELLS[1];
  return (
    <Part id="cell-view" position={CELL_POS} rotation={CELL_ROT}>
      <mesh geometry={roundedBox(SUB.x * 2, SUB.depth, SUB.z * 2, 0.3, 2)} material={subMats} position-y={-SUB.depth / 2} castShadow receiveShadow />
      <Tag k="cellTitle" at={[0, CAP.y1 + 7.5, -SUB.z]} scale={1.05} />
      <Part id="access-transistors">
        <mesh geometry={geos.aa} material={m.aa} castShadow receiveShadow />
        <Tag k="fet" at={[9, 3.5, SUB.z + 13]} to={[6, 0.6, WL_Z[5]]} />
      </Part>
      <Part id="word-lines">
        <mesh geometry={geos.wl} material={m.wl} castShadow receiveShadow />
        <mesh geometry={geos.wlOpen} material={emissive("#ff9a3c", 1.5)} castShadow />
        <Tag k="wl" at={[-SUB.x - 11, 1.5, SUB.z + 3]} to={[-SUB.x + 0.8, 0.95, WL_Z[5]]} />
        <Tag k="open" at={[-SUB.x - 13, 10, WL_Z[OPEN_WL]]} to={[-SUB.x + 0.8, 0.95, WL_Z[OPEN_WL]]} scale={0.95} />
      </Part>
      <Part id="bit-lines">
        <mesh geometry={geos.bl} material={m.bl} castShadow receiveShadow />
        <Tag k="bl" at={[SUB.x + 7, 5, SUB.z + 3]} to={[BL_X[3] + 0.4, 3.0, SUB.z - 1]} />
      </Part>
      <Part id="storage-capacitors">
        <mesh geometry={geos.snc} material={m.snc} castShadow />
        <Instances geometry={geos.capGeo} material={m.capOn} matrices={caps.on} />
        <Instances geometry={geos.capGeo} material={m.capOff} matrices={caps.off} />
        <Instances geometry={geos.cupGeo} material={m.cupOn} matrices={caps.on} />
        <Instances geometry={geos.cupGeo} material={m.cup} matrices={caps.off} />
        <Tag k="cap" at={[SUB.x + 8, CAP.y1 - 3, 0]} to={[16 + CAP.r, CAP.y1 - 4, 0]} />
        <Tag k="one" at={[on[0] + 0.5, CAP.y1 + 3.2, on[1]]} to={[on[0], CAP.y1 + 0.1, on[1]]} />
        <Tag k="zero" at={[off[0] - 1, CAP.y1 + 3.2, off[1]]} to={[off[0], CAP.y1 + 0.1, off[1]]} />
      </Part>
      <Part id="sense-amp">
        <mesh geometry={roundedBox(SUB.x * 2, 5.6, SUB.depth + 3.6, 0.3, 2)} material={topMats(senseTopMaterial(), blockSide())} position={[0, (3.6 - SUB.depth) / 2, SUB.z + 3.1]} rotation-x={-Math.PI / 2} castShadow receiveShadow />
        <Tag k="sense" at={[-9, 3.5, SUB.z + 13]} to={[-9, 3.7, SUB.z + 3.5]} />
      </Part>
      <Part id="wl-driver">
        <mesh geometry={roundedBox(5, SUB.z * 2, SUB.depth + 1.4, 0.3, 2)} material={topMats(decoderMat("wld", 5, SUB.z * 2, 168, 31), blockSide())} position={[-SUB.x - 2.6, (1.4 - SUB.depth) / 2, 0]} rotation-x={-Math.PI / 2} castShadow receiveShadow />
        <Tag k="wld" at={[-SUB.x - 20, 3.5, -6]} to={[-SUB.x - 2.6, 1.5, -6]} />
      </Part>
    </Part>
  );
}

// ---------------------------------------------------------------------------
// Zoom guides: thin lines from each source to the magnified view
// ---------------------------------------------------------------------------

function cone(a: Vector3[], b: Vector3[], r: number) {
  const up = new Vector3(0, 1, 0);
  return a.map((p, i) => {
    const q = b[i];
    const d = q.clone().sub(p);
    const g = new CylinderGeometry(r, r, d.length(), 6, 1);
    g.applyQuaternion(new Quaternion().setFromUnitVectors(up, d.clone().normalize()));
    g.translate((p.x + q.x) / 2, (p.y + q.y) / 2, (p.z + q.z) / 2);
    return g;
  });
}

const corners = (m: Matrix4, cx: number, cy: number, w: number, h: number, z: number) => [
  world(m, cx - w / 2, cy - h / 2, z),
  world(m, cx + w / 2, cy - h / 2, z),
  world(m, cx + w / 2, cy + h / 2, z),
  world(m, cx - w / 2, cy + h / 2, z),
];

let guideMat: MeshBasicMaterial | null = null;

function ZoomGuides() {
  const geo = useMemo(
    () =>
      cached("ram-zoom-guides", () => {
        const [dx, dy, dz] = OPEN_DIE_FINAL;
        const [dw, dh] = OPEN_DIE_SIZE;
        const die = [
          new Vector3(dx - dw / 2, dy - dh / 2, dz),
          new Vector3(dx + dw / 2, dy - dh / 2, dz),
          new Vector3(dx + dw / 2, dy + dh / 2, dz),
          new Vector3(dx - dw / 2, dy + dh / 2, dz),
        ];
        const dieView = corners(DIE_M, 0, 0, DV.w, DV.h, -DV.t / 2);
        const zb = dieRect(BANKS[ZOOM_BANK]);
        const bank = corners(DIE_M, zb.x, zb.y, zb.w, zb.h, DV.t / 2 + 0.5);
        const bankView = corners(BANK_M, 0, 0, BANK_VIEW.w + 1.2, BANK_VIEW.h + 1.2, -0.5);
        const zm = bankRect(BANK_LAYOUT.mats[ZOOM_MAT]);
        const mat = corners(BANK_M, zm.x, zm.y, zm.w, zm.h, 1.4);
        // The cell view's footprint (its local XZ plane at the substrate top).
        const cell = [
          world(CELL_M, -SUB.x, 0, -SUB.z),
          world(CELL_M, SUB.x, 0, -SUB.z),
          world(CELL_M, SUB.x, 0, SUB.z),
          world(CELL_M, -SUB.x, 0, SUB.z),
        ];
        return mergeGeometries([...cone(die, dieView, 0.09), ...cone(bank, bankView, 0.08), ...cone(mat, [cell[3], cell[2], cell[1], cell[0]], 0.08)])!;
      }),
    [],
  );
  guideMat ??= new MeshBasicMaterial({ color: "#7dd3fc", transparent: true, opacity: 0.45, depthWrite: false, toneMapped: false });
  return <mesh geometry={geo} material={guideMat} renderOrder={5} />;
}

// ---------------------------------------------------------------------------
// Reveal: the views grow out of the opened chip near full explode
// ---------------------------------------------------------------------------

const REVEAL: [number, number] = [0.8, 1];
/** Parts whose own visibility follows the reveal (so overlays ignore them while hidden). */
const REVEAL_IDS = ["inside-dram", "die-view", "bank-view", "cell-view"];

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Scales its children from (almost) nothing at the source point up to full
 * size. Authored in world coordinates: at t = 1 the group is the identity.
 */
function Reveal({ from, children }: { from: Vec3; children: ReactNode }) {
  const ref = useRef<Group>(null);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const t = smoothstep(REVEAL[0], REVEAL[1], explodeProgress.value);
    const s = Math.max(t, 1e-3);
    g.scale.setScalar(s);
    g.position.set(from[0] * (1 - s), from[1] * (1 - s), from[2] * (1 - s));
    const show = t > 0.002;
    g.visible = show;
    const hidden = useExplorer.getState().hidden;
    for (const id of REVEAL_IDS) {
      const o = partObjects.get(id);
      if (o) o.visible = show && !hidden[id];
    }
  });
  return (
    <group ref={ref} scale={1e-3} position={from} visible={false}>
      {children}
    </group>
  );
}

/**
 * Selecting a magnified part (e.g. from the parts list) while the module is
 * assembled opens the exploded view, then flies to the part once it has grown.
 */
function useAutoExplode() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = useExplorer.subscribe((s, prev) => {
      if (!s.selectedId || s.selectedId === prev.selectedId) return;
      const inside = !!s.nodes["inside-dram"] && isWithin(s.nodes, s.selectedId, "inside-dram");
      if (!inside || s.explode >= 0.98) return;
      // The magnified views only exist near full explode: open the module,
      // then fly to the chosen view once it has grown in.
      const id = s.selectedId;
      useExplorer.getState().setExplode(1);
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (useExplorer.getState().selectedId === id) useExplorer.getState().focusPart(id);
      }, 1500);
    });
    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, []);
}

/**
 * "Inside a DRAM chip": the die, one of its banks and a handful of cells,
 * each magnified further, connected by zoom guides.
 */
export function DeepDive() {
  useAutoExplode();
  return (
    <Reveal from={OPEN_DIE_FINAL}>
      <Part id="inside-dram">
        <DieView />
        <BankView />
        <CellView />
      </Part>
      <ZoomGuides />
    </Reveal>
  );
}
