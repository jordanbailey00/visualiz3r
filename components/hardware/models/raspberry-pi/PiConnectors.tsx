"use client";

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
  Path,
  Shape,
  type BufferGeometry,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { useExplorer } from "@/lib/hardware/store";
import { FONT_COND, FONT_SANS, rng } from "@/lib/three/painter";
import { UsbC } from "../../kit/Connectors";
import { cached, roundedBox } from "../../kit/geometry";
import { MAT, emissive, variant } from "../../kit/materials";
import { decalDown, decalUp, paintedMaterial } from "./paint";
import { ETH, PCB } from "./layout";

type Vec3 = [number, number, number];
type Pt = [number, number];

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function shapeOf(pts: Pt[]) {
  const s = new Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) s.lineTo(p[0], p[1]);
  s.closePath();
  return s;
}

function pathOf(pts: Pt[]) {
  const s = new Path();
  s.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) s.lineTo(p[0], p[1]);
  s.closePath();
  return s;
}

const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

/** Extrude an (x, y) outline with holes along −Z from z = 0 to z = −depth. */
function extrudeBack(outer: Pt[], holes: Pt[][], depth: number, bevel = 0) {
  const s = shapeOf(outer);
  for (const h of holes) s.holes.push(pathOf([...h].reverse()));
  const g = new ExtrudeGeometry(s, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments: 6,
  });
  g.translate(0, 0, -depth);
  return g;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
  const b = new BoxGeometry(w, h, d);
  if (rx) b.rotateX(rx);
  if (ry) b.rotateY(ry);
  if (rz) b.rotateZ(rz);
  b.translate(x, y, z);
  return b;
}

function merge(parts: BufferGeometry[]) {
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => {
    if (!g.getAttribute("normal")) g.computeVertexNormals();
    return g;
  }))!;
}

/**
 * Through-hole legs poking out of the underside, each with a solder fillet.
 * Coordinates are in the connector's local frame (y = 0 is the board top).
 */
function legsGeometry(key: string, legs: [x: number, z: number, w: number, d: number][]) {
  return cached(`pi5-legs:${key}`, () => {
    const parts: BufferGeometry[] = [];
    const bottom = -PCB.t;
    for (const [x, z, w, d] of legs) {
      parts.push(box(w, PCB.t + 1.5, d, x, bottom - 1.3 + (PCB.t + 1.5) / 2, z));
      const f = new CylinderGeometry(Math.max(w, d) * 0.55, Math.max(w, d) * 1.05, 0.45, 12);
      f.translate(x, bottom - 0.225, z);
      parts.push(f);
    }
    return merge(parts);
  });
}

function Legs({ id, legs }: { id: string; legs: [number, number, number, number][] }) {
  return <mesh geometry={legsGeometry(id, legs)} material={MAT.tin} castShadow />;
}

/** Nickel-plated steel shells: bright, but satin rather than mirror-like. */
const shellMetal = () => variant("pi5-shell", MAT.nickel, { color: "#cfd2d6", roughness: 0.42, metalness: 0.85 });
const ethShield = () => variant("pi5-eth-shield", MAT.tin, { color: "#d0d3d7", roughness: 0.46, metalness: 0.82 });
const beige = () => variant("pi5-beige", MAT.nylon, { color: "#e9e0cb", roughness: 0.5 });
const jstWhite = () => variant("pi5-jst", MAT.nylon, { color: "#efeadf", roughness: 0.52 });
/** Brass for the mounting standoffs. */
export const brassMaterial = () => variant("pi5-brass", MAT.gold, { color: "#c9a55e", roughness: 0.32 });

/**
 * Painted top of a stamped steel shell: embossed panel, folded seam with
 * dovetail locks, spring tabs and dimples (bump-mapped). Canvas top = back.
 */
