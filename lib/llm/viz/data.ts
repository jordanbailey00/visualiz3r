import type { ForwardTrace, LoadedModel, Tensor } from "../model";
import type { SlabSpec, TensorRef } from "./layout";

export interface SlabData {
  rows: number;
  cols: number;
  /** Row-major values, rows × cols. Masked attention entries are NaN. */
  values: Float32Array;
}

function sliceCols(t: Tensor, c0: number, c1: number): SlabData {
  const [rows, cols] = t.shape;
  const w = c1 - c0;
  const out = new Float32Array(rows * w);
  for (let r = 0; r < rows; r++) out.set(t.data.subarray(r * cols + c0, r * cols + c1), r * w);
  return { rows, cols: w, values: out };
}

function transpose(d: SlabData): SlabData {
  const out = new Float32Array(d.rows * d.cols);
  for (let r = 0; r < d.rows; r++) for (let c = 0; c < d.cols; c++) out[c * d.rows + r] = d.values[r * d.cols + c];
  return { rows: d.cols, cols: d.rows, values: out };
}

function headMatrix(t: Tensor, h: number): SlabData {
  // [H, A, B] → [A, B] for head h
  const [, a, b] = t.shape;
  return { rows: a, cols: b, values: t.data.subarray(h * a * b, (h + 1) * a * b) };
}

function asRow(t: Tensor): SlabData {
  return { rows: 1, cols: t.data.length, values: t.data };
}

function asCol(t: Tensor): SlabData {
  return { rows: t.data.length, cols: 1, values: t.data };
}

function full(t: Tensor): SlabData {
  const [rows, cols] = t.shape;
  return { rows, cols, values: t.data };
}

/** Fetch the numbers a slab displays. */
export function slabData(ref: TensorRef, model: LoadedModel, trace: ForwardTrace): SlabData {
  switch (ref.src) {
    case "embeddings":
      return full(trace.embeddings);
    case "finalNormed":
      return full(trace.finalNormed);
    case "finalRms":
      return asCol(trace.finalNormRms);
    case "finalGain":
      return asRow(model.weights.finalNorm);
    case "weight": {
      const w = model.weights.layers[ref.layer][ref.field];
      return w.shape.length === 1 ? asRow(w) : full(w);
    }
    case "trace": {
      const t = trace.layers[ref.layer][ref.field] as Tensor;
      let d: SlabData;
      if (ref.field === "attnNormRms" || ref.field === "mlpNormRms") d = asCol(t);
      else if (ref.head !== undefined) d = headMatrix(t, ref.head);
      else if (ref.cols) d = sliceCols(t, ref.cols[0], ref.cols[1]);
      else d = full(t);
      if (ref.transpose) d = transpose(d);
      if (ref.field === "scores" || ref.field === "probs") {
        // Future positions are masked (−∞ scores, 0 probability); mark them NaN for display.
        const v = new Float32Array(d.values);
        for (let i = 0; i < d.rows; i++) for (let j = i + 1; j < d.cols; j++) v[i * d.cols + j] = Number.NaN;
        d = { ...d, values: v };
      }
      return d;
    }
  }
}

export function valueAt(d: SlabData, row: number, col: number) {
  return d.values[row * d.cols + col];
}

/** Robust scale: the given percentile of |v| over finite entries. */
export function robustScale(values: Float32Array, pct = 0.985) {
  const abs: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (Number.isFinite(v)) abs.push(Math.abs(v));
  }
  if (abs.length === 0) return 1;
  abs.sort((a, b) => a - b);
  const k = Math.min(abs.length - 1, Math.floor(abs.length * pct));
  return Math.max(abs[k], 1e-6);
}

export function stats(values: Float32Array) {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let sq = 0;
  let n = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) continue;
    min = Math.min(min, v);
    max = Math.max(max, v);
    sum += v;
    sq += v * v;
    n++;
  }
  const mean = n ? sum / n : 0;
  return { min, max, mean, std: n ? Math.sqrt(Math.max(0, sq / n - mean * mean)) : 0, count: n };
}

export type SlabDataMap = Map<string, SlabData>;

export function computeAllSlabData(slabs: SlabSpec[], model: LoadedModel, trace: ForwardTrace): SlabDataMap {
  const out: SlabDataMap = new Map();
  for (const s of slabs) out.set(s.id, slabData(s.ref, model, trace));
  return out;
}
