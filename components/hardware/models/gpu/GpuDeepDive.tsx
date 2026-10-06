"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  EdgesGeometry,
  InstancedMesh,
  LineBasicMaterial,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  Object3D,
  PlaneGeometry,
  SRGBColorSpace,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { gpuRegions, gpuSmRect, type NamedRegion } from "@/lib/three/dieShot";
import { FONT_SANS } from "@/lib/three/painter";
import { Part } from "../../Part";
import { cached, roundedBox } from "../../kit/geometry";
import { MAT, emissive } from "../../kit/materials";
import { Reveal, useAutoExplode } from "../../kit/Reveal";
import { DIE_ART, gpuDieShotMaterial } from "./dieMaterial";
import { GPU } from "./layout";

type Vec3 = [number, number, number];

/** Where the flipped die ends up at full explode (the views grow out of it). */
const DIE_EXPLODED: Vec3 = [GPU.x, 80, GPU.z];
/** Posters lean back to face a camera looking down at the card. */
const TILT = -0.32;
const MAP_POS: Vec3 = [-92, 300, -80];
const SM_POS: Vec3 = [78, 300, -80];
/** Floorplan magnification (die mm → world mm). */
const S = 3.6;
const MAP = { w: DIE_ART.w * S, h: DIE_ART.h * S };
/** The SM that the second view magnifies. */
const ZOOM_SM = gpuSmRect(DIE_ART.w, DIE_ART.h, 0, 2, 4);

const REGION_COLOR: Record<string, string> = {
  gpc: "#f472b6",
  "l2-cache": "#a78bfa",
  "memory-phy": "#fbbf24",
  crossbar: "#38bdf8",
  "pcie-phy": "#fb923c",
  "display-engine": "#2dd4bf",
  "media-engine": "#34d399",
};

/** Die rect (mm, origin top-left, y down) → poster-local centre (x, y up). */
function toMap(r: NamedRegion) {
  return { x: (r.x + r.w / 2 - DIE_ART.w / 2) * S, y: (DIE_ART.h / 2 - (r.y + r.h / 2)) * S, w: r.w * S, h: r.h * S };
}

/** Transparent canvas texture with text labels, drawn in poster mm. */
function labelTexture(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  return cached(`gpu-dd-labels:${key}`, () => {
    const ppm = 10;
    const c = document.createElement("canvas");
    c.width = Math.round(w * ppm);
    c.height = Math.round(h * ppm);
    const ctx = c.getContext("2d")!;
    ctx.scale(ppm, ppm);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    draw(ctx);
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 8;
    const g = new PlaneGeometry(w, h);
    (g.userData as { map?: CanvasTexture }).map = t;
    return g;
  });
}

function LabelLayer({ id, w, h, z, draw }: { id: string; w: number; h: number; z: number; draw: (ctx: CanvasRenderingContext2D) => void }) {
  const geo = labelTexture(id, w, h, draw);
  const mat = useMemo(
    () => new MeshBasicMaterial({ map: (geo.userData as { map: CanvasTexture }).map, transparent: true, depthWrite: false, toneMapped: false }),
    [geo],
  );
  return <mesh geometry={geo} material={mat} position-z={z} renderOrder={4} raycast={() => null} />;
}

// ---------------------------------------------------------------------------

