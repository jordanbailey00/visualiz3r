"use client";

import { BoxGeometry, CylinderGeometry, DoubleSide, ExtrudeGeometry, Shape, type BufferGeometry } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Part } from "../../Part";
import { Board } from "../../kit/Board";
import { cached } from "../../kit/geometry";
import { MAT, variant } from "../../kit/materials";
import { SmdField } from "../../kit/Passives";
import { BOTTOM_PINS, KEY_M, M2, MOUNT, PINS, TOP_PINS, pinZ } from "./layout";
import { paintSsdBottom, paintSsdTop } from "./paintBoard";
import { laminateEdge } from "./markings";
import { AC_CAPS, SSD_PASSIVES } from "./passives";
import { Controller, Crystal, Dram, Inductors, Pmic, TestPoints, ThermalSensor } from "./SsdChips";

/**
 * M.2 2280 outline: 80 × 22 mm with rounded corners, the M-key slot (1.2 mm
 * wide, 3.5 mm deep, full-radius end) in the connector edge and the
 * half-moon notch (Ø3.5) for the retention screw at the far end. The
 * connector edge itself is the chamfered strip built separately below.
 */
function ssdOutline() {
  const x0 = M2.x0 + M2.bevel;
  const c = M2.corner;
  const kw = KEY_M.w / 2;
  const kx = M2.x0 + KEY_M.depth - kw;
  const s = new Shape();
  s.moveTo(x0, M2.z0 + c);
  s.absarc(x0 + c, M2.z0 + c, c, Math.PI, 1.5 * Math.PI, false);
  s.lineTo(M2.x1 - c, M2.z0);
  s.absarc(M2.x1 - c, M2.z0 + c, c, 1.5 * Math.PI, 2 * Math.PI, false);
  s.lineTo(M2.x1, -MOUNT.r);
  s.absarc(M2.x1, 0, MOUNT.r, 1.5 * Math.PI, 0.5 * Math.PI, true);
  s.lineTo(M2.x1, M2.z1 - c);
  s.absarc(M2.x1 - c, M2.z1 - c, c, 0, 0.5 * Math.PI, false);
  s.lineTo(x0 + c, M2.z1);
  s.absarc(x0 + c, M2.z1 - c, c, 0.5 * Math.PI, Math.PI, false);
  s.lineTo(x0, KEY_M.z + kw);
  s.lineTo(kx, KEY_M.z + kw);
  s.absarc(kx, KEY_M.z, kw, 0.5 * Math.PI, -0.5 * Math.PI, true);
  s.lineTo(x0, KEY_M.z - kw);
  s.closePath();
  return s;
}

export const SSD_OUTLINE = ssdOutline();


/** Gold contacts on both faces: 34 on top (odd pins), 33 underneath (even). */
function fingerGeometry() {
  return cached("ssd-fingers", () => {
    const parts: BufferGeometry[] = [];
    const t = 0.03;
    for (const n of TOP_PINS) {
      const b = new BoxGeometry(PINS.topLen, t, PINS.padW);
      b.translate(M2.x0 + PINS.lead + PINS.topLen / 2, t / 2, pinZ(n));
      parts.push(b);
    }
    for (const n of BOTTOM_PINS) {
      const b = new BoxGeometry(PINS.bottomLen, t, PINS.padW);
      b.translate(M2.x0 + PINS.lead + PINS.bottomLen / 2, -M2.t - t / 2, pinZ(n));
      parts.push(b);
    }
    return mergeGeometries(parts)!;
  });
}

/** The 20° lead-in chamfer along the connector edge (either side of the key). */
function bevelGeometry() {
  return cached("ssd-bevel", () => {
    const drop = M2.bevel * Math.tan((20 * Math.PI) / 180);
    const prof = new Shape();
    prof.moveTo(M2.x0 + M2.bevel, 0);
    prof.lineTo(M2.x0, -drop);
    prof.lineTo(M2.x0, -M2.t + drop);
    prof.lineTo(M2.x0 + M2.bevel, -M2.t);
    prof.closePath();
    const segs: [number, number][] = [
      [M2.z0 + M2.corner, KEY_M.z - KEY_M.w / 2],
      [KEY_M.z + KEY_M.w / 2, M2.z1 - M2.corner],
    ];
    const parts = segs.map(([a, b]) => {
      const g = new ExtrudeGeometry(prof, { depth: b - a, bevelEnabled: false });
      g.translate(0, 0, a);
      return g;
    });
    return mergeGeometries(parts)!;
  });
}

/** Plated wall of the half-moon notch (it grounds the module through the screw). */
function notchPlating() {
  return cached("ssd-notch-plating", () => {
    const g = new CylinderGeometry(MOUNT.r, MOUNT.r, M2.t, 28, 1, true, Math.PI, Math.PI);
    g.translate(M2.x1, -M2.t / 2, 0);
    return g;
  });
}

const goldBothSides = () => variant("ssd-gold-ds", MAT.gold, { side: DoubleSide });

export function SsdBoard() {
  const P = SSD_PASSIVES;
  return (
    <>
      <Board
        id="ssd-pcb"
        outline={SSD_OUTLINE}
        thickness={M2.t}
        mask="black"
        ppm={40}
        paintTop={paintSsdTop}
        paintBottom={paintSsdBottom}
        bump={0.34}
        edgeMaterial={laminateEdge()}
      />
      <mesh geometry={notchPlating()} material={goldBothSides()} />

      <Part id="edge-connector">
        <mesh geometry={fingerGeometry()} material={MAT.gold} receiveShadow />
        <mesh geometry={bevelGeometry()} material={laminateEdge()} receiveShadow />
      </Part>

      <Controller />
      <Dram />
      <Pmic />
      <Inductors />
      <Crystal />
      <ThermalSensor />
      <TestPoints />

      <Part id="smd-passives">
        <SmdField items={P.c0201} size="0201" kind="cap" />
        <SmdField items={P.r0201} size="0201" kind="res" />
        <SmdField items={P.c0402} size="0402" kind="cap" />
        <SmdField items={P.r0402} size="0402" kind="res" />
        <SmdField items={P.c0603} size="0603" kind="cap" />
        <SmdField items={P.c0805} size="0805" kind="cap" />
      </Part>
      <Part id="ac-caps">
        <SmdField items={AC_CAPS} size="0201" kind="cap" />
      </Part>
    </>
  );
}
