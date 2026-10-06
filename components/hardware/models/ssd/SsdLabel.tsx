"use client";

import { useMemo } from "react";
import { MeshPhysicalMaterial, Vector2 } from "three";
import { FONT_COND, FONT_MONO, FONT_SANS, painted, rng, type Painter, type Surface } from "@/lib/three/painter";
import { Part } from "../../Part";
import { boundsOf, extrudedWalls, flatFace, roundedRectShape } from "../../kit/geometry";
import { MAT, variant } from "../../kit/materials";
import { CTRL, DRAM, INDUCTORS, LABEL, NANDS, NAND_PKG } from "./layout";

const W = LABEL.x1 - LABEL.x0;
const D = LABEL.z1 - LABEL.z0;

/** Chips under the label, in label coordinates: they show through as faint ridges. */
const UNDER: [number, number, number, number][] = [
  [CTRL.x - CTRL.lid / 2, CTRL.z - CTRL.lid / 2, CTRL.lid, CTRL.lid],
  [DRAM.x - DRAM.w / 2, DRAM.z - DRAM.d / 2, DRAM.w, DRAM.d],
  ...NANDS.map((n): [number, number, number, number] => [n.x - NAND_PKG.w / 2, n.z - NAND_PKG.d / 2, NAND_PKG.w, NAND_PKG.d]),
  ...INDUCTORS.map((l): [number, number, number, number] => [l.x - 1, l.z - 0.8, 2, 1.6]),
];

function withClip(p: Painter, x: number, y: number, w: number, h: number, draw: () => void) {
  for (const ctx of [p.c, p.m, p.hgt]) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
  }
  draw();
  for (const ctx of [p.c, p.m, p.hgt]) ctx.restore();
}

function textWidth(p: Painter, str: string, font: string) {
  p.c.save();
  p.c.font = font;
  const w = p.c.measureText(str).width;
  p.c.restore();
  return w;
}