function shellTopMaterial(kind: "usb" | "eth", w: number, d: number) {
  return paintedMaterial(`shell-top:${kind}`, w, d, 40, { color: "#cfd2d6", rough: 0.42, metal: 0.85, height: 0.5 }, (p) => {
    const raised = { color: "#d4d7db", rough: 0.4, metal: 0.85, height: 0.62 };
    const cut = { color: "#5d6167", rough: 0.6, metal: 0.6, height: 0.15 };
    const dim = { color: "#c2c5ca", rough: 0.46, metal: 0.85, height: 0.38 };
    p.roundRect(0.7, 0.7, w - 1.4, d - 1.4, 0.8, raised);
    p.roundRect(1.1, 1.1, w - 2.2, d - 2.2, 0.6, { color: "#cfd2d6", rough: 0.42, metal: 0.85, height: 0.5 });
    // Folded seam with dovetail locks.
    const seamY = kind === "usb" ? 2.6 : d / 2;
    if (kind === "usb") {
      p.polyline([[0.4, seamY], [w - 0.4, seamY]], 0.08, cut);
      for (let i = 0; i < 3; i++) {
        const x = w * (0.25 + i * 0.25);
        p.polyline([[x - 0.7, seamY], [x - 0.9, seamY - 0.9], [x + 0.9, seamY - 0.9], [x + 0.7, seamY]], 0.08, cut);
      }
    } else {
      p.polyline([[w / 2, 0.4], [w / 2, d - 0.4]], 0.08, cut);
      for (let i = 0; i < 4; i++) {
        const y = d * (0.18 + i * 0.22);
        p.polyline([[w / 2, y - 0.7], [w / 2 + 0.9, y - 0.9], [w / 2 + 0.9, y + 0.9], [w / 2, y + 0.7]], 0.08, cut);
      }
    }
    // Spring tabs (U-shaped cuts) and round dimples near the front.
    const tabY = d - (kind === "usb" ? 5.0 : 6.0);
    for (const x of kind === "usb" ? [w * 0.27, w * 0.73] : [w * 0.25, w * 0.75]) {
      p.polyline([[x - 0.9, tabY + 2.6], [x - 0.9, tabY], [x + 0.9, tabY], [x + 0.9, tabY + 2.6]], 0.1, cut);
      p.rect(x - 0.75, tabY + 0.15, 1.5, 2.3, { ...raised, height: 0.7 });
      p.circle(x, kind === "usb" ? 6.2 : 4.2, 0.55, dim);
    }
  }, { bumpScale: 0.6, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
}

// ---------------------------------------------------------------------------
// 40-pin header (also used for the PoE header)
// ---------------------------------------------------------------------------

const dummy = new Object3D();

/** Square 0.64 mm pin with chamfered tips; spans the board (tail below). */
function pinGeometry(length: number) {
  return cached(`pi5-pin:${length}`, () => {
    const s = 0.64;
    const tail = PCB.t + 1.6;
    const body = box(s, length + tail - 0.6, s, 0, (length - tail) / 2, 0);
    const tip = new ConeGeometry(s * 0.72, 0.3, 4, 1);
    tip.rotateY(Math.PI / 4);
    // Bottom (solder-tail) tip: a fresh cone pointing down at the end of the tail.
    const tip2 = tip.clone();
    tip2.rotateX(Math.PI);
    tip2.translate(0, -(tail - 0.15), 0);
    tip.translate(0, length - 0.15, 0);
    return merge([body, tip, tip2]);
  });
}

/** Segmented black base: one moulded cell per pin column. */
function headerBaseGeometry(cols: number, rows: number, pitch: number) {
  return cached(`pi5-hdr-base:${cols}:${rows}`, () => {
    const parts: BufferGeometry[] = [];
    for (let i = 0; i < cols; i++) {
      const g = roundedBox(pitch - 0.07, 2.5, rows * pitch - 0.04, 0.16).clone();
      g.translate((i - (cols - 1) / 2) * pitch, 1.25, 0);
      parts.push(g);
    }
    return mergeGeometries(parts)!;
  });
}

function filletGeometry() {
  return cached("pi5-pin-fillet", () => {
    const g = new CylinderGeometry(0.42, 0.78, 0.5, 14);
    g.translate(0, -PCB.t - 0.25, 0);
    return g;
  });
}

/** 2-row pin header: segmented base, gold pins with soldered tails underneath. */
export function PinHeader2({ cols, rows = 2, pitch = 2.54, pinLength = 8.5, position }: { cols: number; rows?: number; pitch?: number; pinLength?: number; position?: Vec3 }) {
  const pins = useRef<InstancedMesh>(null);
  const fillets = useRef<InstancedMesh>(null);
  const n = cols * rows;
  useLayoutEffect(() => {
    for (const ref of [pins, fillets]) {
      const m = ref.current;
      if (!m) continue;
      let k = 0;
      for (let j = 0; j < rows; j++)
        for (let i = 0; i < cols; i++) {
          dummy.position.set((i - (cols - 1) / 2) * pitch, 0, (j - (rows - 1) / 2) * pitch);
          dummy.updateMatrix();
          m.setMatrixAt(k++, dummy.matrix);
        }
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
    }
  }, [cols, rows, pitch]);
  return (
    <group position={position}>
      <mesh geometry={headerBaseGeometry(cols, rows, pitch)} material={MAT.plasticBlack} castShadow receiveShadow />
      <instancedMesh ref={pins} args={[pinGeometry(pinLength), MAT.gold, n]} castShadow receiveShadow />
      <instancedMesh ref={fillets} args={[filletGeometry(), MAT.tin, n]} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Stacked USB-A (local frame: opening toward +Z, body to −Z, base at y = 0)
// ---------------------------------------------------------------------------

const USB = { W: 13.2, H: 15.6, D: 17.4, ow: 12.5, oh: 5.12, ports: [1.55, 8.83] };

function usbShellGeometry() {
  return cached("pi5-usb-shell", () => {
    const { W, H, D, ow, oh, ports } = USB;
    const holes = ports.map((y) => rect(-ow / 2, y, ow / 2, y + oh));
    const front = extrudeBack(rect(-W / 2, 0, W / 2, H), holes, 12.0);
    const rear = box(W, H, D - 12, 0, H / 2, -12 - (D - 12) / 2);
    // Front flange: the shell edge rolled outward around the openings.
    const flange = extrudeBack(rect(-W / 2 - 0.45, -0.1, W / 2 + 0.45, H + 0.3), ports.map((y) => rect(-ow / 2 - 0.05, y - 0.05, ow / 2 + 0.05, y + oh + 0.05)), 0.35);
    flange.translate(0, 0, 0.35);
    // Grounding spring fingers bent into each opening (top and bottom walls).
    const springs: BufferGeometry[] = [];
    for (const y of ports) {
      for (const x of [-3.6, 3.6]) {
        springs.push(box(1.3, 0.12, 3.0, x, y + oh - 0.28, -2.4, -0.16));
        springs.push(box(1.3, 0.12, 3.0, x, y + 0.28, -2.4, 0.16));
      }
    }
    // Stiffening ribs on the sides (the top's stamping is a painted decal).
    const ribs: BufferGeometry[] = [];
    for (const sx of [-1, 1]) ribs.push(box(0.08, 3.2, 5.5, sx * (W / 2 + 0.04), H / 2, -9));
    return merge([front, rear, flange, ...springs, ...ribs]);
  });
}

/** Plastic tongues in the upper half of each opening (contacts on their underside). */
function usbTongueGeometry() {
  return cached("pi5-usb-tongue", () => {
    const { oh, ports } = USB;
    return merge(ports.map((y) => box(11.1, 1.84, 9.8, 0, y + oh - 0.62 - 0.92, -1.6 - 4.9)));
  });
}

function usbContactGeometry(usb3: boolean) {
  return cached(`pi5-usb-contacts:${usb3}`, () => {
    const { oh, ports } = USB;
    const parts: BufferGeometry[] = [];
    for (const y of ports) {
      const under = y + oh - 0.62 - 1.84 - 0.03;
      for (const x of [-3.75, -1.25, 1.25, 3.75]) parts.push(box(1.0, 0.06, 5.6, x, under, -2.4 - 2.8));
      if (usb3) for (const x of [-3.0, -1.5, 0, 1.5, 3.0]) parts.push(box(0.62, 0.06, 2.6, x, under, -8.6 - 1.3));
    }
    return merge(parts);
  });
}

/** Back walls plus a dark liner inside each cavity (the shell's inside is in shadow). */
function usbBackWalls() {
  return cached("pi5-usb-back", () => {
    const { ow, oh, ports } = USB;
    const parts: BufferGeometry[] = [];
    for (const y of ports) {
      parts.push(box(ow - 0.1, oh - 0.1, 0.4, 0, y + oh / 2, -11.7));
      const liner = extrudeBack(rect(-ow / 2 + 0.01, y + 0.01, ow / 2 - 0.01, y + oh - 0.01), [rect(-ow / 2 + 0.06, y + 0.06, ow / 2 - 0.06, y + oh - 0.06)], 11.2);
      liner.translate(0, 0, -0.6);
      parts.push(liner);
    }
    return merge(parts);
  });
}

const USB_LEGS: [number, number, number, number][] = [
  [6.75, -13.8, 0.7, 0.35],
  [-6.75, -13.8, 0.7, 0.35],
  [6.75, -3.8, 0.7, 0.35],
  [-6.75, -3.8, 0.7, 0.35],
  ...Array.from({ length: 9 }, (_, k): [number, number, number, number] => [4 - k, k % 2 ? -14.4 : -16.0, 0.35, 0.35]),
];

/** Double-decker USB-A receptacle; `usb3` gives blue tongues and the extra SuperSpeed contacts. */
export function UsbStack({ usb3, position, rotation }: { usb3: boolean; position?: Vec3; rotation?: Vec3 }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh geometry={usbShellGeometry()} material={shellMetal()} castShadow receiveShadow />
      <mesh geometry={decalUp(USB.W - 0.1, USB.D - 0.1)} material={shellTopMaterial("usb", USB.W - 0.1, USB.D - 0.1)} position={[0, USB.H + 0.004, -USB.D / 2]} receiveShadow />
      <mesh geometry={usbBackWalls()} material={MAT.plasticBlack} receiveShadow />
      <mesh geometry={usbTongueGeometry()} material={usb3 ? variant("pi5-usb3-blue", MAT.plasticBlue, { color: "#1d5fd0", roughness: 0.42 }) : MAT.plasticBlack} castShadow receiveShadow />
      <mesh geometry={usbContactGeometry(usb3)} material={MAT.gold} />
      <Legs id="usb" legs={USB_LEGS} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// RJ45 Gigabit Ethernet jack with integrated magnetics
// ---------------------------------------------------------------------------

const ETH_J = { W: 16.0, H: 13.8, D: 21.3 };
const RJ_OPEN: Pt[] = [
  [-5.85, 2.3],
  [-2.2, 2.3],
  [-2.2, 1.1],
  [2.2, 1.1],
  [2.2, 2.3],
  [5.85, 2.3],
  [5.85, 10.2],
  [-5.85, 10.2],
];

function ethShieldGeometry() {
  return cached("pi5-eth-shield", () => {
    const { W, H, D } = ETH_J;
    const hole = rect(-6.25, 0.75, 6.25, 10.6);
    const front = extrudeBack(rect(-W / 2, 0, W / 2, H), [hole], 15);
    const rear = box(W, H, D - 15, 0, H / 2, -15 - (D - 15) / 2);
    // Ground fingers along the front edge and seams on the top.
    const fingers: BufferGeometry[] = [];
    for (const x of [-5.5, -1.8, 1.8, 5.5]) fingers.push(box(1.4, 0.12, 1.5, x, H + 0.1, -1.0, 0.18));
    for (const sx of [-1, 1]) fingers.push(box(0.12, 1.4, 1.5, sx * (W / 2 + 0.1), H - 3.4, -1.0, 0, -sx * 0.18));
    return merge([front, rear, ...fingers]);
  });
}

function ethInsertGeometry() {
  return cached("pi5-eth-insert", () => {
    const insert = extrudeBack(rect(-6.25, 0.75, 6.25, 10.6), [RJ_OPEN], 14.6);
    insert.translate(0, 0, -0.35);
    const back = box(12.2, 9.4, 0.5, 0, 5.6, -14.7);
    return merge([insert, back]);
  });
}

function ethContactGeometry() {
  return cached("pi5-eth-contacts", () => {
    const parts: BufferGeometry[] = [];
    for (let i = 0; i < 8; i++) parts.push(box(0.36, 0.28, 6.5, -3.57 + i * 1.02, 8.4, -6.6, 0.42));
    return merge(parts);
  });
}

/** Signal pins (two staggered rows) and shield legs, matching the painted pads (local frame). */
const ETH_LEGS: [number, number, number, number][] = [
  ...Array.from({ length: 10 }, (_, k): [number, number, number, number] => [4.6 - k * 1.02, ETH.x0 + 2.0 + (k % 2) * 1.6 - ETH.front, 0.4, 0.4]),
  [6.9, ETH.x0 + 9.5 - ETH.front, 1.0, 0.5],
  [-6.9, ETH.x0 + 9.5 - ETH.front, 1.0, 0.5],
];

/** Animated link/activity LED materials (not shared with other devices). */
const ethLinkMat = new MeshStandardMaterial({ color: new Color("#3cff7a").multiplyScalar(0.3), emissive: "#3cff7a", emissiveIntensity: 1.7, roughness: 0.35 });
const ethActMat = new MeshStandardMaterial({ color: new Color("#ffb020").multiplyScalar(0.3), emissive: "#ffb020", emissiveIntensity: 1.7, roughness: 0.35 });

export function EthernetJack({ position, rotation }: { position?: Vec3; rotation?: Vec3 }) {
  const { W, H } = ETH_J;
  useFrame(({ clock }) => {
    if (!useExplorer.getState().animate) {
      ethActMat.emissiveIntensity = 1.7;
      return;
    }
    // Activity LED flickers with traffic; link LED stays solid.
    const t = clock.elapsedTime;
    const burst = Math.sin(t * 1.7) + Math.sin(t * 4.3) > 0.6;
    ethActMat.emissiveIntensity = burst && Math.sin(t * 38) > 0 ? 0.2 : 1.7;
  });
  return (
    <group position={position} rotation={rotation}>
      <mesh geometry={ethShieldGeometry()} material={ethShield()} castShadow receiveShadow />
      <mesh geometry={decalUp(W - 0.1, ETH_J.D - 0.1)} material={shellTopMaterial("eth", W - 0.1, ETH_J.D - 0.1)} position={[0, H + 0.004, -ETH_J.D / 2]} receiveShadow />
      <mesh geometry={ethInsertGeometry()} material={MAT.plasticBlack} receiveShadow />
      <mesh geometry={ethContactGeometry()} material={MAT.gold} />
      {/* Light pipes in the top corners of the face */}
      <mesh geometry={roundedBox(1.9, 1.0, 0.5, 0.15)} material={ethLinkMat} position={[-W / 2 + 2.0, H - 1.6, -0.2]} />
      <mesh geometry={roundedBox(1.9, 1.0, 0.5, 0.15)} material={ethActMat} position={[W / 2 - 2.0, H - 1.6, -0.2]} />
      <Legs id="eth" legs={ETH_LEGS} />
      {/* Plastic locating pegs */}
      {[-5.7, 5.7].map((x) => (
        <mesh key={x} geometry={cached("pi5-eth-peg", () => new CylinderGeometry(1.45, 1.3, PCB.t + 1.2, 16))} material={MAT.plasticBlack} position={[x, -(PCB.t + 1.2) / 2 + 0.05, ETH.x0 + 14.3 - ETH.front]} />
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Micro-HDMI (type D)
// ---------------------------------------------------------------------------

const UHDMI = { W: 6.5, H: 3.4, D: 8.45, c: 0.85 };
const UHDMI_OUT: Pt[] = [
  [-UHDMI.W / 2 + UHDMI.c, 0],
  [UHDMI.W / 2 - UHDMI.c, 0],
  [UHDMI.W / 2, UHDMI.c],
  [UHDMI.W / 2, UHDMI.H],
  [-UHDMI.W / 2, UHDMI.H],
  [-UHDMI.W / 2, UHDMI.c],
];

function insetPts(pts: Pt[], t: number): Pt[] {
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  return pts.map(([x, y]) => [x - Math.sign(x - cx) * t, y - Math.sign(y - cy) * t]);
}

function uhdmiGeometry() {
  return cached("pi5-uhdmi", () => {
    const shell = extrudeBack(UHDMI_OUT, [insetPts(UHDMI_OUT, 0.25)], UHDMI.D);
    // Side wings that hold the shell down.
    const wings = [box(0.25, 2.2, 2.4, UHDMI.W / 2 + 0.12, 1.1, -4.2), box(0.25, 2.2, 2.4, -UHDMI.W / 2 - 0.12, 1.1, -4.2)];
    return merge([shell, ...wings]);
  });
}

function uhdmiInnerGeometry() {
  return cached("pi5-uhdmi-in", () => {
    // Dark liner inside the shell, the back wall and the contact tongue.
    const liner = extrudeBack(insetPts(UHDMI_OUT, 0.27), [insetPts(UHDMI_OUT, 0.33)], UHDMI.D - 0.5);
    liner.translate(0, 0, -0.12);
    return merge([liner, box(UHDMI.W - 0.6, UHDMI.H - 0.6, 0.4, 0, UHDMI.H / 2, -UHDMI.D + 0.6), box(4.9, 0.55, 6.0, 0, UHDMI.H * 0.5, -0.9 - 3.0)]);
  });
}

function uhdmiContactsGeometry() {
  return cached("pi5-uhdmi-pins", () => {
    const parts: BufferGeometry[] = [];
    for (let i = 0; i < 10; i++) parts.push(box(0.2, 0.04, 3.6, -1.8 + i * 0.4, UHDMI.H * 0.5 + 0.3, -1.4 - 1.8));
    for (let i = 0; i < 9; i++) parts.push(box(0.2, 0.04, 3.6, -1.6 + i * 0.4, UHDMI.H * 0.5 - 0.3, -1.4 - 1.8));
    return merge(parts);
  });
}

export function MicroHdmi({ position }: { position?: Vec3 }) {
  return (
    <group position={position}>
      <mesh geometry={uhdmiGeometry()} material={shellMetal()} castShadow receiveShadow />
      <mesh geometry={uhdmiInnerGeometry()} material={MAT.plasticBlack} />
      <mesh geometry={uhdmiContactsGeometry()} material={MAT.gold} />
      <Legs id="uhdmi" legs={[[3.6, -4.0, 0.5, 0.8], [-3.6, -4.0, 0.5, 0.8]]} />
    </group>
  );
}

/** USB-C receptacle from the kit plus its four through-hole shell legs. */
export function UsbCPort({ position }: { position?: Vec3 }) {
  return (
    <group position={position}>
      <UsbC />
      <Legs id="usbc" legs={[[4.3, -6.25, 0.6, 0.9], [-4.3, -6.25, 0.6, 0.9], [4.3, -2.85, 0.6, 0.9], [-4.3, -2.85, 0.6, 0.9]]} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// FPC connectors
// ---------------------------------------------------------------------------

/** Right-angle FPC connector (PCIe): cable enters at +Z, flip-lock actuator at the back. */
export function FpcEdge({ width, pins, position, rotation }: { width: number; pins: number; position?: Vec3; rotation?: Vec3 }) {
  const geo = useMemo(
    () =>
      cached(`pi5-fpc-edge:${width}:${pins}`, () => {
        const body = box(width, 1.35, 2.5, 0, 0.675, -0.2 - 1.25);
        const lip = box(width, 0.3, 0.4, 0, 1.2, -0.2);
        return merge([body, lip]);
      }),
    [width, pins],
  );
  const metal = useMemo(
    () =>
      cached(`pi5-fpc-edge-metal:${width}:${pins}`, () => {
        const parts: BufferGeometry[] = [];
        for (let i = 0; i < pins; i++) {
          const x = (i - (pins - 1) / 2) * 0.5;
          parts.push(box(0.2, 0.1, 0.75, x, 0.05, -3.05 - 0.2));
        }
        for (const sx of [-1, 1]) parts.push(box(0.15, 1.2, 1.6, sx * (width / 2 + 0.08), 0.6, -1.6));
        return merge(parts);
      }),
    [width, pins],
  );
  const contacts = useMemo(
    () =>
      cached(`pi5-fpc-edge-contacts:${width}:${pins}`, () => {
        const parts: BufferGeometry[] = [];
        for (let i = 0; i < pins; i++) parts.push(box(0.18, 0.05, 1.4, (i - (pins - 1) / 2) * 0.5, 0.5, -0.9));
        return merge(parts);
      }),
    [width, pins],
  );
  return (
    <group position={position} rotation={rotation}>
      <mesh geometry={geo} material={beige()} castShadow receiveShadow />
      {/* cable slot */}
      <mesh geometry={roundedBox(width - 1.4, 0.32, 0.25, 0.05)} material={MAT.rubber} position={[0, 0.72, -0.05]} />
      <mesh geometry={contacts} material={MAT.gold} />
      {/* flip-lock actuator, closed */}
      <mesh geometry={roundedBox(width - 0.6, 0.5, 1.5, 0.15)} material={MAT.plasticBlack} position={[0, 1.6, -2.15]} castShadow />
      <mesh geometry={metal} material={MAT.tin} />
    </group>
  );
}

/** Vertical FPC connector (camera/display): cable enters from above; long axis along Z. */
export function FpcVertical({ length, pins, position }: { length: number; pins: number; position?: Vec3 }) {
  const metal = useMemo(
    () =>
      cached(`pi5-fpc-v-metal:${length}:${pins}`, () => {
        const parts: BufferGeometry[] = [];
        const half = Math.ceil(pins / 2);
        for (let i = 0; i < half; i++) {
          const z = -length / 2 + 2.2 + i * ((length - 4.4) / (half - 1));
          parts.push(box(0.75, 0.1, 0.25, -1.85, 0.05, z));
          parts.push(box(0.75, 0.1, 0.25, 1.85, 0.05, z + 0.5));
        }
        for (const sz of [-1, 1]) parts.push(box(2.2, 1.6, 0.15, 0, 0.8, sz * (length / 2 + 0.08)));
        return merge(parts);
      }),
    [length, pins],
  );
  const contacts = useMemo(
    () =>
      cached(`pi5-fpc-v-contacts:${length}:${pins}`, () => {
        const parts: BufferGeometry[] = [];
        for (let i = 0; i < pins; i++) parts.push(box(0.06, 0.05, 0.22, -0.1, 3.36, -((pins - 1) / 2) * 0.5 + i * 0.5));
        return merge(parts);
      }),
    [length, pins],
  );
  return (
    <group position={position}>
      <mesh geometry={roundedBox(3.0, 3.4, length, 0.2)} material={beige()} position-y={1.7} castShadow receiveShadow />
      {/* slot the cable drops into */}
      <mesh geometry={roundedBox(0.48, 0.1, length - 2.0, 0.04)} material={MAT.rubber} position={[-0.25, 3.37, 0]} />
      <mesh geometry={contacts} material={MAT.gold} />
      {/* latch flap */}
      <mesh geometry={roundedBox(1.05, 0.7, length - 1.2, 0.2)} material={MAT.plasticBlack} position={[0.75, 3.75, 0]} castShadow />
      <mesh geometry={metal} material={MAT.tin} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// JST-SH vertical header (fan, RTC battery, UART)
// ---------------------------------------------------------------------------

export function JstSh({ pins, position, rotation }: { pins: number; position?: Vec3; rotation?: Vec3 }) {
  const W = pins + 2;
  const D = 3.1;
  const H = 4.25;
  const housing = useMemo(
    () =>
      cached(`pi5-jst:${pins}`, () => {
        const s = shapeOf(rect(-W / 2, -D / 2, W / 2, D / 2));
        s.holes.push(pathOf(rect(-W / 2 + 0.5, -D / 2 + 0.55, W / 2 - 0.5, D / 2 - 0.45).reverse()));
        const walls = new ExtrudeGeometry(s, { depth: H, bevelEnabled: false });
        walls.rotateX(-Math.PI / 2);
        const floor = box(W - 0.9, 0.9, D - 0.9, 0, 0.45, 0.05);
        // Polarising key slots in the front wall.
        const keyL = box(0.5, 1.2, 0.2, -W / 2 + 1.0, H - 0.6, -D / 2 + 0.45);
        const keyR = box(0.5, 1.2, 0.2, W / 2 - 1.0, H - 0.6, -D / 2 + 0.45);
        return merge([walls, floor, keyL, keyR]);
      }),
    [pins, W],
  );
  const metal = useMemo(
    () =>
      cached(`pi5-jst-metal:${pins}`, () => {
        const parts: BufferGeometry[] = [];
        for (let i = 0; i < pins; i++) {
          const x = (i - (pins - 1) / 2) * 1.0;
          parts.push(box(0.3, 3.0, 0.3, x, 0.9 + 1.5, 0));
          parts.push(box(0.3, 0.12, 0.8, x, 0.06, D / 2 + 0.3));
        }
        for (const sx of [-1, 1]) parts.push(box(0.15, 1.6, 1.4, sx * (W / 2 + 0.08), 0.8, -0.3));
        return merge(parts);
      }),
    [pins, W, D],
  );
  return (
    <group position={position} rotation={rotation}>
      <mesh geometry={housing} material={jstWhite()} castShadow receiveShadow />
      <mesh geometry={metal} material={MAT.tin} castShadow />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Power button & status LED (left edge)
// ---------------------------------------------------------------------------

/** Side-actuated tactile switch; the plunger points toward −X (the board edge). */
export function PowerButton({ position }: { position?: Vec3 }) {
  const cover = useMemo(
    () =>
      cached("pi5-btn-cover", () =>
        merge([box(2.8, 0.22, 4.75, 0, 3.52, 0), box(2.8, 1.8, 0.18, 0, 2.6, 2.4), box(2.8, 1.8, 0.18, 0, 2.6, -2.4), box(0.6, 0.12, 1.4, 1.2, 0.06, 2.75), box(0.6, 0.12, 1.4, 1.2, 0.06, -2.75)]),
      ),
    [],
  );
  return (
    <group position={position}>
      <mesh geometry={roundedBox(2.65, 3.4, 4.65, 0.2)} material={MAT.plasticBlack} position-y={1.7} castShadow receiveShadow />
      <mesh geometry={cover} material={MAT.steel} castShadow />
      <mesh geometry={roundedBox(0.95, 1.5, 2.05, 0.18)} material={MAT.plasticSatin} position={[-1.7, 1.9, 0]} castShadow />
    </group>
  );
}

/** Bi-colour status LED material: green while running, flickering with SD activity. */
const ledGreen = new MeshStandardMaterial({ color: new Color("#4dff88").multiplyScalar(0.35), emissive: "#39ff7d", emissiveIntensity: 4.2, roughness: 0.25, transparent: true, opacity: 0.95 });

/** Right-angle bi-colour (red/green) LED with a domed lens facing −X. */
export function StatusLed({ position }: { position?: Vec3 }) {
  const lens = useMemo(
    () =>
      cached("pi5-led-lens", () => {
        const g = new CylinderGeometry(0.95, 0.95, 0.9, 20, 1, false, Math.PI, Math.PI);
        g.scale(0.62, 1, 1);
        g.translate(0, 0.55, 0);
        return g;
      }),
    [],
  );
  useFrame(({ clock }) => {
    if (!useExplorer.getState().animate) {
      ledGreen.emissiveIntensity = 4.2;
      return;
    }
    // Mostly on, with brief "off" blinks while the SD card is busy.
    const t = clock.elapsedTime;
    const busy = Math.sin(t * 0.9) + Math.sin(t * 2.3) > 0.9;
    ledGreen.emissiveIntensity = busy && Math.sin(t * 26) > 0.2 ? 0.15 : 4.2;
  });
  return (
    <group position={position}>
      <mesh geometry={roundedBox(1.1, 1.0, 3.3, 0.12)} material={MAT.plasticWhite} position={[0.25, 0.5, 0]} castShadow receiveShadow />
      <mesh geometry={lens} material={ledGreen} position={[-0.3, 0, 0]} />
      {/* the red die sits beside the green one, dark while the Pi runs */}
      <mesh geometry={roundedBox(0.3, 0.3, 0.3, 0.06)} material={emissive("#ff2a2a", 0.35)} position={[-0.32, 0.55, 0.62]} />
      <mesh geometry={roundedBox(0.6, 0.12, 0.8, 0.04)} material={MAT.tin} position={[0.4, 0.06, 1.85]} />
      <mesh geometry={roundedBox(0.6, 0.12, 0.8, 0.04)} material={MAT.tin} position={[0.4, 0.06, -1.85]} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// microSD socket & card (underside; card pokes out past the left edge, −X)
// ---------------------------------------------------------------------------

export const SD_CARD = { L: 15, W: 11, T: 0.85 };

function sdSocketGeometry(w: number, d: number) {
  return cached(`pi5-sd-socket:${w}:${d}`, () => {
    const h = 1.35;
    const t = 0.15;
    const parts: BufferGeometry[] = [];
    // Bottom plate (seen from below), side rails, back wall and solder tabs.
    parts.push(box(w, t, d, w / 2, -h + t / 2, 0));
    for (const sz of [-1, 1]) parts.push(box(w, h, t, w / 2, -h / 2, sz * (d / 2 - t / 2)));
    parts.push(box(t, h, d, w - t / 2, -h / 2, 0));
    for (const sz of [-1, 1]) {
      parts.push(box(1.6, 0.12, 1.2, 2.2, -0.06, sz * (d / 2 + 0.55)));
      parts.push(box(1.4, 0.12, 1.2, w - 0.4, -0.06, sz * (d / 2 + 0.55)));
    }
    // Embossed spring on the bottom plate.
    parts.push(box(3.2, 0.1, 1.4, w * 0.55, -h - 0.04, 0, 0, 0, 0.05));
    return merge(parts);
  });
}

function sdBottomMaterial(w: number, d: number) {
  return paintedMaterial(`sd-socket-bottom:${w}:${d}`, w, d, 40, { color: "#c1c4c8", rough: 0.32, metal: 1, height: 0.5 }, (p) => {
    const ink = { color: "#8b8f95", rough: 0.4, metal: 1, height: 0.42 };
    p.strokeRect(0.8, 0.8, w - 1.6, d - 1.6, 0.18, ink);
    p.strokeRect(w * 0.35, d * 0.3, w * 0.4, d * 0.4, 0.14, ink);
    for (let i = 0; i < 3; i++) p.circle(w * 0.2, d * (0.3 + i * 0.2), 0.35, ink);
  });
}

/** The socket hangs under the board; local origin at the board's left edge, y = 0 the top surface. */
export function MicroSdSocket({ width, depth, position }: { width: number; depth: number; position?: Vec3 }) {
  return (
    <group position={position}>
      <group position-y={-PCB.t}>
        <mesh geometry={sdSocketGeometry(width, depth)} material={shellMetal()} castShadow receiveShadow />
        <mesh geometry={decalDown(width - 0.2, depth - 0.4)} material={sdBottomMaterial(width - 0.2, depth - 0.4)} position={[width / 2, -1.35 - 0.002, 0]} />
        {/* contact springs at the back */}
        <mesh geometry={cached("pi5-sd-springs", () => merge(Array.from({ length: 8 }, (_, k) => box(1.3, 0.1, 0.55, width - 2.6, -0.4, -3.85 + k * 1.1, 0, 0, 0.3))))} material={MAT.gold} />
      </group>
    </group>
  );
}

function sdOutline(): Shape {
  // microSD outline in (length, width): label end at x = 0, contact end at x = 15.
  const { L, W } = SD_CARD;
  const r = 0.6;
  const s = new Shape();
  s.moveTo(r, -W / 2);
  s.lineTo(L - r, -W / 2);
  s.quadraticCurveTo(L, -W / 2, L, -W / 2 + r);
  s.lineTo(L, W / 2 - 1.2);
  s.lineTo(L - 0.5, W / 2 - 0.8);
  s.lineTo(L - 6.2, W / 2 - 0.8);
  s.lineTo(L - 6.7, W / 2);
  s.lineTo(r, W / 2);
  s.quadraticCurveTo(0, W / 2, 0, W / 2 - r);
  s.lineTo(0, -W / 2 + r);
  s.quadraticCurveTo(0, -W / 2, r, -W / 2);
  return s;
}

function sdCardGeometry() {
  return cached("pi5-sd-card", () => {
    const g = new ExtrudeGeometry(sdOutline(), { depth: SD_CARD.T, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 1, curveSegments: 4 });
    // Shape (x, y) → world (x, z); extrude along +y.
    g.rotateX(Math.PI / 2);
    g.translate(0, SD_CARD.T / 2, 0);
    return g;
  });
}

function sdLabelMaterial() {
  const { L, W } = SD_CARD;
  return paintedMaterial("sd-label", L - 0.4, W - 0.4, 60, { color: "#141821", rough: 0.45, metal: 0, height: 0.5 }, (p) => {
    p.mirrorText = true;
    const LL = L - 0.4;
    const WW = W - 0.4;
    // Seen from below, so draw mirrored in x to read correctly.
    for (const ctx of [p.c, p.m, p.hgt]) {
      ctx.translate(LL, 0);
      ctx.scale(-1, 1);
    }
    p.rect(0, 0, 3.4, WW, { color: "#d4372c", rough: 0.4, metal: 0, height: 0.52 });
    p.rect(3.4, 0, 0.35, WW, { color: "#e9e4d8", rough: 0.4, metal: 0, height: 0.52 });
    const white = { color: "#f4f4f2", rough: 0.4, metal: 0, height: 0.55 };
    p.text("64GB", 8.6, 4.4, 3.4, white, { align: "center", baseline: "middle", font: FONT_SANS, weight: 800 });
    p.text("microSD", 8.6, 7.4, 1.0, white, { align: "center", baseline: "middle", font: FONT_SANS, weight: 700 });
    p.text("A2   U3   V30", 8.6, 9.0, 0.9, { ...white, color: "#c8cbd2" }, { align: "center", baseline: "middle", font: FONT_COND, weight: 700 });
    p.text("PI OS", 1.7, WW / 2, 1.0, white, { align: "center", baseline: "middle", font: FONT_SANS, weight: 800, rotate: -90 });
  });
}

function sdContactMaterial() {
  const { L, W } = SD_CARD;
  return paintedMaterial("sd-contacts", L - 0.4, W - 0.4, 60, { color: "#191b20", rough: 0.6, metal: 0, height: 0.5 }, (p) => {
    const LL = L - 0.4;
    const WW = W - 0.4;
    // Gold pads at the insertion end (+X), moulded grip ridges at the outer end.
    for (let k = 0; k < 8; k++) p.roundRect(LL - 3.0, 1.0 + k * 1.1, 2.4, 0.75, 0.12, { color: "#e3b562", rough: 0.2, metal: 1, height: 0.56 });
    const r = rng(4);
    for (let i = 0; i < 6; i++) p.rect(0.4 + i * 0.42, 1.2, 0.18, WW - 2.4, { color: `rgb(${30 + r() * 10},${32 + r() * 10},${38 + r() * 10})`, rough: 0.7, metal: 0, height: 0.6 });
    p.text("SD-64G2A", LL * 0.45, WW / 2, 0.75, { color: "#3a3d44", rough: 0.7, metal: 0, height: 0.52 }, { align: "center", baseline: "middle", font: FONT_COND, weight: 700 });
  });
}

/** microSD card: origin at its label end, lying in XZ, centred on its own width. */
export function MicroSdCard() {
  const { L, W, T } = SD_CARD;
  return (
    <group>
      <mesh geometry={sdCardGeometry()} material={variant("pi5-sd-body", MAT.plasticBlack, { color: "#16181d", roughness: 0.5 })} castShadow receiveShadow />
      <mesh geometry={decalUp(L - 0.4, W - 0.4)} material={sdContactMaterial()} position={[L / 2, T / 2 + 0.065, 0]} />
      <mesh geometry={decalDown(L - 0.4, W - 0.4)} material={sdLabelMaterial()} position={[L / 2, -T / 2 - 0.065, 0]} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Mounting standoffs
// ---------------------------------------------------------------------------

export function standoffGeometry(height: number) {
  return cached(`pi5-standoff:${height}`, () => {
    const r = 2.5 / Math.cos(Math.PI / 6);
    const g = new CylinderGeometry(r, r, height, 6);
    g.translate(0, height / 2, 0);
    return g;
  });
}

