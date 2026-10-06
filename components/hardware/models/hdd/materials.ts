import { DoubleSide, MeshPhysicalMaterial, type MeshPhysicalMaterialParameters } from "three";
import { FONT_COND, FONT_MONO, FONT_SANS, Painter, painted, rng, type PaintedMaps, type Surface } from "@/lib/three/painter";
import { BREATHER, COVER_SCREWS, DISK, DRIVE, PIVOT, SPINDLE } from "./layout";

/**
 * Materials that only the hard drive needs. Like the kit's MAT, each is made
 * once and shared by every mesh that uses it.
 */
const made = new Map<string, MeshPhysicalMaterial>();

function once(key: string, make: () => MeshPhysicalMaterial) {
  let m = made.get(key);
  if (!m) {
    m = make();
    m.name = `hdd:${key}`;
    made.set(key, m);
  }
  return m;
}

const phys = (key: string, p: MeshPhysicalMaterialParameters) => once(key, () => new MeshPhysicalMaterial(p));

/** Painted maps → PBR material (roughness in G, metalness in B of rmMap). */
function fromMaps(maps: PaintedMaps, extra: MeshPhysicalMaterialParameters = {}) {
  return new MeshPhysicalMaterial({
    map: maps.map,
    roughnessMap: maps.rmMap,
    metalnessMap: maps.rmMap,
    bumpMap: maps.bumpMap,
    roughness: 1,
    metalness: 1,
    ...extra,
  });
}

// ---------------------------------------------------------------------------
// Tileable noise for cast and bead-blasted metal
// ---------------------------------------------------------------------------

/** Periodic value noise in [0, 1) on a `cells`-sized lattice. */
function valueNoise(cells: number, seed: number) {
  const r = rng(seed);
  const grid = Array.from({ length: cells * cells }, () => r());
  const at = (i: number, j: number) => grid[((j + cells) % cells) * cells + ((i + cells) % cells)];
  const s = (t: number) => t * t * (3 - 2 * t);
  return (u: number, v: number) => {
    const x = u * cells;
    const y = v * cells;
    const i = Math.floor(x);
    const j = Math.floor(y);
    const fx = s(x - i);
    const fy = s(y - j);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * fx;
    const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * fx;
    return a + (b - a) * fy;
  };
}

let castMaps: PaintedMaps | null = null;
/** Die-cast, bead-blasted aluminium: mottled grey with fine speckle (tiles every 48 mm). */
export const CAST_TILE = 48;
function castTexture() {
  if (castMaps) return castMaps;
  const p = new Painter(CAST_TILE, CAST_TILE, 10.667, { color: "#a8adb3", rough: 0.5, metal: 1, height: 0.5 });
  const [cc, mc, hc] = p.canvasList;
  const W = cc.width;
  const H = cc.height;
  const big = valueNoise(6, 3);
  const mid = valueNoise(24, 5);
  const r = rng(9);
  const ci = cc.getContext("2d")!.getImageData(0, 0, W, H);
  const mi = mc.getContext("2d")!.getImageData(0, 0, W, H);
  const hi = hc.getContext("2d")!.getImageData(0, 0, W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const v = y / H;
      const n = big(u, v) * 0.55 + mid(u, v) * 0.45;
      const speck = r();
      const k = (y * W + x) * 4;
      const shade = 186 + (n - 0.5) * 14 + (speck - 0.5) * 12;
      ci.data[k] = shade - 3;
      ci.data[k + 1] = shade;
      ci.data[k + 2] = shade + 5;
      ci.data[k + 3] = 255;
      mi.data[k] = 255;
      mi.data[k + 1] = 128 + (n - 0.5) * 30 + (speck - 0.5) * 34;
      mi.data[k + 2] = 120;
      mi.data[k + 3] = 255;
      const h = 128 + (speck - 0.5) * 70 + (n - 0.5) * 16;
      hi.data[k] = hi.data[k + 1] = hi.data[k + 2] = h;
      hi.data[k + 3] = 255;
    }
  }
  cc.getContext("2d")!.putImageData(ci, 0, 0);
  mc.getContext("2d")!.putImageData(mi, 0, 0);
  hc.getContext("2d")!.putImageData(hi, 0, 0);
  castMaps = p.toMaps({ repeat: [1, 1] });
  return castMaps;
}

// ---------------------------------------------------------------------------
// Platters: polar-mapped mirror with servo wedges and an ID scribe
// ---------------------------------------------------------------------------

/**
 * Canvas x = angle in degrees (0…360), canvas y = distance in from the rim
 * (0 … r − ri mm). Matches `polarAnnulus` UVs.
 */
