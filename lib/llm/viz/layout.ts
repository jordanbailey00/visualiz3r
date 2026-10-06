/**
 * Spatial layout of the transformer visualisation.
 *
 * Conventions (world units; one tensor cell ≈ 1 unit):
 * - Data flows left → right (+X). Each transformer block is one "row" of the
 *   scene; rows stack downward like lines of text, embedding first, output last.
 * - Inside a row every activation tensor is drawn with **one row per token**
 *   ("token lanes"): token t occupies y ∈ [top − t − 1, top − t] in every slab,
 *   so a token's vector can be followed straight across the model.
 * - Matrix products use the intersection layout: input on the left, weight
 *   matrix standing above the output, output where the input's rows meet the
 *   weight's columns.
 * - The attention heads (and the MLP's gate/up branches) fan out in depth (−Z)
 *   as parallel sheets.
 * - Tensors along the MLP's hidden dimension (4× wider) use half-width cells.
 */

import type { ModelConfig } from "../model";

export type SlabKind =
  | "activation" // [T, N] per-token vectors
  | "weight" // learned parameter matrix
  | "vector" // learned 1-D parameter (RMSNorm gain)
  | "rms" // per-token scalar
  | "scores" // attention logits [T, T] with causal mask
  | "probs" // attention weights [T, T]
  | "keysT" // K transposed [D, T]
  | "values"; // V standing above head output [T, D]

/** How to fetch a slab's numbers from the forward trace / weights. */
export type TensorRef =
  | { src: "trace"; layer: number; field: TraceField; head?: number; transpose?: boolean; cols?: [number, number] }
  | { src: "embeddings" }
  | { src: "finalNormed" }
  | { src: "finalRms" }
  | { src: "weight"; layer: number; field: WeightField }
  | { src: "finalGain" };

export type TraceField =
  | "input"
  | "attnNormRms"
  | "attnNormed"
  | "q"
  | "k"
  | "v"
  | "qRot"
  | "kRot"
  | "scores"
  | "probs"
  | "headOut"
  | "concat"
  | "attnOut"
  | "resid1"
  | "mlpNormRms"
  | "mlpNormed"
  | "gate"
  | "up"
  | "act"
  | "hidden"
  | "mlpOut"
  | "output";

export type WeightField = "attnNorm" | "wq" | "wk" | "wv" | "wo" | "mlpNorm" | "wGate" | "wUp" | "wDown";

/** Logical step a slab belongs to — used for explanations and the tour. */
export type StepId =
  | "embed"
  | "resid"
  | "attn-norm"
  | "qkv"
  | "rope"
  | "scores"
  | "softmax"
  | "weighted-sum"
  | "concat"
  | "out-proj"
  | "attn-add"
  | "mlp-norm"
  | "mlp-up"
  | "mlp-act"
  | "mlp-down"
  | "mlp-add"
  | "final-norm";

export type Axis = "token" | "channel" | "hidden" | "dhead" | "one";

export interface SlabSpec {
  id: string;
  kind: SlabKind;
  step: StepId;
  /** Display name (Latin-1 only: the 3D font has no exotic glyphs). */
  label: string;
  rows: number;
  cols: number;
  /** Top-left corner (x, y) and depth z. */
  x: number;
  y: number;
  z: number;
  layer: number;
  head?: number;
  ref: TensorRef;
  rowAxis: Axis;
  colAxis: Axis;
  /** World size of one cell. */
  cellW: number;
  cellH: number;
}

export type OpKind = "norm" | "matmul" | "rope" | "qk" | "softmax" | "av" | "concat" | "add" | "silu" | "mul" | "split";

export interface OpSpec {
  id: string;
  kind: OpKind;
  step: StepId;
  label: string;
  x: number;
  y: number;
  z: number;
  layer: number;
}

/** The residual "skip" path drawn beneath a sub-layer. */
export interface SkipSpec {
  id: string;
  x0: number;
  x1: number;
  top: number;
  bottom: number;
  layer: number;
}

export interface ModuleSpec {
  id: string;
  title: string;
  subtitle: string;
  step: StepId;
  layer: number;
  min: [number, number, number];
  max: [number, number, number];
}