function DieMap() {
  const regions = useMemo(() => gpuRegions(DIE_ART.w, DIE_ART.h), []);
  const groups = useMemo(() => {
    const out = new Map<string, NamedRegion[]>();
    for (const r of regions) out.set(r.id, [...(out.get(r.id) ?? []), r]);
    return out;
  }, [regions]);
  const plate = cached("gpu-dd-plate", () => new PlaneGeometry(MAP.w, MAP.h));

  return (
    <Part id="die-map" position={MAP_POS} rotation={[TILT, 0, 0]}>
      <mesh geometry={roundedBox(MAP.w + 5, MAP.h + 5, 2, 0.8)} material={MAT.plasticSatin} position-z={-1.2} />
      <mesh geometry={plate} material={gpuDieShotMaterial()} />
      {[...groups.entries()].map(([id, rs]) => (
        <Part key={id} id={id}>
          <RegionOverlay rects={rs} color={REGION_COLOR[id]} />
        </Part>
      ))}
      {/* The magnified SM, outlined on the map. */}
      <ZoomFrame rect={ZOOM_SM} />
      <LabelLayer
        id="map"
        w={MAP.w}
        h={MAP.h + 14}
        z={0.9}
        draw={(ctx) => {
          const oy = 7;
          const at = (r: NamedRegion) => ({ x: (r.x + r.w / 2) * S, y: oy + (r.y + r.h / 2) * S });
          ctx.fillStyle = "#ffffff";
          ctx.font = `700 4.6px ${FONT_SANS}`;
          ctx.fillText("GPU DIE  ·  CIRCUIT SIDE  (×3.6)", MAP.w / 2, 3);
          ctx.font = `700 2.6px ${FONT_SANS}`;
          for (const r of regions) {
            const p = at(r);
            ctx.save();
            ctx.translate(p.x, p.y);
            if (r.id === "memory-phy") {
              ctx.rotate(-Math.PI / 2);
              ctx.fillText("GDDR7 MEMORY PHYs", 0, 0);
            } else if (r.id === "gpc") {
              ctx.fillText("GPC", 0, 0);
              ctx.font = `600 1.7px ${FONT_SANS}`;
              ctx.fillText("12 SMs", 0, 3);
              ctx.font = `700 2.6px ${FONT_SANS}`;
            } else if (r.id === "l2-cache") ctx.fillText("L2 CACHE", 0, 0);
            else if (r.id === "crossbar") {
              ctx.rotate(-Math.PI / 2);
              ctx.font = `700 1.8px ${FONT_SANS}`;
              ctx.fillText("CROSSBAR", 0, 0);
              ctx.font = `700 2.6px ${FONT_SANS}`;
            } else if (r.id === "pcie-phy") ctx.fillText("PCIe 5.0", 0, 0);
            else if (r.id === "display-engine") ctx.fillText("DISPLAY", 0, 0);
            else if (r.id === "media-engine") ctx.fillText("VIDEO ENC/DEC", 0, 0);
            ctx.restore();
          }
        }}
      />
    </Part>
  );
}

function RegionOverlay({ rects, color }: { rects: NamedRegion[]; color: string }) {
  const { fill, edges } = useMemo(() => {
    const boxes = rects.map((r) => {
      const m = toMap(r);
      const b = new BoxGeometry(m.w, m.h, 0.6);
      b.translate(m.x, m.y, 0.35);
      return b;
    });
    const merged = mergeGeometries(boxes)!;
    return { fill: merged, edges: new EdgesGeometry(merged) };
  }, [rects]);
  const fillMat = useMemo(() => new MeshBasicMaterial({ color, transparent: true, opacity: 0.16, depthWrite: false, toneMapped: false }), [color]);
  const edgeMat = useMemo(() => new LineBasicMaterial({ color, transparent: true, opacity: 0.85, toneMapped: false }), [color]);
  return (
    <group>
      <mesh geometry={fill} material={fillMat} renderOrder={3} />
      <lineSegments geometry={edges} material={edgeMat} />
    </group>
  );
}

function ZoomFrame({ rect }: { rect: NamedRegion }) {
  const m = toMap(rect);
  const geo = useMemo(() => new EdgesGeometry(new BoxGeometry(m.w + 0.4, m.h + 0.4, 1.4)), [m.w, m.h]);
  return (
    <lineSegments geometry={geo} position={[m.x, m.y, 0.7]}>
      <lineBasicMaterial color="#e0f2fe" toneMapped={false} />
    </lineSegments>
  );
}

// ---------------------------------------------------------------------------
// One streaming multiprocessor as a block diagram

