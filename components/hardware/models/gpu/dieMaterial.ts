"use client";

import { MeshPhysicalMaterial } from "three";
import { gpuFloorplan, paintDie } from "@/lib/three/dieShot";
import { painted } from "@/lib/three/painter";
import { GPU } from "./layout";

/** Painted area of the die's circuit side (die size minus a small border). */
export const DIE_ART = { w: GPU.die[0] - 0.1, h: GPU.die[2] - 0.1 };

let dieShotMat: MeshPhysicalMaterial | null = null;
/** The die's circuit side: a procedural floorplan of GPCs, SMs, L2 and PHYs. */
export function gpuDieShotMaterial() {
  if (dieShotMat) return dieShotMat;
  const maps = painted("gpu-dieshot", DIE_ART.w, DIE_ART.h, 44, { color: "#14181c", rough: 0.2, metal: 0.6, height: 0.5 }, (p) =>
    paintDie(p, gpuFloorplan(DIE_ART.w, DIE_ART.h), 3),
  );
  dieShotMat = new MeshPhysicalMaterial({
    map: maps.map,
    roughnessMap: maps.rmMap,
    metalnessMap: maps.rmMap,
    roughness: 1,
    metalness: 1,
    iridescence: 0.6,
    iridescenceIOR: 1.8,
    iridescenceThicknessRange: [200, 700],
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  return dieShotMat;
}