export interface VizLayout {
  T: number;
  slabs: SlabSpec[];
  ops: OpSpec[];
  skips: SkipSpec[];
  modules: ModuleSpec[];
  /** Carriage-return paths of the residual stream between rows. */
  returns: { id: string; x0: number; y0: number; x1: number; y1: number; layer: number }[];
  embed: {
    tokensX: number;
    mosaic: { x: number; y: number; z: number; w: number; h: number; tile: number; cols: number; rows: number };
  };
  output: {
    predictionsX: number;
    city: { x: number; y: number; z: number; w: number; d: number; tile: number; cols: number; rows: number };
    sampleX: number;
  };
  rowTop: number[];
  rowPitch: number;
  bounds: { min: [number, number, number]; max: [number, number, number] };
}

export const LAYOUT = {
  hiddenCell: 0.5,
  gap: 10,
  smallGap: 6,
  weightGap: 3,
  headDz: 36,
  upDz: 30,
  rowGap: 60,
  mosaicCols: 64,
  mosaicTile: 2,
};

type SlabInit = Omit<SlabSpec, "cellW" | "cellH" | "z" | "rowAxis" | "colAxis"> &
  Partial<Pick<SlabSpec, "cellW" | "cellH" | "z" | "rowAxis" | "colAxis">>;