const SMV = { w: 112, h: 100 };
/** Four processing blocks (quadrants). */
const QUAD = { w: 52, h: 33 };
const QUADS: [number, number][] = [
  [-27, 18],
  [27, 18],
  [-27, -19],
  [27, -19],
];
const LANE = { cols: 8, rows: 4, pitch: 3.6, size: 2.8 };

const dummy = new Object3D();

function Lanes() {
  const ref = useRef<InstancedMesh>(null);
  const count = QUADS.length * LANE.cols * LANE.rows;
  const geo = cached("gpu-dd-lane", () => {
    const g = new BoxGeometry(LANE.size, LANE.size, 2.4);
    g.translate(0, 0, 1.2);
    return g;
  });
  const mat = useMemo(() => new MeshPhysicalMaterial({ color: "#fb923c", roughness: 0.4, metalness: 0.1, emissive: "#c2410c", emissiveIntensity: 0.6 }), []);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    let k = 0;
    for (const [qx, qy] of QUADS)
      for (let r = 0; r < LANE.rows; r++)
        for (let c = 0; c < LANE.cols; c++) {
          dummy.position.set(qx - QUAD.w / 2 + 4 + c * LANE.pitch + LANE.pitch / 2, qy - 4.5 - r * LANE.pitch, 0);
          dummy.updateMatrix();
          m.setMatrixAt(k++, dummy.matrix);
        }
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, []);
  return <instancedMesh ref={ref} args={[geo, mat, count]} castShadow />;
}

/** Boxes for one functional unit repeated in every quadrant (offsets relative to quadrant centre). */
function PerQuad({ size, offset, material }: { size: Vec3; offset: Vec3; material: MeshPhysicalMaterial | MeshBasicMaterial }) {
  const geo = useMemo(
    () =>
      mergeGeometries(
        QUADS.map(([qx, qy]) => {
          const b = roundedBox(size[0], size[1], size[2], 0.4).clone();
          b.translate(qx + offset[0], qy + offset[1], offset[2] + size[2] / 2);
          return b;
        }),
      )!,
    [size, offset],
  );
  return <mesh geometry={geo} material={material} castShadow receiveShadow />;
}

function unitMat(color: string, emissiveIntensity = 0.35) {
  return new MeshPhysicalMaterial({ color, roughness: 0.45, metalness: 0.15, emissive: color, emissiveIntensity, clearcoat: 0.4 });
}

