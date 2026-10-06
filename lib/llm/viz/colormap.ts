/**
 * Colour maps for tensor cells. Values are coloured on the CPU into RGBA8
 * textures (so the GPU can mip-map them for distant views).
 *
 * Diverging map: negative → cyan/blue, ≈0 → near-black, positive → amber/red.
 * Dark zero keeps the scene calm; large magnitudes glow.
 */

type RGB = [number, number, number];

const NEG: RGB[] = [
  [0.05, 0.07, 0.1],
  [0.07, 0.2, 0.45],
  [0.12, 0.45, 0.95],
  [0.55, 0.85, 1.0],
];
const POS: RGB[] = [
  [0.05, 0.07, 0.1],
  [0.5, 0.17, 0.06],
  [0.98, 0.45, 0.1],
  [1.0, 0.86, 0.55],
];
const SEQ: RGB[] = [
  [0.04, 0.05, 0.08],
  [0.08, 0.22, 0.3],
  [0.1, 0.55, 0.5],
  [0.55, 0.9, 0.45],
  [1.0, 1.0, 0.75],
];

function ramp(stops: RGB[], t: number): RGB {
  const x = Math.min(1, Math.max(0, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const a = stops[i];
  const b = stops[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

/** v in units of the slab's scale (≈ −1…1). */
export function diverging(v: number): RGB {
  const t = Math.pow(Math.min(1, Math.abs(v)), 0.75);
  return v < 0 ? ramp(NEG, t) : ramp(POS, t);
}

/** p in 0…1. */
export function sequential(p: number): RGB {
  return ramp(SEQ, Math.pow(Math.min(1, Math.max(0, p)), 0.5));
}

export const MASKED: RGB = [0.11, 0.11, 0.13];

export type ColorMode = "diverging" | "sequential";

/**
 * Colour a rows × cols grid into an RGBA8 buffer laid out for a DataTexture
 * with flipY = false (texture row 0 = grid row 0, drawn at the top by the shader).
 */
export function colorize(values: Float32Array, rows: number, cols: number, mode: ColorMode, scale: number) {
  const out = new Uint8Array(rows * cols * 4);
  for (let i = 0; i < rows * cols; i++) {
    const v = values[i];
    let c: RGB;
    if (Number.isNaN(v)) c = MASKED;
    else if (mode === "sequential") c = sequential(v / scale);
    else c = diverging(v / scale);
    out[i * 4] = Math.round(Math.min(1, c[0]) * 255);
    out[i * 4 + 1] = Math.round(Math.min(1, c[1]) * 255);
    out[i * 4 + 2] = Math.round(Math.min(1, c[2]) * 255);
    // Alpha marks masked cells (0) for the shader's hatch pattern.
    out[i * 4 + 3] = Number.isNaN(v) ? 0 : 255;
  }
  return out;
}

export function rgbCss(c: RGB) {
  return `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`;
}
