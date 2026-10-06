"use client";

import { useMemo } from "react";
import { MeshPhysicalMaterial, Vector2, type Shape } from "three";
import { painted, type Painter } from "@/lib/three/painter";
import { pcbSurfaces, type MaskColor, type PcbSurfaces } from "@/lib/three/pcbPaint";
import { boundsOf, extrudedWalls, flatFace, type FlatBounds } from "./geometry";
import { MAT } from "./materials";

export interface BoardProps {
  /** Cache key for the painted textures (unique per board design). */
  id: string;
  /** Outline in board space: x → world X, y → world Z. May contain holes. */
  outline: Shape;
  thickness?: number;
  mask?: MaskColor;
  /** Texture resolution in pixels per mm. */
  ppm?: number;
  /** Bottom-side resolution (defaults to min(ppm, 6) — raise it for double-sided boards). */
  bottomPpm?: number;
  /** Paint the top side. Painter coordinates are board mm relative to the outline bounds. */
  paintTop?: (p: Painter, s: PcbSurfaces, b: FlatBounds) => void;
  /** Paint the bottom side, as seen from below (x is mirrored automatically). */
  paintBottom?: (p: Painter, s: PcbSurfaces, b: FlatBounds) => void;
  /** Strength of the trace relief. */
  bump?: number;
  edgeMaterial?: MeshPhysicalMaterial;
}

/**
 * A printed circuit board: glossy solder mask with painted copper, pads and
 * silkscreen on both faces, and FR-4 laminate on the edges. The top surface
 * sits at y = 0; the board extends down to y = −thickness.
 */
export function Board({
  id,
  outline,
  thickness = 1.6,
  mask = "green",
  ppm = 10,
  bottomPpm,
  paintTop,
  paintBottom,
  bump = 0.6,
  edgeMaterial,
}: BoardProps) {
  const { top, bottom, walls, topMat, bottomMat } = useMemo(() => {
    const pts = outline.getPoints(12) as Vector2[];
    const b = boundsOf(pts);
    const s = pcbSurfaces(mask);
    const shift = (fn?: (p: Painter, s: PcbSurfaces, b: FlatBounds) => void) => (p: Painter) => {
      if (!fn) return;
      // Painter origin = bounds min corner.
      for (const ctx of [p.c, p.m, p.hgt]) ctx.translate(-b.minX, -b.minY);
      fn(p, s, b);
    };
    const mapsTop = painted(`${id}:top`, b.w, b.h, ppm, s.mask, shift(paintTop));
    const mapsBottom = painted(`${id}:bottom`, b.w, b.h, bottomPpm ?? Math.min(ppm, 6), s.mask, (p) => {
      if (!paintBottom) return;
      // Mirror horizontally so the drawing reads correctly from below.
      p.mirrorText = true;
      for (const ctx of [p.c, p.m, p.hgt]) {
        ctx.translate(b.w, 0);
        ctx.scale(-1, 1);
        ctx.translate(-b.minX, -b.minY);
      }
      paintBottom(p, s, b);
    });
    const mat = (maps: ReturnType<typeof painted>) =>
      new MeshPhysicalMaterial({
        map: maps.map,
        roughnessMap: maps.rmMap,
        metalnessMap: maps.rmMap,
        bumpMap: maps.bumpMap,
        bumpScale: bump,
        roughness: 1,
        metalness: 1,
        clearcoat: 0.35,
        clearcoatRoughness: 0.4,
      });
    return {
      top: flatFace(outline, b, false),
      bottom: flatFace(outline, b, true),
      walls: extrudedWalls(outline, thickness),
      topMat: mat(mapsTop),
      bottomMat: mat(mapsBottom),
    };
  }, [id, outline, thickness, mask, ppm, bottomPpm, paintTop, paintBottom, bump]);

  return (
    <group>
      <mesh geometry={top} material={topMat} receiveShadow castShadow />
      <mesh geometry={bottom} material={bottomMat} position-y={-thickness} receiveShadow />
      <mesh geometry={walls} material={edgeMaterial ?? MAT.fr4} receiveShadow castShadow />
    </group>
  );
}