function platterTexture() {
  const span = DISK.r - DISK.ri;
  return painted("hdd-platter", 360, span, 8, { color: "#a3a7ad", rough: 0.03, metal: 1, height: 0.5 }, (p) => {
    const toY = (r: number) => DISK.r - r;
    // Inner and outer limits of the data zone, and the clamp/spacer contact ring.
    p.rect(0, toY(DISK.dataIn) - 0.08, 360, 0.16, { color: "#a2a6ac", rough: 0.03, metal: 1 });
    p.rect(0, toY(DISK.dataOut) - 0.08, 360, 0.16, { color: "#a2a6ac", rough: 0.03, metal: 1 });
    p.rect(0, toY(16.4), 360, span - toY(16.4), { color: "#9ea2a8", rough: 0.09, metal: 1 });
    // Laser-scribed serial near the hole (text squeezed to stay legible in polar space).
    const rText = 17.4;
    const sx = 360 / (2 * Math.PI * rText); // canvas units per mm along the circle
    for (const ctx of [p.c, p.m, p.hgt]) {
      ctx.save();
      ctx.translate(30, toY(rText));
      ctx.scale(sx, 1);
    }
    p.text("A7Q-2240-81  ·  95.0 · 1.27  ·  L3", 0, 0, 0.75, { color: "#9fa4ab", rough: 0.4, metal: 1, height: 0.45 }, {
      baseline: "middle",
      font: FONT_MONO,
      weight: 500,
    });
    for (const ctx of [p.c, p.m, p.hgt]) ctx.restore();
  }, { anisotropy: 16 });
}

// ---------------------------------------------------------------------------
// Top cover: brushed stainless with stamped features
// ---------------------------------------------------------------------------

function coverTexture() {
  const W = DRIVE.length;
  const H = DRIVE.width;
  return painted("hdd-cover", W, H, 7, { color: "#a3a7ad", rough: 0.52, metal: 1, height: 0.5 }, (p) => {
    // Painter origin = drive corner (−X, −Z).
    const X = (x: number) => x + DRIVE.halfL;
    const Z = (z: number) => z + DRIVE.halfW;
    const r = rng(17);
    // Brushed grain along the length.
    for (let y = 0; y < H; y += 0.12 + r() * 0.12) {
      const v = r();
      const c = Math.round(166 + v * 22);
      p.rect(0, y, W, 0.07 + r() * 0.1, { color: `rgb(${c},${c + 3},${c + 7})`, rough: 0.46 + v * 0.1, metal: 1 });
    }
    // Stamped stiffening rib around the disk area and a dimple at the pivot.
    p.ring(X(SPINDLE.x), Z(SPINDLE.z), 50.3, 1.5, { color: "#a8acb2", rough: 0.46, metal: 1, height: 0.66 });
    p.ring(X(SPINDLE.x), Z(SPINDLE.z), 51.6, 0.4, { color: "#a6aab0", rough: 0.4, metal: 1, height: 0.58 });
    p.circle(X(PIVOT.x), Z(PIVOT.z), 7.5, { color: "#aeb2b8", rough: 0.44, metal: 1, height: 0.42 });
    p.ring(X(PIVOT.x), Z(PIVOT.z), 7.5, 0.5, { color: "#9da1a7", rough: 0.4, metal: 1, height: 0.46 });
    // Screw counter-sinks.
    for (const [x, z] of COVER_SCREWS) p.ring(X(x), Z(z), 3.1, 0.6, { color: "#8f9399", rough: 0.4, metal: 1, height: 0.35 });
    // Breather hole and its warning.
    const bx = X(BREATHER.x);
    const bz = Z(BREATHER.z);
    p.ring(bx, bz, 1.6, 0.35, { color: "#3a3d42", rough: 0.6, metal: 0.2, height: 0.45 });
    const ink: Surface = { color: "#26282c", rough: 0.6, metal: 0.1, height: 0.52 };
    p.text("DO NOT COVER", bx + 3.2, bz - 1.1, 1.6, ink, { baseline: "middle", font: FONT_COND, weight: 700 });
    p.text("THIS HOLE", bx + 3.2, bz + 1.1, 1.6, ink, { baseline: "middle", font: FONT_COND, weight: 700 });
    p.text("HDA  SEALED  ·  CLASS 100", X(46), Z(42.5), 1.5, ink, { baseline: "middle", font: FONT_COND, weight: 600 });
  });
}

// ---------------------------------------------------------------------------
// Product label
// ---------------------------------------------------------------------------

export const LABEL = { x0: -66, x1: 22, z0: -38.5, z1: 38.5 };