export function computeLayout(cfg: ModelConfig, T: number): VizLayout {
  const { dModel: C, nHeads: H, dHead: D, dFF: F, nLayers: L, vocabSize: V } = cfg;
  const G = LAYOUT.gap;
  const g = LAYOUT.smallGap;
  const WG = LAYOUT.weightGap;
  const HC = LAYOUT.hiddenCell;
  const FW = F * HC;
  const slabs: SlabSpec[] = [];
  const ops: OpSpec[] = [];
  const skips: SkipSpec[] = [];
  const modules: ModuleSpec[] = [];
  const returns: VizLayout["returns"] = [];
  const rowTop: number[] = [];

  const above = WG + Math.max(FW, C) + 16;
  const below = T + 16;
  const rowPitch = above + below + LAYOUT.rowGap;

  const slab = (s: SlabInit) => {
    const full: SlabSpec = {
      z: 0,
      rowAxis: "token",
      colAxis: "channel",
      cellW: 1,
      cellH: 1,
      ...s,
    };
    slabs.push(full);
    return full;
  };
  /** Activation [T, cols] with token lanes. */
  const act = (id: string, step: StepId, label: string, x: number, top: number, cols: number, layer: number, ref: TensorRef, extra: Partial<SlabSpec> = {}) =>
    slab({ id, kind: "activation", step, label, rows: T, cols, x, y: top, layer, ref, ...extra, cellW: extra.colAxis === "hidden" ? HC : 1 });
  /** Weight [rows, cols] standing above the output that starts at x. */
  const weight = (id: string, step: StepId, label: string, x: number, top: number, rows: number, cols: number, layer: number, ref: TensorRef, extra: Partial<SlabSpec> = {}) => {
    const cellW = extra.colAxis === "hidden" ? HC : 1;
    const cellH = extra.rowAxis === "hidden" ? HC : 1;
    return slab({ id, kind: "weight", step, label, rows, cols, x, y: top + WG + rows * cellH, layer, ref, ...extra, cellW, cellH });
  };
  const op = (id: string, kind: OpKind, step: StepId, label: string, x: number, y: number, layer: number, z = 0) =>
    ops.push({ id, kind, step, label, x, y, z, layer });

  // --- Embedding (row 0, to the left of block 0) -------------------------
  const mosaicCols = LAYOUT.mosaicCols;
  const mosaicRows = Math.ceil(V / mosaicCols);
  const tile = LAYOUT.mosaicTile;
  const mosaicW = mosaicCols * tile;
  const mosaicH = mosaicRows * tile;
  const tokensX = -40;
  const embed = {
    tokensX,
    mosaic: { x: tokensX - 30 - mosaicW, y: 18 + mosaicH, z: 0, w: mosaicW, h: mosaicH, tile, cols: mosaicCols, rows: mosaicRows },
  };

  let xEnd = 0;
  for (let l = 0; l < L; l++) {
    const top = -l * rowPitch;
    rowTop.push(top);
    let x = 0;
    const P = `L${l}`;

    // Residual stream entering the block (block 0: the embeddings).
    act(`${P}.x`, "resid", l === 0 ? "x  (token embeddings)" : `x  (output of block ${l})`, x, top, C, l, l === 0 ? { src: "embeddings" } : { src: "trace", layer: l, field: "input" });
    const attnStart = x + C;
    x += C + g;

    // RMSNorm: per-token RMS column, learned gain row, normalised output.
    slab({ id: `${P}.attn.rms`, kind: "rms", step: "attn-norm", label: "RMS", rows: T, cols: 1, x, y: top, layer: l, ref: { src: "trace", layer: l, field: "attnNormRms" }, colAxis: "one" });
    x += 1 + g;
    slab({ id: `${P}.attn.gain`, kind: "vector", step: "attn-norm", label: "gain", rows: 1, cols: C, x, y: top + WG + 1, layer: l, ref: { src: "weight", layer: l, field: "attnNorm" }, rowAxis: "one" });
    op(`${P}.op.norm1`, "norm", "attn-norm", "RMSNorm", x - g / 2 - 0.5, top + 9, l);
    act(`${P}.attn.normed`, "attn-norm", "normalized x", x, top, C, l, { src: "trace", layer: l, field: "attnNormed" });
    x += C + G;

    // Q, K, V projections.
    const qx = x;
    for (const [name, field, wf] of [
      ["Q  (queries)", "q", "wq"],
      ["K  (keys)", "k", "wk"],
      ["V  (values)", "v", "wv"],
    ] as const) {
      weight(`${P}.attn.w${field}`, "qkv", `W${field}`, x, top, C, C, l, { src: "weight", layer: l, field: wf });
      act(`${P}.attn.${field}`, "qkv", name, x, top, C, l, { src: "trace", layer: l, field });
      x += C + g;
    }
    op(`${P}.op.qkv`, "matmul", "qkv", "x W", qx - G / 2, top + 9, l);
    x += G - g + 8;

    // Attention heads, fanned out in depth.
    const hx = x;
    const headW = D + g + T + g + T + g + 4 + D;
    for (let h = 0; h < H; h++) {
      const z = -h * LAYOUT.headDz;
      let cx = hx;
      const tag = `head ${h + 1}`;
      act(`${P}.h${h}.q`, "rope", `q  ${tag}`, cx, top, D, l, { src: "trace", layer: l, field: "qRot", cols: [h * D, (h + 1) * D] }, { z, colAxis: "dhead", head: h });
      cx += D + g;
      slab({ id: `${P}.h${h}.kT`, kind: "keysT", step: "rope", label: `keys  ${tag}`, rows: D, cols: T, x: cx, y: top + WG + D, z, layer: l, head: h, ref: { src: "trace", layer: l, field: "kRot", cols: [h * D, (h + 1) * D], transpose: true }, rowAxis: "dhead", colAxis: "token" });
      slab({ id: `${P}.h${h}.scores`, kind: "scores", step: "scores", label: "scores", rows: T, cols: T, x: cx, y: top, z, layer: l, head: h, ref: { src: "trace", layer: l, field: "scores", head: h }, colAxis: "token" });
      if (h === 0) op(`${P}.op.qk${h}`, "qk", "scores", `q·k ÷ ${Math.sqrt(D).toFixed(0)}`, cx - g / 2, top + 6 + D, l, z + 2);
      cx += T + g;
      slab({ id: `${P}.h${h}.probs`, kind: "probs", step: "softmax", label: "attention weights", rows: T, cols: T, x: cx, y: top, z, layer: l, head: h, ref: { src: "trace", layer: l, field: "probs", head: h }, colAxis: "token" });
      if (h === 0) op(`${P}.op.sm${h}`, "softmax", "softmax", "softmax", cx - g / 2, top + 4, l, z + 2);
      cx += T + g + 4;
      slab({ id: `${P}.h${h}.v`, kind: "values", step: "weighted-sum", label: `values  ${tag}`, rows: T, cols: D, x: cx, y: top + WG + T, z, layer: l, head: h, ref: { src: "trace", layer: l, field: "v", cols: [h * D, (h + 1) * D] }, colAxis: "dhead" });
      act(`${P}.h${h}.out`, "weighted-sum", `${tag} output`, cx, top, D, l, { src: "trace", layer: l, field: "headOut", head: h }, { z, colAxis: "dhead", head: h });
      if (h === 0) op(`${P}.op.av${h}`, "av", "weighted-sum", "weights x v", cx - g / 2 - 2, top + 6 + T, l, z + 2);
    }
    op(`${P}.op.rope`, "rope", "rope", "split heads + RoPE", hx - 9, top + 9, l);
    x = hx + headW + G;

    // Concatenate heads and project.
    act(`${P}.attn.concat`, "concat", "heads concatenated", x, top, C, l, { src: "trace", layer: l, field: "concat" });
    op(`${P}.op.concat`, "concat", "concat", "concat", x - G / 2, top + 9, l);
    x += C + G;
    weight(`${P}.attn.wo`, "out-proj", "Wo", x, top, C, C, l, { src: "weight", layer: l, field: "wo" });
    act(`${P}.attn.out`, "out-proj", "attention output", x, top, C, l, { src: "trace", layer: l, field: "attnOut" });
    op(`${P}.op.wo`, "matmul", "out-proj", "x Wo", x - G / 2, top + 9, l);
    x += C + G + 4;
    op(`${P}.op.add1`, "add", "attn-add", "+", x - (G + 4) / 2, top - T / 2, l);
    act(`${P}.resid1`, "attn-add", "x + attention", x, top, C, l, { src: "trace", layer: l, field: "resid1" });
    skips.push({ id: `${P}.skip1`, x0: attnStart - C / 2, x1: x - (G + 4) / 2, top, bottom: top - T - 7, layer: l });
    modules.push({
      id: `${P}.attn`,
      title: `Block ${l + 1}  ·  Self-attention`,
      subtitle: `${H} heads, each ${D}-dimensional — tokens exchange information here`,
      step: "scores",
      layer: l,
      min: [attnStart + g / 2 - 2, top - T - 4, -(H - 1) * LAYOUT.headDz - 6],
      max: [x - G - 2, top + WG + C + 6, 6],
    });
    const mlpStart = x + C;
    x += C + g;

    // MLP: RMSNorm → gate & up (expand to F) → SiLU(gate) × up → down.
    slab({ id: `${P}.mlp.rms`, kind: "rms", step: "mlp-norm", label: "RMS", rows: T, cols: 1, x, y: top, layer: l, ref: { src: "trace", layer: l, field: "mlpNormRms" }, colAxis: "one" });
    x += 1 + g;
    slab({ id: `${P}.mlp.gain`, kind: "vector", step: "mlp-norm", label: "gain", rows: 1, cols: C, x, y: top + WG + 1, layer: l, ref: { src: "weight", layer: l, field: "mlpNorm" }, rowAxis: "one" });
    op(`${P}.op.norm2`, "norm", "mlp-norm", "RMSNorm", x - g / 2 - 0.5, top + 9, l);
    act(`${P}.mlp.normed`, "mlp-norm", "normalized x", x, top, C, l, { src: "trace", layer: l, field: "mlpNormed" });
    x += C + G;
    const gx = x;
    weight(`${P}.mlp.wgate`, "mlp-up", "W_gate", x, top, C, F, l, { src: "weight", layer: l, field: "wGate" }, { colAxis: "hidden" });
    act(`${P}.mlp.gate`, "mlp-up", "gate", x, top, F, l, { src: "trace", layer: l, field: "gate" }, { colAxis: "hidden" });
    weight(`${P}.mlp.wup`, "mlp-up", "W_up", x, top, C, F, l, { src: "weight", layer: l, field: "wUp" }, { z: -LAYOUT.upDz, colAxis: "hidden" });
    act(`${P}.mlp.up`, "mlp-up", "up", x, top, F, l, { src: "trace", layer: l, field: "up" }, { z: -LAYOUT.upDz, colAxis: "hidden" });
    op(`${P}.op.up`, "matmul", "mlp-up", "x W", gx - G / 2, top + 9, l);
    x += FW + G;
    act(`${P}.mlp.act`, "mlp-act", "SiLU(gate)", x, top, F, l, { src: "trace", layer: l, field: "act" }, { colAxis: "hidden" });
    op(`${P}.op.silu`, "silu", "mlp-act", "SiLU", x - G / 2, top + 9, l);
    x += FW + G;
    act(`${P}.mlp.hidden`, "mlp-act", "SiLU(gate) x up", x, top, F, l, { src: "trace", layer: l, field: "hidden" }, { colAxis: "hidden" });
    op(`${P}.op.mul`, "mul", "mlp-act", "x", x - G / 2, top - T / 2, l);
    x += FW + G;
    weight(`${P}.mlp.wdown`, "mlp-down", "W_down", x, top, F, C, l, { src: "weight", layer: l, field: "wDown" }, { rowAxis: "hidden" });
    act(`${P}.mlp.out`, "mlp-down", "MLP output", x, top, C, l, { src: "trace", layer: l, field: "mlpOut" });
    op(`${P}.op.down`, "matmul", "mlp-down", "x W_down", x - G / 2, top + 9, l);
    x += C + G + 4;
    op(`${P}.op.add2`, "add", "mlp-add", "+", x - (G + 4) / 2, top - T / 2, l);
    act(`${P}.out`, "mlp-add", "x + MLP  (block output)", x, top, C, l, { src: "trace", layer: l, field: "output" });
    skips.push({ id: `${P}.skip2`, x0: mlpStart - C / 2, x1: x - (G + 4) / 2, top, bottom: top - T - 7, layer: l });
    modules.push({
      id: `${P}.mlp`,
      title: `Block ${l + 1}  ·  MLP`,
      subtitle: `${C} → ${F} → ${C} per token — each token is processed on its own`,
      step: "mlp-up",
      layer: l,
      min: [mlpStart + g / 2 - 2, top - T - 4, -LAYOUT.upDz - 6],
      max: [x - G - 2, top + WG + FW + 6, 6],
    });
    x += C;
    xEnd = Math.max(xEnd, x);
    if (l < L - 1) returns.push({ id: `${P}.return`, x0: x, y0: top, x1: 0, y1: -(l + 1) * rowPitch, layer: l });
  }

  // --- Output section (after the last block, same row) -------------------
  const lastTop = rowTop[L - 1];
  let ox = xEnd + G + 6;
  slab({ id: "final.rms", kind: "rms", step: "final-norm", label: "RMS", rows: T, cols: 1, x: ox, y: lastTop, layer: L, ref: { src: "finalRms" }, colAxis: "one" });
  ox += 1 + g;
  slab({ id: "final.gain", kind: "vector", step: "final-norm", label: "gain", rows: 1, cols: C, x: ox, y: lastTop + WG + 1, layer: L, ref: { src: "finalGain" }, rowAxis: "one" });
  op("final.op.norm", "norm", "final-norm", "RMSNorm", ox - g / 2 - 0.5, lastTop + 9, L);
  act("final.normed", "final-norm", "final vectors", ox, lastTop, C, L, { src: "finalNormed" });
  ox += C + G;
  const predictionsX = ox;
  ox += 30;

  const cityCols = LAYOUT.mosaicCols;
  const cityRows = Math.ceil(V / cityCols);
  const cityTile = 2;
  const city = { x: ox + 10, y: lastTop - T - 6, z: 14, w: cityCols * cityTile, d: cityRows * cityTile, tile: cityTile, cols: cityCols, rows: cityRows };
  const sampleX = city.x + city.w + 26;

  return {
    T,
    slabs,
    ops,
    skips,
    modules,
    returns,
    embed,
    output: { predictionsX, city, sampleX },
    rowTop,
    rowPitch,
    bounds: {
      min: [embed.mosaic.x - 8, lastTop - T - 40, -(H - 1) * LAYOUT.headDz - 10],
      max: [sampleX + 40, Math.max(embed.mosaic.y + 40, WG + Math.max(FW, C) + 24), city.z + city.d + 6],
    },
  };
}
