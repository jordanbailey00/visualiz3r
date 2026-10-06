"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import {
  CylinderGeometry,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
  type BufferAttribute,
  type Group,
  type Mesh,
  type PerspectiveCamera,
} from "three";
import { useExplorer } from "@/lib/hardware/store";
import { FONT_SANS, Painter } from "@/lib/three/painter";

type Vec3 = [number, number, number];

/**
 * Floating labels for the magnified views. Every label is painted once into a
 * shared atlas texture; each tag is a small camera-facing plane that samples
 * its own rectangle, so all tags share one material (one shader, one texture).
 */
export type TagStyle = "title" | "label" | "small";

const STYLE: Record<TagStyle, { px: number; padX: number; padY: number; weight: number; color: string; border: string; bg: string }> = {
  title: { px: 58, padX: 26, padY: 16, weight: 800, color: "#e0f2fe", border: "rgba(125, 211, 252, 0.85)", bg: "rgba(8, 20, 34, 0.86)" },
  label: { px: 44, padX: 20, padY: 12, weight: 700, color: "#f1f5f9", border: "rgba(148, 197, 255, 0.55)", bg: "rgba(10, 14, 22, 0.82)" },
  small: { px: 38, padX: 16, padY: 10, weight: 700, color: "#e2e8f0", border: "rgba(148, 163, 184, 0.5)", bg: "rgba(10, 14, 22, 0.78)" },
};

/** Atlas pixels per world millimetre. */
const PX_PER_MM = 25;

/** Every label used by the model: key → [text, style]. */
export const TAGS = {
  dieTitle: ["DRAM die  ·  16 Gbit  ·  ×5", "title"],
  bankTitle: ["One bank  ·  BG5 / bank 1  ·  ×27", "title"],
  cellTitle: ["Memory cells  ·  1 transistor + 1 capacitor per bit  ·  ×150,000", "title"],
  bg0: ["Bank group 0", "small"],
  bg1: ["Bank group 1", "small"],
  bg2: ["Bank group 2", "small"],
  bg3: ["Bank group 3", "small"],
  bg4: ["Bank group 4", "small"],
  bg5: ["Bank group 5", "small"],
  bg6: ["Bank group 6", "small"],
  bg7: ["Bank group 7", "small"],
  bank: ["Bank — 32 per chip", "label"],
  cmd: ["Command decoder & control", "label"],
  io: ["Bond pads & data I/O", "label"],
  ecc: ["On-die ECC", "label"],
  mats: ["Mat — cell array (512 × 1,024 cells)", "label"],
  sa: ["Sense-amplifier strips", "label"],
  swd: ["Sub-word-line drivers", "label"],
  rowDec: ["Row decoder", "label"],
  colDec: ["Column decoder & bank control", "label"],
  wl: ["Word line (selects a row)", "label"],
  bl: ["Bit line (carries the data)", "label"],
  cap: ["Storage capacitor", "label"],
  fet: ["Access transistor", "label"],
  sense: ["Sense amplifier", "label"],
  wld: ["Word-line driver", "label"],
  one: ["1 = charged", "small"],
  zero: ["0 = empty", "small"],
  open: ["Open row", "small"],
} as const satisfies Record<string, readonly [string, TagStyle]>;

export type TagKey = keyof typeof TAGS;

interface AtlasEntry {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  w: number;
  h: number;
}

let atlas: { material: MeshBasicMaterial; entries: Record<TagKey, AtlasEntry> } | null = null;

function buildAtlas() {
  if (atlas) return atlas;
  const W = 2048;
  const H = 1024;
  const p = new Painter(W, H, 1, { color: "rgba(0,0,0,0)", rough: 1, metal: 0 });
  const ctx = p.c;
  const entries = {} as Record<TagKey, AtlasEntry>;
  let x = 4;
  let y = 4;
  let rowH = 0;
  for (const key of Object.keys(TAGS) as TagKey[]) {
    const [text, styleKey] = TAGS[key];
    const st = STYLE[styleKey];
    ctx.font = `${st.weight} ${st.px}px ${FONT_SANS}`;
    const tw = Math.ceil(ctx.measureText(text).width);
    const w = tw + st.padX * 2;
    const h = Math.round(st.px * 1.25) + st.padY * 2;
    if (x + w > W - 4) {
      x = 4;
      y += rowH + 6;
      rowH = 0;
    }
    const r = h * 0.32;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x + 2, y + 2, w - 4, h - 4, r);
    ctx.fillStyle = st.bg;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = st.border;
    ctx.stroke();
    ctx.restore();
    // Accent bar on the left edge.
    ctx.fillStyle = st.border;
    ctx.fillRect(x + 2 + r * 0.45, y + h * 0.28, 4, h * 0.44);
    p.text(text, x + w / 2 + 3, y + h / 2 + 1, st.px, { color: st.color, rough: 1, metal: 0 }, {
      align: "center",
      baseline: "middle",
      font: FONT_SANS,
      weight: st.weight,
    });
    entries[key] = { u0: x / W, u1: (x + w) / W, v0: 1 - (y + h) / H, v1: 1 - y / H, w: w / PX_PER_MM, h: h / PX_PER_MM };
    x += w + 6;
    rowH = Math.max(rowH, h);
  }
  const maps = p.toMaps({ anisotropy: 4 });
  const material = new MeshBasicMaterial({
    map: maps.map,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  atlas = { material, entries };
  return atlas;
}

const geoCache = new Map<string, PlaneGeometry>();

/** Plane sized to the label, with its anchor at the bottom centre. */
function tagGeometry(key: TagKey, scale: number) {
  const k = `${key}:${scale}`;
  let g = geoCache.get(k);
  if (g) return g;
  const e = buildAtlas().entries[key];
  g = new PlaneGeometry(e.w * scale, e.h * scale);
  g.translate(0, (e.h * scale) / 2, 0);
  const uv = g.getAttribute("uv") as BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) ? e.u1 : e.u0, uv.getY(i) ? e.v1 : e.v0);
  }
  uv.needsUpdate = true;
  geoCache.set(k, g);
  return g;
}

