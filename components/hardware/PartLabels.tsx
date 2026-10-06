"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Box3, Vector3, type Object3D } from "three";
import { CATEGORY_META } from "@/lib/hardware/catalog";
import { useExplorer } from "@/lib/hardware/store";
import type { DeviceInfo } from "@/lib/hardware/types";
import { explodeProgress } from "./explode";
import { partObjects } from "./sceneState";

function visibleDeep(o: Object3D | null) {
  for (let cur = o; cur; cur = cur.parent) if (!cur.visible) return false;
  return true;
}

const box = new Box3();
const center = new Vector3();
const size = new Vector3();
const proj = new Vector3();

interface Tag {
  id: string;
  depth: number;
  el: HTMLDivElement;
  width: number;
}

/**
 * Name tags for the main parts (and their children once the model is
 * exploded), drawn in a DOM layer over the canvas. Each frame the tags are
 * placed in screen space; larger parts win and overlapping tags are hidden.
 */
export function PartLabels({ device }: { device: DeviceInfo }) {
  const on = useExplorer((s) => s.labels);
  const nodes = useExplorer((s) => s.nodes);
  const rootIds = useExplorer((s) => s.rootIds);
  const { camera, gl, size: viewport } = useThree();
  const tags = useRef<Tag[]>([]);

  const ids = useMemo(() => {
    const out: { id: string; depth: number }[] = [];
    for (const id of rootIds) {
      out.push({ id, depth: 0 });
      for (const c of nodes[id]?.children ?? []) out.push({ id: c, depth: 1 });
    }
    return out.filter(({ id }) => device.parts[id]);
  }, [nodes, rootIds, device]);

  useEffect(() => {
    const parent = gl.domElement.parentElement;
    if (!on || !parent) return;
    const layer = document.createElement("div");
    layer.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:5";
    parent.appendChild(layer);
    tags.current = ids.map(({ id, depth }) => {
      const info = device.parts[id];
      const color = CATEGORY_META[info.category].color;
      const el = document.createElement("div");
      el.style.cssText = "position:absolute;left:0;top:0;display:flex;flex-direction:column;align-items:center;visibility:hidden";
      const btn = document.createElement("button");
      btn.className = "whitespace-nowrap px-2 py-[3px] text-[11px] font-medium text-hud-text backdrop-blur-sm transition-colors hover:bg-[rgba(14,18,24,0.95)]";
      btn.style.cssText = `pointer-events:auto;background:rgba(6,8,11,0.84);border:1px solid rgba(186,204,224,0.2);border-left:2px solid ${color}`;
      btn.append(document.createTextNode(info.name));
      btn.addEventListener("click", () => useExplorer.getState().select(id, "focus"));
      btn.addEventListener("pointerenter", () => useExplorer.getState().hover(id));
      btn.addEventListener("pointerleave", () => useExplorer.getState().hover(null));
      const stem = document.createElement("span");
      stem.style.cssText = "width:1px;height:14px;background:rgba(186,204,224,0.35)";
      el.append(btn, stem);
      layer.appendChild(el);
      return { id, depth, el, width: 0 };
    });
    for (const t of tags.current) t.width = t.el.offsetWidth;
    return () => {
      layer.remove();
      tags.current = [];
    };
  }, [on, ids, device, gl]);

  useFrame(() => {
    if (!on || tags.current.length === 0) return;
    const exploded = explodeProgress.value > 0.35;
    const cands: { tag: Tag; x: number; y: number; area: number }[] = [];
    for (const tag of tags.current) {
      const obj = partObjects.get(tag.id);
      const hasKids = (nodes[tag.id]?.children.length ?? 0) > 0;
      const wanted = tag.depth === 0 ? !exploded || !hasKids : exploded;
      if (!obj || !wanted || !visibleDeep(obj)) continue;
      box.setFromObject(obj);
      if (box.isEmpty()) continue;
      box.getCenter(center);
      box.getSize(size);
      // Anchor on the top corner nearest the camera, pulled toward the middle,
      // so tags point at a visible edge rather than the hidden centre.
      const cx = camera.position.x > center.x ? box.max.x : box.min.x;
      const cz = camera.position.z > center.z ? box.max.z : box.min.z;
      const pull = exploded ? 0.55 : 0.3;
      proj.set(cx + (center.x - cx) * pull, box.max.y, cz + (center.z - cz) * pull).project(camera);
      if (proj.z > 1 || Math.abs(proj.x) > 1.05 || Math.abs(proj.y) > 1.05) continue;
      cands.push({
        tag,
        x: ((proj.x + 1) / 2) * viewport.width,
        y: ((1 - proj.y) / 2) * viewport.height,
        area: size.x * size.z + size.y * Math.max(size.x, size.z),
      });
    }
    cands.sort((a, b) => b.area - a.area);
    const placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
    const shown = new Set<Tag>();
    for (const c of cands) {
      const w = c.tag.width || 120;
      const r = { x0: c.x - w / 2 - 6, x1: c.x + w / 2 + 6, y0: c.y - 44, y1: c.y - 14 };
      if (placed.some((p) => r.x0 < p.x1 && p.x0 < r.x1 && r.y0 < p.y1 && p.y0 < r.y1)) continue;
      placed.push(r);
      shown.add(c.tag);
      c.tag.el.style.transform = `translate(${c.x}px, ${c.y}px) translate(-50%, -100%)`;
    }
    for (const t of tags.current) t.el.style.visibility = shown.has(t) ? "visible" : "hidden";
  });

  return null;
}
