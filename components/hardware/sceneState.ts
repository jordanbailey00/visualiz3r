import {
  MeshBasicMaterial,
  type Material,
  type Mesh,
  type Object3D,
  type Raycaster,
  type Intersection,
} from "three";
import type { PartNode } from "@/lib/hardware/types";

/** Part id → its <group>. Rebuilt whenever a device model mounts. */
export const partObjects = new Map<string, Object3D>();

/** Root group of the mounted device model. */
export const modelRoot: { current: Object3D | null } = { current: null };

interface MeshMeta {
  baseMaterial: Material | Material[];
  baseCastShadow: boolean;
  baseRaycast: Mesh["raycast"];
  cover: boolean;
  mode: VisualMode;
  /** troika (drei <Text>) meshes manage their own material: hide them instead. */
  text: boolean;
  baseVisible: boolean;
}

type VisualMode = "normal" | "ghost" | "xray";

const meta = new WeakMap<Mesh, MeshMeta>();

function isMesh(o: Object3D): o is Mesh {
  return (o as Mesh).isMesh === true;
}

/** drei <Text> / troika-three-text meshes (their material getter returns derived materials). */
function isTextMesh(o: Object3D) {
  const t = o as Object3D & { sync?: unknown; fontSize?: unknown };
  return typeof t.sync === "function" && t.fontSize !== undefined;
}

/**
 * Walk the rendered model, collect the part hierarchy, and remember each mesh's
 * original material so visual modes can be swapped in and out.
 */
export function discoverParts(root: Object3D) {
  const nodes: Record<string, PartNode> = {};
  const rootIds: string[] = [];
  partObjects.clear();

  const visit = (obj: Object3D, parentId: string | null, depth: number, cover: boolean) => {
    let nextParent = parentId;
    let nextDepth = depth;
    let nextCover = cover;
    const id = obj.userData?.partId as string | undefined;
    if (id) {
      if (nodes[id]) {
        console.warn(`[hardware] duplicate part id "${id}"`);
      } else {
        nodes[id] = { id, parentId, children: [], depth };
        if (parentId) nodes[parentId].children.push(id);
        else rootIds.push(id);
        partObjects.set(id, obj);
      }
      nextParent = id;
      nextDepth = depth + 1;
      nextCover = cover || obj.userData.cover === true;
    } else if (isMesh(obj)) {
      const existing = meta.get(obj);
      if (!existing) {
        const text = isTextMesh(obj);
        meta.set(obj, {
          // Never read a troika text mesh's material: it derives a new one.
          baseMaterial: text ? [] : obj.material,
          baseCastShadow: obj.castShadow,
          baseRaycast: obj.raycast,
          cover: nextCover,
          mode: "normal",
          text,
          baseVisible: obj.visible,
        });
      } else {
        existing.cover = nextCover;
      }
    }
    for (const child of obj.children) visit(child, nextParent, nextDepth, nextCover);
  };
  visit(root, null, 0, false);
  return { nodes, rootIds };
}

const ghostMaterial = new MeshBasicMaterial({
  color: 0x8fb0e0,
  transparent: true,
  opacity: 0.055,
  depthWrite: false,
});

const xrayCache = new WeakMap<Material, Material>();
function xrayVariant(m: Material): Material {
  let v = xrayCache.get(m);
  if (!v) {
    v = m.clone();
    v.transparent = true;
    v.opacity = 0.16;
    v.depthWrite = false;
    xrayCache.set(m, v);
  }
  return v;
}

const noRaycast = (_r: Raycaster, _i: Intersection[]) => {};

function setMode(mesh: Mesh, m: MeshMeta, mode: VisualMode) {
  if (m.mode === mode) return;
  if (m.text) {
    if (m.mode === "normal") m.baseVisible = mesh.visible;
    m.mode = mode;
    mesh.visible = mode === "normal" ? m.baseVisible : false;
    return;
  }
  // Some code (e.g. BVH acceleration) may replace raycast after discovery.
  if (m.mode === "normal") m.baseRaycast = mesh.raycast;
  m.mode = mode;
  if (mode === "normal") {
    mesh.material = m.baseMaterial;
    mesh.castShadow = m.baseCastShadow;
    mesh.raycast = m.baseRaycast;
    return;
  }
  const base = m.baseMaterial;
  if (mode === "ghost") {
    mesh.material = Array.isArray(base) ? base.map(() => ghostMaterial) : ghostMaterial;
  } else {
    mesh.material = Array.isArray(base) ? base.map(xrayVariant) : xrayVariant(base);
  }
  mesh.castShadow = false;
  mesh.raycast = noRaycast;
}

export interface VisualState {
  selectedId: string | null;
  focusMode: boolean;
  xray: boolean;
  hidden: Record<string, true>;
}

/** Apply focus-mode ghosting, X-ray covers and hidden parts to the model. */
export function applyVisualState(root: Object3D, s: VisualState) {
  for (const [id, obj] of partObjects) obj.visible = !s.hidden[id];

  const selected = s.selectedId ? partObjects.get(s.selectedId) : undefined;
  const inSelection = new Set<Object3D>();
  selected?.traverse((o) => inSelection.add(o));

  root.traverse((o) => {
    if (!isMesh(o)) return;
    const m = meta.get(o);
    if (!m) return;
    let mode: VisualMode = "normal";
    if (selected && !inSelection.has(o)) {
      if (s.focusMode) mode = "ghost";
      else if (s.xray && m.cover) mode = "xray";
    } else if (!selected && s.xray && m.cover) {
      mode = "xray";
    }
    setMode(o, m, mode);
  });
}

/** All meshes beneath a part (used for outline highlighting). */
export function meshesOf(id: string | null): Mesh[] {
  if (!id) return [];
  const obj = partObjects.get(id);
  if (!obj) return [];
  const out: Mesh[] = [];
  obj.traverse((o) => {
    if (isMesh(o) && o.visible) out.push(o);
  });
  return out;
}