/** The printed face of the sticker (generic branding, specs, serial, codes). */
function paintLabel(p: Painter) {
  const r = rng(12);
  const white: Surface = { color: "#f1f2f4", rough: 0.42, metal: 0, height: 0.56 };
  const grey: Surface = { color: "#a9afb8", rough: 0.48, metal: 0, height: 0.55 };
  const dim: Surface = { color: "#6b717b", rough: 0.5, metal: 0, height: 0.54 };
  const accent: Surface = { color: "#33c3d6", rough: 0.38, metal: 0, height: 0.55 };

  // Chips underneath press faint ridges into the film.
  p.hgt.save();
  p.hgt.filter = "blur(5px)";
  for (const [x, z, w, d] of UNDER) {
    p.hgt.fillStyle = "rgb(140,140,140)";
    p.hgt.fillRect(x - LABEL.x0, z - LABEL.z0, w, d);
  }
  p.hgt.restore();

  // Fine diagonal hairlines fading out to the right.
  withClip(p, 0, 0, W * 0.72, D, () => {
    const g = p.c.createLinearGradient(0, 0, W * 0.72, 0);
    g.addColorStop(0, "rgba(160,200,230,0.085)");
    g.addColorStop(1, "rgba(160,200,230,0)");
    p.c.strokeStyle = g;
    p.c.lineWidth = 0.07;
    for (let x = -D; x < W * 0.72; x += 0.5) {
      p.c.beginPath();
      p.c.moveTo(x, D);
      p.c.lineTo(x + D * 0.75, 0);
      p.c.stroke();
    }
  });
  // A soft sheen band and a thin accent bar.
  const sheen = p.c.createLinearGradient(0, 0, 0, D);
  sheen.addColorStop(0, "rgba(255,255,255,0.025)");
  sheen.addColorStop(0.5, "rgba(255,255,255,0.0)");
  p.c.fillStyle = sheen;
  p.c.fillRect(0, 0, W, D);
  p.rect(2.3, 3.2, 0.45, 15.2, accent);

  // Product name and capacity.
  const big = `800 5.6px ${FONT_SANS}`;
  p.text("NVMe", 3.9, 9.2, 5.6, white, { font: FONT_SANS, weight: 800 });
  const nw = textWidth(p, "NVMe", big);
  p.text("SSD", 3.9 + nw + 1.1, 9.2, 5.6, grey, { font: FONT_SANS, weight: 300 });
  p.text("PCIe 4.0 ×4   ·   M.2 2280   ·   NVMe 2.0", 4.0, 13.1, 1.5, grey, { font: FONT_SANS, weight: 600 });
  p.text("3D TLC NAND  ·  LPDDR4 DRAM CACHE  ·  UP TO 7,000 MB/s", 4.0, 15.6, 1.12, dim, { font: FONT_SANS, weight: 600, letterSpacing: 0.05 });
  p.text("CAPACITY", 36.4, 5.4, 1.0, dim, { font: FONT_SANS, weight: 700, letterSpacing: 0.25 });
  p.text("2TB", 36.1, 12.0, 6.0, white, { font: FONT_SANS, weight: 800 });
  p.rect(36.4, 13.9, 10.2, 0.26, accent);

  // Information panel with serial number and codes.
  const bx = 48.9;
  const by = 1.6;
  const bw = W - bx - 1.4;
  const bh = D - 3.2;
  p.roundRect(bx, by, bw, bh, 0.6, { color: "#e8e7e2", rough: 0.62, metal: 0, height: 0.58 });
  const ink: Surface = { color: "#17181b", rough: 0.6, metal: 0, height: 0.6 };
  p.text("MODEL  NX4-2T0", bx + 0.9, by + 1.9, 1.0, ink, { font: FONT_COND, weight: 700 });
  p.text("S/N  2431K7A04193", bx + 0.9, by + 3.4, 1.0, ink, { font: FONT_COND, weight: 700 });
  // 1-D barcode.
  let x = bx + 0.9;
  while (x < bx + bw - 1.0) {
    const w = 0.08 + Math.floor(r() * 4) * 0.07;
    p.rect(x, by + 4.2, w, 3.4, ink);
    x += w + 0.08 + Math.floor(r() * 3) * 0.07;
  }
  // 2-D data-matrix code.
  const dm = 0.21;
  const dmx = bx + 0.9;
  const dmy = by + 8.6;
  for (let i = 0; i < 16; i++)
    for (let j = 0; j < 16; j++) {
      const edge = i === 0 || j === 15 || (j === 0 && i % 2 === 0) || (i === 15 && j % 2 === 1);
      if (edge || r() > 0.52) p.rect(dmx + i * dm, dmy + j * dm, dm, dm, ink);
    }
  p.text("DC 3.3V ⎓ 2.5A", bx + 4.9, dmy + 0.8, 0.95, ink, { font: FONT_COND, weight: 700 });
  p.text("FW  3B2QGXA7", bx + 4.9, dmy + 2.1, 0.85, ink, { font: FONT_MONO, weight: 600 });
  p.text("MADE IN TAIWAN", bx + 4.9, dmy + 3.3, 0.85, ink, { font: FONT_COND, weight: 700 });
  // Crossed-out wheelie bin (WEEE) pictogram.
  const ix = bx + bw - 2.0;
  const iy = by + bh - 3.2;
  p.polyline([[ix - 0.7, iy - 0.9], [ix + 0.7, iy - 0.9], [ix + 0.55, iy + 0.9], [ix - 0.55, iy + 0.9], [ix - 0.7, iy - 0.9]], 0.13, ink);
  p.polyline([[ix - 0.95, iy - 1.25], [ix + 0.95, iy + 1.25]], 0.13, ink);
  p.polyline([[ix + 0.95, iy - 1.25], [ix - 0.95, iy + 1.25]], 0.13, ink);
  p.rect(ix - 0.9, iy + 1.45, 1.8, 0.3, ink);

  p.text("WARRANTY VOID IF REMOVED  ·  COPPER HEAT-SPREADER LABEL — DO NOT PEEL", 4.0, D - 1.25, 0.72, dim, {
    font: FONT_SANS,
    weight: 600,
    letterSpacing: 0.08,
  });
}

