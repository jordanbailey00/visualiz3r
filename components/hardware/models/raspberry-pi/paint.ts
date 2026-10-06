import { MeshPhysicalMaterial, PlaneGeometry } from "three";
import { painted, type Surface } from "@/lib/three/painter";
import { cached } from "../../kit/geometry";

const mats = new Map<string, MeshPhysicalMaterial>();

/**
 * A cached painted material for small surfaces (markings, labels, stamped
 * metal): colour, roughness/metalness and bump all come from one Painter pass.
 * Decal-friendly by default (polygon offset so it never z-fights its body).
 */
export function paintedMaterial(
  key: string,
  w: number,
  d: number,
  ppm: number,
  base: Surface,
  paint: Parameters<typeof painted>[5],
  extra: ConstructorParameters<typeof MeshPhysicalMaterial>[0] = {},
) {
  let m = mats.get(key);
  if (m) return m;
  const maps = painted(`pi5:${key}`, w, d, ppm, base, paint);
  m = new MeshPhysicalMaterial({
    map: maps.map,
    roughnessMap: maps.rmMap,
    metalnessMap: maps.rmMap,
    bumpMap: maps.bumpMap,
    bumpScale: 0.35,
    roughness: 1,
    metalness: 1,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    ...extra,
  });
  mats.set(key, m);
  return m;
}

/** A w × d plane lying in XZ, facing +Y (painted canvas top = −Z). */
export function decalUp(w: number, d: number) {
  return cached(`pi5-decal-up:${w}:${d}`, () => {
    const g = new PlaneGeometry(w, d);
    g.rotateX(-Math.PI / 2);
    return g;
  });
}

/** A w × d plane lying in XZ, facing −Y (for undersides). */
export function decalDown(w: number, d: number) {
  return cached(`pi5-decal-down:${w}:${d}`, () => {
    const g = new PlaneGeometry(w, d);
    g.rotateX(Math.PI / 2);
    return g;
  });
}
