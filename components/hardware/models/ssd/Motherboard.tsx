"use client";

import { useMemo } from "react";
import { BoxGeometry, CylinderGeometry, LatheGeometry, Vector2, type BufferGeometry } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Painter } from "@/lib/three/painter";
import type { PcbSurfaces } from "@/lib/three/pcbPaint";
import { Part } from "../../Part";
import { Board } from "../../kit/Board";
import { Screw } from "../../kit/Fasteners";
import { cached, circlePath, roundedRectShape } from "../../kit/geometry";
import { MAT, variant } from "../../kit/materials";
import { SmdField, rowOf } from "../../kit/Passives";
import { KEY_M, MB, MB_TOP, MODULE_GAP, M2, SOCKET, STANDOFF, STANDOFF_X, pinZ } from "./layout";
import { laminateEdge } from "./markings";
import { paintMotherboard } from "./paintBoard";

function mbOutline() {
  const s = roundedRectShape(MB.x0, MB.z0, MB.x1 - MB.x0, MB.z1 - MB.z0, 2.5);
  for (const x of Object.values(STANDOFF_X)) s.holes.push(circlePath(x, 0, 2.1));
  return s;
}
const MB_OUTLINE = mbOutline();

function paintTop(p: Painter, s: PcbSurfaces) {
  paintMotherboard(p, s);
}

/** Decoupling capacitors for the slot's 3.3 V supply. */
const MB_CAPS = [...rowOf(-47.5, 13.6, -40.5, 13.6, 5, 0), ...rowOf(-47.5, -13.6, -44.5, -13.6, 3, 0)];
const MB_BULK = rowOf(-48.5, 11.4, -45.5, 11.4, 2, 0);

/** Black-oxide steel screw and a brass standoff, as shipped with most boards. */
const screwMat = () => variant("ssd-screw", MAT.steelDark, { color: "#34373d", roughness: 0.36 });
const brass = () => variant("ssd-brass", MAT.gold, { color: "#c7a35e", roughness: 0.34 });

/** Glass-filled LCP connector housing. */
const lcp = () => variant("ssd-lcp", MAT.plasticSatin, { color: "#141518", roughness: 0.5 });

/**
 * Top-mount M.2 socket, built in motherboard-top coordinates (y = 0 is the
 * board surface). The module slides into the slot on the +X face; a moulded
 * key rib at pin 59–66 rejects anything but an M-key card.
 */
function socketGeometry() {
  return cached("ssd-socket-body", () => {
    const { back, front, halfW, slotHalfW, slotBack } = SOCKET;
    const top = SOCKET.top - MB_TOP;
    const lo = SOCKET.slotLow - MB_TOP;
    const hi = SOCKET.slotHigh - MB_TOP;
    const parts: BufferGeometry[] = [];
    const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => {
      const b = new BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
      b.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      parts.push(b);
    };
    box(back, front, 0.08, lo, -halfW, halfW);
    box(back, front - 0.7, hi, top, -halfW, halfW);
    box(back, slotBack, lo, hi, -halfW, halfW);
    for (const s of [-1, 1]) box(back, front, lo, hi, s > 0 ? slotHalfW : -halfW, s > 0 ? halfW : -slotHalfW);
    // Key rib inside the slot.
    box(slotBack, M2.x0 + KEY_M.depth - 0.55, lo, hi, KEY_M.z - 0.42, KEY_M.z + 0.42);
    // Chamfered lead-in lip on the lower block.
    const lip = new BoxGeometry(0.5, 0.35, 2 * slotHalfW);
    lip.rotateZ(-0.6);
    lip.translate(front - 0.1, lo - 0.12, 0);
    parts.push(lip);
    return mergeGeometries(parts)!;
  });
}

function socketContacts() {
  return cached("ssd-socket-contacts", () => {
    const lo = SOCKET.slotLow - MB_TOP;
    const hi = SOCKET.slotHigh - MB_TOP;
    const parts: BufferGeometry[] = [];
    for (let n = 1; n <= 75; n++) {
      if (n >= 59 && n <= 66) continue;
      const z = pinZ(n);
      const odd = n % 2 === 1;
      // Spring finger that wipes the module pad.
      const f = new BoxGeometry(2.4, 0.09, 0.2);
      f.rotateZ(odd ? 0.16 : -0.16);
      f.translate(-39.0, odd ? hi - 0.17 : lo + 0.17, z);
      parts.push(f);
    }
    return mergeGeometries(parts)!;
  });
}