/** Copper foil: rolled-copper sheen with a few faint creases. */
function paintCopper(p: Painter) {
  const r = rng(77);
  for (let i = 0; i < 90; i++) {
    const y = r() * D;
    const c = 150 + Math.round(r() * 40);
    p.rect(0, y, W, 0.08 + r() * 0.25, { color: `rgb(${c + 50},${c - 10},${c - 60})`, rough: 0.22 + r() * 0.16, metal: 1 });
  }
  for (let i = 0; i < 6; i++) {
    const x = r() * W;
    p.polyline([[x, 0], [x + (r() - 0.5) * 8, D]], 0.12, { color: "#b77650", rough: 0.4, metal: 1, height: 0.42 });
  }
}

function sheetGeometry(key: string, inset: number, radius: number) {
  const shape = roundedRectShape(LABEL.x0 + inset, LABEL.z0 + inset, W - 2 * inset, D - 2 * inset, radius);
  const b = boundsOf(shape.getPoints(12) as Vector2[]);
  return { top: flatFace(shape, b), bottom: flatFace(shape, b, true), shape, key };
}

/**
 * The drive's label: a printed polyester film laminated onto a thin copper
 * foil that spreads heat from the controller across the NAND packages.
 * Built at its installed height; the model wraps it in its peel motion.
 */
export function SsdLabel({ y }: { y: number }) {
  const { film, copper } = useMemo(() => {
    const film = sheetGeometry("film", 0, 1.0);
    const copper = sheetGeometry("copper", 0.12, 0.9);
    return {
      film: { ...film, walls: extrudedWalls(film.shape, LABEL.filmT) },
      copper: { ...copper, walls: extrudedWalls(copper.shape, LABEL.copperT) },
    };
  }, []);
  const mats = useMemo(() => {
    const print = painted("ssd-label", W, D, 40, { color: "#0f1013", rough: 0.46, metal: 0, height: 0.5 }, paintLabel);
    const cu = painted("ssd-label-cu", W, D, 8, { color: "#c98b5e", rough: 0.26, metal: 1, height: 0.5 }, paintCopper);
    const printMat = new MeshPhysicalMaterial({
      map: print.map,
      roughnessMap: print.rmMap,
      metalnessMap: print.rmMap,
      bumpMap: print.bumpMap,
      bumpScale: 0.6,
      roughness: 1,
      metalness: 1,
      clearcoat: 0.25,
      clearcoatRoughness: 0.5,
    });
    const cuMat = new MeshPhysicalMaterial({
      map: cu.map,
      roughnessMap: cu.rmMap,
      metalnessMap: cu.rmMap,
      bumpMap: cu.bumpMap,
      bumpScale: 0.3,
      roughness: 1,
      metalness: 1,
    });
    const backing = variant("ssd-label-back", MAT.labelWhite, { color: "#cfd2d4", roughness: 0.7 });
    const edge = variant("ssd-label-edge", MAT.plasticBlack, { color: "#1a1b1e", roughness: 0.5 });
    return { printMat, cuMat, backing, edge };
  }, []);
  const yCu = y + LABEL.copperT;
  const yFilm = yCu + LABEL.filmT;
  return (
    <>
      <Part id="label-film">
        <mesh geometry={film.top} material={mats.printMat} position-y={yFilm} castShadow receiveShadow />
        <mesh geometry={film.walls} material={mats.edge} position-y={yFilm} />
        <mesh geometry={film.bottom} material={mats.backing} position-y={yCu + 0.002} />
      </Part>
      <Part id="label-copper" explode={[0, -3.2, 0]} explodeRange={[0.5, 0.68]}>
        <mesh geometry={copper.top} material={mats.cuMat} position-y={yCu - 0.002} />
        <mesh geometry={copper.walls} material={mats.cuMat} position-y={yCu} />
        <mesh geometry={copper.bottom} material={mats.cuMat} position-y={y} castShadow receiveShadow />
      </Part>
    </>
  );
}