function labelTexture() {
  const W = LABEL.x1 - LABEL.x0;
  const H = LABEL.z1 - LABEL.z0;
  return painted("hdd-label", W, H, 13, { color: "#f2f1ec", rough: 0.55, metal: 0, height: 0.5 }, (p) => {
    const ink: Surface = { color: "#17181b", rough: 0.5, metal: 0, height: 0.56 };
    const grey: Surface = { color: "#5c6068", rough: 0.5, metal: 0, height: 0.55 };
    const white: Surface = { color: "#f6f6f2", rough: 0.45, metal: 0, height: 0.56 };
    // Dark header band with capacity and a generic platter emblem.
    p.rect(0, 0, W, 17.5, { color: "#1d2127", rough: 0.42, metal: 0, height: 0.52 });
    p.rect(0, 17.5, W, 1.1, { color: "#2f7fd8", rough: 0.4, metal: 0, height: 0.52 });
    p.circle(9.5, 8.75, 6.2, { color: "#2f7fd8", rough: 0.4, metal: 0, height: 0.53 });
    p.ring(9.5, 8.75, 4.2, 0.55, white);
    p.circle(9.5, 8.75, 1.3, white);
    p.polyline([[9.5, 8.75], [14.4, 5.4]], 0.7, white);
    p.text("8TB", 18.5, 9.6, 10.5, white, { baseline: "middle", font: FONT_SANS, weight: 800, letterSpacing: 0.2 });
    p.text("3.5-INCH HARD DISK DRIVE", 47, 6.4, 3.0, white, { baseline: "middle", font: FONT_SANS, weight: 700 });
    p.text("7200 RPM  ·  SATA 6 Gb/s  ·  256 MB CACHE", 47, 11.2, 2.15, { color: "#c9d3e0", rough: 0.45, metal: 0, height: 0.55 }, {
      baseline: "middle",
      font: FONT_COND,
      weight: 600,
    });
    // Identity block.
    const rows: [string, string][] = [
      ["MODEL", "HD8T72-S256"],
      ["S/N", "ZK7R4Q9T"],
      ["P/N", "1YT8-4410  ·  FW CA07"],
      ["DATE", "2026-03  ·  DCM 7KQT3"],
    ];
    rows.forEach(([k, v], i) => {
      const y = 25 + i * 4.6;
      p.text(k, 4, y, 2.2, grey, { baseline: "middle", font: FONT_COND, weight: 700 });
      p.text(v, 16, y, 2.6, ink, { baseline: "middle", font: FONT_MONO, weight: 600 });
    });
    // Code-128 style barcode for the serial number.
    const rb = rng(23);
    let bx = 4;
    while (bx < 58) {
      const bw = 0.22 + Math.floor(rb() * 4) * 0.2;
      p.rect(bx, 43.6, bw, 8.5, ink);
      bx += bw + 0.22 + Math.floor(rb() * 3) * 0.2;
    }
    p.text("*ZK7R4Q9T*", 31, 54.2, 1.8, ink, { align: "center", baseline: "middle", font: FONT_MONO, weight: 500 });
    // 2-D data matrix.
    const rd = rng(29);
    const cell = 0.62;
    for (let j = 0; j < 16; j++)
      for (let i = 0; i < 16; i++) {
        const edge = i === 0 || j === 15 || (j === 0 && i % 2 === 0) || (i === 15 && j % 2 === 1);
        if (edge || rd() > 0.52) p.rect(70 + i * cell, 25 + j * cell, cell, cell, ink);
      }
    // Power rating and a caution box.
    p.text("+5V ⎓ 0.45A    +12V ⎓ 0.55A", 4, 59.6, 2.3, ink, { baseline: "middle", font: FONT_COND, weight: 700 });
    p.strokeRect(4, 62.5, W - 8, 11.5, 0.3, ink);
    p.polygon(
      [
        [9.2, 64.2],
        [12.6, 70.6],
        [5.8, 70.6],
      ],
      ink,
    );
    p.text("!", 9.2, 68.7, 3.6, white, { align: "center", baseline: "middle", font: FONT_SANS, weight: 800 });
    p.text("CAUTION  Sensitive device. Do not drop, bump or press on the cover.", 15, 65.4, 1.75, ink, {
      baseline: "middle",
      font: FONT_COND,
      weight: 600,
    });
    p.text("Handle by the sides. Electrostatic-sensitive. Warranty void if label is removed.", 15, 68.3, 1.75, ink, {
      baseline: "middle",
      font: FONT_COND,
      weight: 600,
    });
    p.text("ITE Class B   ·   RoHS   ·   Assembled in Malaysia", 15, 71.3, 1.75, grey, {
      baseline: "middle",
      font: FONT_COND,
      weight: 600,
    });
  });
}

// ---------------------------------------------------------------------------
// Material set
// ---------------------------------------------------------------------------

