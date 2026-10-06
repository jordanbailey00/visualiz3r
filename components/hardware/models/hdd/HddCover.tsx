"use client";

import { useMemo } from "react";
import { BufferGeometry, Matrix4 } from "three";
import { Part } from "../../Part";
import { cached, extrudedWalls, flatFace, roundedRectShape } from "../../kit/geometry";
import { MAT } from "../../kit/materials";
import { TorxScrews } from "./Screws";
import { circlePts, lathe, merge, placed, roundedRectPts, shapeOf, slab } from "./geom";
import { BREATHER, COVER_SCREWS, DRIVE, PIVOT, SPINDLE, Y } from "./layout";
import { HM, LABEL } from "./materials";

/** All screws that go through the cover: perimeter, spindle shaft and pivot shaft. */
const ALL_SCREWS: [number, number][] = [...COVER_SCREWS, [SPINDLE.x, SPINDLE.z], [PIVOT.x, PIVOT.z]];
const SINK = { rTop: 3.25, rBottom: 2.45, depth: 0.5 };

/** Planar UVs spanning the drive footprint (the cover texture's canvas). */
function footprintUV(g: BufferGeometry) {
  const pos = g.getAttribute("position");
  const uv = g.getAttribute("uv");
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (pos.getX(i) + DRIVE.halfL) / DRIVE.length, 1 - (pos.getZ(i) + DRIVE.halfW) / DRIVE.width);
  }
  uv.needsUpdate = true;
  return g;
}

/** Stamped stainless cover plate with screw counter-sinks and the breather hole. */
export function CoverPlate() {
  const { plate, sinks } = useMemo(
    () => ({
      plate: cached("hdd-cover-plate", () => {
        const outline = roundedRectPts(-DRIVE.halfL + 0.2, -DRIVE.halfW + 0.2, DRIVE.halfL - 0.2, DRIVE.halfW - 0.2, DRIVE.cornerR - 0.2, 8);
        const holes = [...ALL_SCREWS.map(([x, z]) => circlePts(x, z, SINK.rTop, 40)), circlePts(BREATHER.x, BREATHER.z, 0.75, 16)];
        return footprintUV(slab(shapeOf(outline, holes), Y.gasketTop, Y.coverTop, 0.3, 16));
      }),
      sinks: cached("hdd-cover-sinks", () => {
        // A conical dimple pressed into the sheet around each screw.
        const cone = lathe(
          [
            [SINK.rTop, Y.coverTop],
            [SINK.rBottom, Y.coverTop - SINK.depth],
            [2.0, Y.coverTop - SINK.depth],
            [2.0, Y.coverTop - SINK.depth - 0.8],
            [SINK.rTop + 0.01, Y.gasketTop],
          ],
          40,
        );
        return merge(ALL_SCREWS.map(([x, z]) => placed(cone, new Matrix4().makeTranslation(x, 0, z))));
      }),
    }),
    [],
  );
  return (
    <group>
      <mesh geometry={plate} material={HM.cover} castShadow receiveShadow />
      <mesh geometry={sinks} material={HM.coverPlain} castShadow receiveShadow />
    </group>
  );
}

/** The paper product label (painted texture), slightly proud of the cover. */
export function Label() {
  const { face, edge } = useMemo(() => {
    const w = LABEL.x1 - LABEL.x0;
    const d = LABEL.z1 - LABEL.z0;
    const shape = roundedRectShape(LABEL.x0, LABEL.z0, w, d, 1.6);
    return {
      face: cached("hdd-label-face", () => flatFace(shape, { minX: LABEL.x0, minY: LABEL.z0, w, h: d }, false, 6)),
      edge: cached("hdd-label-edge", () => extrudedWalls(shape, 0.07, 6)),
    };
  }, []);
  return (
    <group position-y={Y.labelTop}>
      <mesh geometry={face} material={HM.label} receiveShadow />
      <mesh geometry={edge} material={MAT.labelWhite} />
    </group>
  );
}

/** Form-in-place rubber gasket that seals the cover to the casting. */
export function Gasket() {
  const geo = useMemo(
    () =>
      cached("hdd-gasket", () => {
        const o = roundedRectPts(-72.7, -49.95, 72.7, 49.95, 2.2, 8);
        const i = roundedRectPts(-71.5, -48.75, 71.5, 48.75, 1.2, 8).reverse();
        return slab(shapeOf(o, [i]), Y.wallTop, Y.gasketTop, 0.06);
      }),
    [],
  );
  return <mesh geometry={geo} material={MAT.rubber} receiveShadow />;
}

export function CoverScrews() {
  const pts = useMemo(() => ALL_SCREWS.map(([x, z]): [number, number, number] => [x, Y.coverTop - SINK.depth, z]), []);
  return <TorxScrews points={pts} d={4.3} h={0.5} material={HM.screw} />;
}

/**
 * Cover assembly, built around its own centre so it can tilt as it lifts.
 * Everything inside is marked as a cover for X-ray.
 */
export function CoverAssembly({ centerY }: { centerY: number }) {
  return (
    <group position-y={-centerY}>
      <CoverPlate />
      <Part id="label" explode={[0, 2.5, 0]} explodeRange={[0.3, 0.55]}>
        <Label />
      </Part>
      <Part id="gasket" explode={[0, -9, 0]} explodeRange={[0.18, 0.5]}>
        <Gasket />
      </Part>
      <Part id="cover-screws" explode={[0, 9, 0]} explodeRange={[0, 0.28]}>
        <CoverScrews />
      </Part>
    </group>
  );
}