function socketTails() {
  return cached("ssd-socket-tails", () => {
    const parts: BufferGeometry[] = [];
    const back = SOCKET.back;
    for (let n = 1; n <= 75; n++) {
      if (n >= 59 && n <= 66) continue;
      const z = pinZ(n);
      const odd = n % 2 === 1;
      const len = odd ? 1.7 : 1.0;
      const foot = new BoxGeometry(len, 0.1, 0.18);
      foot.translate(back - len / 2, 0.05, z);
      const riser = new BoxGeometry(0.1, 1.1, 0.18);
      riser.translate(back - 0.05, 0.55, z);
      parts.push(foot, riser);
    }
    // Stamped hold-down brackets soldered at both ends.
    for (const s of [-1, 1]) {
      const plate = new BoxGeometry(3.6, 2.6, 0.2);
      plate.translate(SOCKET.back + 2.5, 1.3, s * (SOCKET.halfW + 0.1));
      const foot = new BoxGeometry(3.6, 0.15, 1.4);
      foot.translate(SOCKET.back + 2.5, 0.075, s * (SOCKET.halfW - 0.2));
      parts.push(plate, foot);
    }
    return mergeGeometries(parts)!;
  });
}

/** Contact cavities moulded into the top of the housing. */
function socketSlits() {
  return cached("ssd-socket-slits", () => {
    const parts: BufferGeometry[] = [];
    for (let n = 1; n <= 75; n += 2) {
      if (n >= 59 && n <= 66) continue;
      const b = new BoxGeometry(2.6, 0.02, 0.24);
      b.translate(SOCKET.back + 2.2, SOCKET.top - MB_TOP + 0.005, pinZ(n));
      parts.push(b);
    }
    return mergeGeometries(parts)!;
  });
}

/** M2 threaded shank: a lathe profile with real thread crests. */
function shankGeometry(len: number) {
  return cached(`ssd-shank:${len}`, () => {
    const pts: Vector2[] = [new Vector2(0, 0)];
    const pitch = 0.4;
    for (let y = 0.15; y < len - 0.2; y += pitch) {
      pts.push(new Vector2(0.84, -y), new Vector2(1.0, -y - pitch / 2));
    }
    pts.push(new Vector2(0.84, -len + 0.1), new Vector2(0.55, -len), new Vector2(0, -len));
    return new LatheGeometry(pts.reverse(), 20);
  });
}

export function M2Socket() {
  return (
    <group position-y={MB_TOP}>
      <mesh geometry={socketGeometry()} material={lcp()} castShadow receiveShadow />
      <mesh geometry={socketSlits()} material={MAT.rubber} />
      <mesh geometry={socketContacts()} material={MAT.gold} />
      <mesh geometry={socketTails()} material={MAT.tin} castShadow />
    </group>
  );
}

export function StandoffPost() {
  const geos = useMemo(
    () => ({
      hex: cached("ssd-standoff", () => new CylinderGeometry(STANDOFF.r, STANDOFF.r, STANDOFF.h, 6).translate(0, STANDOFF.h / 2, 0)),
      fillet: cached("ssd-standoff-fillet", () => new CylinderGeometry(2.55, 2.9, 0.12, 28).translate(0, 0.06, 0)),
      hole: cached("ssd-standoff-hole", () => new CylinderGeometry(0.95, 0.95, 0.02, 20).translate(0, STANDOFF.h + 0.004, 0)),
    }),
    [],
  );
  return (
    <group position={[STANDOFF_X["2280"], MB_TOP, 0]}>
      <mesh geometry={geos.fillet} material={MAT.tin} receiveShadow />
      <mesh geometry={geos.hex} material={brass()} castShadow receiveShadow />
      <mesh geometry={geos.hole} material={MAT.rubber} />
    </group>
  );
}

/** M2 × 3 pan-head screw (head sits on the module's half-moon ground pad). */
export function MountScrew() {
  return (
    <group>
      <Screw diameter={4.4} height={1.0} kind="pan" drive="phillips" material={screwMat()} />
      <mesh geometry={shankGeometry(MODULE_GAP + M2.t + 0.6)} material={screwMat()} castShadow />
    </group>
  );
}

export function Motherboard() {
  return (
    <Part id="motherboard">
      <group position-y={MB_TOP}>
        <Board id="ssd-mb" outline={MB_OUTLINE} thickness={MB.t} mask="black" ppm={12} paintTop={paintTop} bump={0.3} edgeMaterial={laminateEdge()} />
        <SmdField items={MB_CAPS} size="0402" kind="cap" />
        <SmdField items={MB_BULK} size="0805" kind="cap" />
      </group>
      <Part id="m2-socket">
        <M2Socket />
      </Part>
      <Part id="standoff">
        <StandoffPost />
      </Part>
    </Part>
  );
}