function SmView() {
  const mats = useMemo(
    () => ({
      sched: unitMat("#2dd4bf"),
      rf: unitMat("#8b5cf6"),
      tensor: unitMat("#ec4899", 0.5),
      ldst: unitMat("#38bdf8"),
      sfu: unitMat("#facc15"),
      l1: unitMat("#6366f1", 0.25),
      tex: unitMat("#22c55e"),
      rt: unitMat("#f97316", 0.55),
      icache: unitMat("#64748b", 0.2),
    }),
    [],
  );
  return (
    <Part id="sm-view" position={SM_POS} rotation={[TILT, 0, 0]}>
      <mesh geometry={roundedBox(SMV.w, SMV.h, 2, 1)} material={MAT.plasticSatin} position-z={-1.2} />
      {QUADS.map(([qx, qy], i) => (
        <mesh key={i} geometry={roundedBox(QUAD.w, QUAD.h, 0.6, 0.6)} material={MAT.aluminumBlack} position={[qx, qy, 0.1]} />
      ))}
      <Part id="instruction-cache">
        <mesh geometry={roundedBox(SMV.w - 6, 4, 1.6, 0.4)} material={mats.icache} position={[0, SMV.h / 2 - 5.5, 0.8]} castShadow />
      </Part>
      <Part id="warp-schedulers">
        <PerQuad size={[QUAD.w - 6, 3, 1.8]} offset={[0, QUAD.h / 2 - 3.2, 0.4]} material={mats.sched} />
      </Part>
      <Part id="register-files">
        <PerQuad size={[QUAD.w - 6, 3.4, 2.6]} offset={[0, QUAD.h / 2 - 7.4, 0.4]} material={mats.rf} />
      </Part>
      <Part id="cuda-cores">
        <group position-z={0.4}>
          <Lanes />
        </group>
      </Part>
      <Part id="tensor-cores">
        <PerQuad size={[14, 13.5, 4]} offset={[QUAD.w / 2 - 10, -5.4, 0.4]} material={mats.tensor} />
      </Part>
      <Part id="load-store">
        <PerQuad size={[30, 2.6, 1.6]} offset={[-QUAD.w / 2 + 18.5, -QUAD.h / 2 + 3.6, 0.4]} material={mats.ldst} />
      </Part>
      <Part id="sfu">
        <PerQuad size={[14, 2.6, 1.6]} offset={[QUAD.w / 2 - 10, -QUAD.h / 2 + 3.6, 0.4]} material={mats.sfu} />
      </Part>
      <Part id="l1-shared">
        <mesh geometry={roundedBox(64, 8, 2.2, 0.5)} material={mats.l1} position={[-20, -SMV.h / 2 + 7.5, 1.1]} castShadow />
      </Part>
      <Part id="texture-units">
        {[0, 1, 2, 3].map((k) => (
          <mesh key={k} geometry={roundedBox(5.6, 8, 2.2, 0.5)} material={mats.tex} position={[16 + k * 6.4, -SMV.h / 2 + 7.5, 1.1]} castShadow />
        ))}
      </Part>
      <Part id="rt-core">
        <mesh geometry={roundedBox(13, 8, 3.2, 0.6)} material={mats.rt} position={[SMV.w / 2 - 10, -SMV.h / 2 + 7.5, 1.6]} castShadow />
      </Part>
      <LabelLayer
        id="sm"
        w={SMV.w}
        h={SMV.h + 14}
        z={4.4}
        draw={(ctx) => {
          const X = (x: number) => x + SMV.w / 2;
          const Y = (y: number) => 7 + SMV.h / 2 - y;
          ctx.fillStyle = "#ffffff";
          ctx.font = `700 4.6px ${FONT_SANS}`;
          ctx.fillText("ONE STREAMING MULTIPROCESSOR  (×60)", SMV.w / 2, 3);
          ctx.font = `700 2.2px ${FONT_SANS}`;
          ctx.fillText("L1 INSTRUCTION CACHE", X(0), Y(SMV.h / 2 - 5.5));
          QUADS.forEach(([qx, qy]) => {
            ctx.fillStyle = "#0b1020";
            ctx.fillText("WARP SCHEDULER + DISPATCH", X(qx), Y(qy + QUAD.h / 2 - 3.2));
            ctx.fillStyle = "#ffffff";
            ctx.fillText("REGISTER FILE  64 KB", X(qx), Y(qy + QUAD.h / 2 - 7.4));
            ctx.font = `700 1.9px ${FONT_SANS}`;
            ctx.fillText("32 FP32/INT32 LANES", X(qx - QUAD.w / 2 + 18.4), Y(qy - 17.2));
            ctx.fillText("TENSOR", X(qx + QUAD.w / 2 - 10), Y(qy - 4.6));
            ctx.fillText("CORE", X(qx + QUAD.w / 2 - 10), Y(qy - 7));
            ctx.fillStyle = "#0b1020";
            ctx.fillText("LD/ST ×4", X(qx - QUAD.w / 2 + 18.5), Y(qy - QUAD.h / 2 + 3.6));
            ctx.fillText("SFU", X(qx + QUAD.w / 2 - 10), Y(qy - QUAD.h / 2 + 3.6));
            ctx.fillStyle = "#ffffff";
            ctx.font = `700 2.2px ${FONT_SANS}`;
          });
          ctx.fillText("L1 DATA CACHE / SHARED MEMORY  128 KB", X(-20), Y(-SMV.h / 2 + 7.5));
          ctx.font = `700 1.8px ${FONT_SANS}`;
          ctx.fillText("TEX ×4", X(25.6), Y(-SMV.h / 2 + 2.5));
          ctx.fillText("RT CORE", X(SMV.w / 2 - 10), Y(-SMV.h / 2 + 7.5));
        }}
      />
    </Part>
  );
}