const tmpQ = new Quaternion();
const tmpV = new Vector3();
const tmpS = new Vector3();

let leaderMat: MeshBasicMaterial | null = null;
function leaderMaterial() {
  leaderMat ??= new MeshBasicMaterial({ color: "#9cc9f5", transparent: true, opacity: 0.75, depthWrite: false, toneMapped: false });
  return leaderMat;
}
const leaderGeo = new CylinderGeometry(1, 1, 1, 6, 1);
const UP = new Vector3(0, 1, 0);

/** Smallest on-screen text height (px) at which a tag is drawn; titles always show. */
const MIN_PX: Record<TagStyle, number> = { title: 0.01, label: 9, small: 8 };
/** Largest on-screen text height (px) before a tag stops growing. */
const MAX_PX = 21;

/**
 * A camera-facing label. `at` is where the tag's bottom edge sits; `to`
 * (optional) draws a thin leader line from the tag down to the feature.
 * Coordinates are in the parent's space. Labels too small to read at the
 * current zoom are hidden, so the overview stays clean and detail appears as
 * you move in.
 */
export function Tag({ k, at, to, scale = 1 }: { k: TagKey; at: Vec3; to?: Vec3; scale?: number }) {
  const ref = useRef<Mesh>(null);
  const group = useRef<Group>(null);
  const geometry = tagGeometry(k, scale);
  const { material } = buildAtlas();
  const style = TAGS[k][1];
  const textMm = (STYLE[style].px / PX_PER_MM) * scale;
  useFrame(({ camera, size }) => {
    const m = ref.current;
    const g = group.current;
    if (!m?.parent || !g) return;
    m.parent.getWorldQuaternion(tmpQ);
    m.quaternion.copy(tmpQ.invert().multiply(camera.quaternion));
    // The explorer's own name tags (Labels toggle) already title each view.
    if (style === "title" && useExplorer.getState().labels) {
      g.visible = false;
      return;
    }
    const min = MIN_PX[style];
    if ((camera as PerspectiveCamera).isPerspectiveCamera) {
      m.getWorldPosition(tmpV);
      m.getWorldScale(tmpS);
      const fov = ((camera as PerspectiveCamera).fov * Math.PI) / 180;
      const pxPerMm = size.height / (2 * tmpV.distanceTo(camera.position) * Math.tan(fov / 2));
      // Hysteresis keeps tags from flickering at the threshold.
      const px = (textMm * tmpS.x * pxPerMm) / m.scale.x;
      if (g.visible && px < min * 0.92) g.visible = false;
      else if (!g.visible && px > min) g.visible = true;
      // Up close, keep labels at a comfortable size instead of letting them
      // fill the screen (the anchor stays put; only the plate shrinks).
      m.scale.setScalar(px > MAX_PX ? MAX_PX / px : 1);
    }
  });
  const leader = useMemo(() => {
    if (!to) return null;
    const a = new Vector3(...to);
    const b = new Vector3(...at);
    const d = b.clone().sub(a);
    const len = d.length();
    return {
      position: a.clone().addScaledVector(d, 0.5).toArray() as Vec3,
      quaternion: new Quaternion().setFromUnitVectors(UP, d.normalize()),
      scale: [0.07 * scale, len, 0.07 * scale] as Vec3,
    };
  }, [at, to, scale]);
  return (
    <group ref={group}>
      <mesh ref={ref} geometry={geometry} material={material} position={at} renderOrder={20} />
      {leader && <mesh geometry={leaderGeo} material={leaderMaterial()} position={leader.position} quaternion={leader.quaternion} scale={leader.scale} renderOrder={19} />}
    </group>
  );
}