export const HM = {
  /** Die-cast aluminium base (bead-blasted, UVs in mm / CAST_TILE). */
  get cast() {
    return once("cast", () => {
      const m = castTexture();
      // Partly dielectric: the bead-blasted, e-coated surface scatters light diffusely.
      return fromMaps(m, { color: "#ffffff", bumpScale: 0.25 });
    });
  },
  /** Machined faces (top of the walls, bosses). */
  get castMachined() {
    return phys("castMachined", { color: "#c6cacf", metalness: 1, roughness: 0.24 });
  },
  /** Mirror-polished magnetic platter (polar UVs). */
  get platter() {
    return once("platter", () => {
      const m = platterTexture();
      return new MeshPhysicalMaterial({
        map: m.map,
        roughnessMap: m.rmMap,
        metalnessMap: m.rmMap,
        roughness: 1,
        metalness: 1,
        anisotropy: 0.12,
        anisotropyRotation: Math.PI / 2,
        envMapIntensity: 0.85,
      });
    });
  },
  /** Ground platter edge. */
  get platterEdge() {
    return phys("platterEdge", { color: "#c9ccd1", metalness: 1, roughness: 0.18 });
  },
  /** Stainless cover with stamped features (UVs span the drive footprint). */
  get cover() {
    return once("cover", () => fromMaps(coverTexture(), { bumpScale: 0.5, anisotropy: 0.2 }));
  },
  get coverPlain() {
    return phys("coverPlain", { color: "#a9adb3", metalness: 1, roughness: 0.5 });
  },
  get label() {
    return once("label", () => fromMaps(labelTexture(), { bumpScale: 0.25, clearcoat: 0.15, clearcoatRoughness: 0.5 }));
  },
  /** Spindle hub, spacers and clamp: precision-turned stainless and aluminium. */
  get hub() {
    return phys("hub", { color: "#d0d3d8", metalness: 1, roughness: 0.16 });
  },
  get spacer() {
    return phys("spacer", { color: "#c7cbd0", metalness: 1, roughness: 0.13 });
  },
  get clamp() {
    return phys("clamp", { color: "#cfd2d6", metalness: 1, roughness: 0.22, anisotropy: 0.25 });
  },
  /** Nickel-plated steel (VCM yokes, pivot sleeve). */
  get plate() {
    return phys("plate", { color: "#cfcfcb", metalness: 1, roughness: 0.22 });
  },
  /** Nickel-plated NdFeB magnet. */
  get magnet() {
    return phys("magnet", { color: "#a9aaa8", metalness: 1, roughness: 0.34 });
  },
  /** Actuator arms: machined aluminium. */
  get arm() {
    return phys("arm", { color: "#c3c7cc", metalness: 1, roughness: 0.3 });
  },
  /** Stainless suspension load beams. */
  get suspension() {
    return phys("suspension", { color: "#d7d9dc", metalness: 1, roughness: 0.2, side: DoubleSide });
  },
  /** Bare copper winding. */
  get coilCopper() {
    return phys("coilCopper", { color: "#c9784a", metalness: 1, roughness: 0.32 });
  },
  /** Black liquid-crystal-polymer overmould (coil holder, latch). */
  get lcp() {
    return phys("lcp", { color: "#131417", metalness: 0, roughness: 0.48, clearcoat: 0.2 });
  },
  /** PTFE-filled ramp plastic. */
  get ramp() {
    return phys("ramp", { color: "#e8e4d8", metalness: 0, roughness: 0.42, sheen: 0.2 });
  },
  /** Amber polyimide of flexible circuits. */
  get polyimide() {
    return phys("polyimide", {
      color: "#c27b2e",
      metalness: 0.15,
      roughness: 0.36,
      clearcoat: 0.6,
      clearcoatRoughness: 0.25,
      side: DoubleSide,
    });
  },
  /** AlTiC slider ceramic. */
  get altic() {
    return phys("altic", { color: "#2b2d32", metalness: 0.45, roughness: 0.3 });
  },
  /** White electret / PTFE filter media. */
  get filter() {
    return phys("filter", { color: "#eeeeea", metalness: 0, roughness: 0.95, sheen: 0.4, sheenRoughness: 0.8 });
  },
  /** Dark hole interior (threads in shadow). */
  get hole() {
    return phys("hole", { color: "#0b0c0e", metalness: 0.4, roughness: 0.75 });
  },
  /** Torx screws. */
  get screw() {
    return phys("screw", { color: "#babdc2", metalness: 1, roughness: 0.28 });
  },
  get screwDark() {
    return phys("screwDark", { color: "#2c2e33", metalness: 1, roughness: 0.4 });
  },
  /** Motor stator laminations. */
  get lamination() {
    return phys("lamination", { color: "#6d7076", metalness: 1, roughness: 0.42 });
  },
  /** Enamelled copper winding (darker, glossy). */
  get enamel() {
    return phys("enamel", { color: "#a85a2a", metalness: 0.85, roughness: 0.28, clearcoat: 0.6 });
  },
  /** Rotor magnet ring (bonded NdFeB, black). */
  get rotorMagnet() {
    return phys("rotorMagnet", { color: "#2a2b2e", metalness: 0.3, roughness: 0.5 });
  },
};