// ---------------------------------------------------------------------------

/** Faint guide lines: flipped die → floorplan, highlighted SM → SM view. */
function ZoomGuides() {
  const geo = useMemo(() => {
    const pts: number[] = [];
    const tilt = (p: Vec3, base: Vec3): Vec3 => {
      // Apply the poster tilt (rotation about X) and translate.
      const c = Math.cos(TILT);
      const s = Math.sin(TILT);
      return [base[0] + p[0], base[1] + p[1] * c - p[2] * s, base[2] + p[1] * s + p[2] * c];
    };
    const dw = GPU.die[0] / 2;
    const dd = GPU.die[2] / 2;
    const dieCorners: Vec3[] = [
      [DIE_EXPLODED[0] - dw, DIE_EXPLODED[1], DIE_EXPLODED[2] - dd],
      [DIE_EXPLODED[0] + dw, DIE_EXPLODED[1], DIE_EXPLODED[2] - dd],
      [DIE_EXPLODED[0] + dw, DIE_EXPLODED[1], DIE_EXPLODED[2] + dd],
      [DIE_EXPLODED[0] - dw, DIE_EXPLODED[1], DIE_EXPLODED[2] + dd],
    ];
    const mapCorners: Vec3[] = [
      tilt([-MAP.w / 2, MAP.h / 2, 0], MAP_POS),
      tilt([MAP.w / 2, MAP.h / 2, 0], MAP_POS),
      tilt([MAP.w / 2, -MAP.h / 2, 0], MAP_POS),
      tilt([-MAP.w / 2, -MAP.h / 2, 0], MAP_POS),
    ];
    dieCorners.forEach((d, i) => pts.push(...d, ...mapCorners[i]));
    const m = toMap(ZOOM_SM);
    const smCorners: Vec3[] = [
      tilt([m.x - m.w / 2, m.y + m.h / 2, 0.7], MAP_POS),
      tilt([m.x + m.w / 2, m.y + m.h / 2, 0.7], MAP_POS),
      tilt([m.x + m.w / 2, m.y - m.h / 2, 0.7], MAP_POS),
      tilt([m.x - m.w / 2, m.y - m.h / 2, 0.7], MAP_POS),
    ];
    const viewCorners: Vec3[] = [
      tilt([-SMV.w / 2, SMV.h / 2, 0], SM_POS),
      tilt([SMV.w / 2, SMV.h / 2, 0], SM_POS),
      tilt([SMV.w / 2, -SMV.h / 2, 0], SM_POS),
      tilt([-SMV.w / 2, -SMV.h / 2, 0], SM_POS),
    ];
    smCorners.forEach((c, i) => pts.push(...c, ...viewCorners[i]));
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(pts), 3));
    return g;
  }, []);
  return (
    <lineSegments geometry={geo} raycast={() => null}>
      <lineBasicMaterial color="#7dd3fc" transparent opacity={0.35} depthWrite={false} toneMapped={false} />
    </lineSegments>
  );
}

export const DEEP_DIVE_IDS = ["inside-gpu", "die-map", "sm-view"];

/** "Inside the GPU": the die's floorplan and one SM, magnified, near full explode. */
export function GpuDeepDive() {
  useAutoExplode("inside-gpu");
  return (
    <Reveal from={DIE_EXPLODED} range={[0.82, 1]} partIds={DEEP_DIVE_IDS}>
      <Part id="inside-gpu">
        <DieMap />
        <SmView />
      </Part>
      <ZoomGuides />
      <mesh geometry={roundedBox(2, 2, 2, 0.5)} material={emissive("#7dd3fc", 2)} position={DIE_EXPLODED} raycast={() => null} />
    </Reveal>
  );
}
