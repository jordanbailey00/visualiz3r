/**
 * Dependency-free inference engine for the tiny Llama-style model in public/llm/.
 * Reproduces the PyTorch reference (scripts/llm/model.py) and records every
 * intermediate tensor of the forward pass for visualization.
 *
 * Conventions
 * - Tensors are row-major Float32Arrays: element [i, j] of shape [R, K] is data[i * K + j].
 * - All linear weights are stored [in, out] so that y = x @ W (transpose of torch Linear.weight).
 * - Shapes below use T = #tokens, C = dModel, H = nHeads, D = dHead, F = dFF, V = vocabSize.
 * - Arithmetic: every dot product / reduction is accumulated in float64 and the
 *   result of each step is rounded to float32 when stored (as PyTorch float32 would).
 *
 * Architecture (pre-norm decoder, no biases, tied embeddings):
 *   x = tokEmb[ids]
 *   for each layer:
 *     xn = RMSNorm(x) ; q,k,v = xn@Wq, xn@Wk, xn@Wv ; RoPE(q,k) per head (interleaved pairs)
 *     probs = softmax(causal(qRot·kRot / sqrt(D))) ; concat heads ; x = x + concat@Wo
 *     hn = RMSNorm(x) ; x = x + (silu(hn@Wgate) * (hn@Wup)) @ Wdown
 *   logits = RMSNorm(x) @ tokEmb^T
 *   RMSNorm(x) = x / sqrt(mean(x^2) + eps) * weight
 *   RoPE pair i of a head: (x[2i], x[2i+1]) rotated by angle pos * theta^(-2i/D)
 */

import type { BpeTokenizer } from "./tokenizer";

// ---------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------

export interface ModelConfig {
  vocabSize: number;
  dModel: number;
  nLayers: number;
  nHeads: number;
  dHead: number;
  dFF: number;
  maxSeqLen: number;
  ropeTheta: number;
  normEps: number;
  tiedEmbeddings: boolean;
}

/** Row-major float32 tensor. */
export interface Tensor {
  data: Float32Array;
  shape: number[];
}

export interface ModelConfigJson {
  vocab_size: number;
  d_model: number;
  n_layers: number;
  n_heads: number;
  d_head: number;
  d_ff: number;
  max_seq_len: number;
  rope_theta: number;
  norm_eps: number;
  tied_embeddings: boolean;
}

export interface TensorInfoJson {
  name: string;
  shape: number[];
  dtype: "float32";
  /** byte offset into model.bin */
  offset: number;
  /** number of elements */
  length: number;
}

export interface TrainingInfoJson {
  dataset: string;
  train_tokens_seen: number;
  steps: number;
  final_train_loss: number;
  final_val_loss: number;
  params_total: number;
  params_non_embedding: number;
  notes: string;
  [extra: string]: unknown;
}

export interface SampleJson {
  prompt: string;
  completion: string;
  [extra: string]: unknown;
}

/** Shape of public/llm/model.json. */
export interface ModelJson {
  config: ModelConfigJson;
  tensors: TensorInfoJson[];
  training: TrainingInfoJson;
  samples: SampleJson[];
}

export interface TrainingInfo {
  dataset: string;
  trainTokensSeen: number;
  steps: number;
  finalTrainLoss: number;
  finalValLoss: number;
  paramsTotal: number;
  paramsNonEmbedding: number;
  notes: string;
  /** the untouched JSON object (may hold extra fields) */
  raw: TrainingInfoJson;
}

export interface LayerWeights {
  /** [C] RMSNorm weight before attention ("layers.i.attn_norm") */
  attnNorm: Tensor;
  /** [C, C] */
  wq: Tensor;
  /** [C, C] */
  wk: Tensor;
  /** [C, C] */
  wv: Tensor;
  /** [C, C] output projection */
  wo: Tensor;
  /** [C] RMSNorm weight before the MLP ("layers.i.mlp_norm") */
  mlpNorm: Tensor;
  /** [C, F] */
  wGate: Tensor;
  /** [C, F] */
  wUp: Tensor;
  /** [F, C] */
  wDown: Tensor;
}

export interface ModelWeights {
  /** [V, C] token embedding; also the (transposed) LM head */
  tokEmb: Tensor;
  layers: LayerWeights[];
  /** [C] */
  finalNorm: Tensor;
}

export interface LoadedModel {
  config: ModelConfig;
  weights: ModelWeights;
  /** every tensor by its exported name ("tok_emb", "layers.0.wq", ..., "final_norm") */
  tensors: Record<string, Tensor>;
  /** tensor names in file order */
  tensorNames: string[];
  training: TrainingInfo;
  samples: SampleJson[];
}

export interface LayerTrace {
  /** [T, C] residual stream entering the layer */
  input: Tensor;
  /** [T] sqrt(mean(input^2) + eps) per token */
  attnNormRms: Tensor;
  /** [T, C] input / rms * attnNorm */
  attnNormed: Tensor;
  /** [T, C] before RoPE; head h = channels [h*D, (h+1)*D) */
  q: Tensor;
  k: Tensor;
  v: Tensor;
  /** [T, C] after RoPE (per-head interleaved rotation) */
  qRot: Tensor;
  kRot: Tensor;
  /** [H, T, T] qRot·kRot / sqrt(D); entries with key j > query i are -Infinity */
  scores: Tensor;
  /** [H, T, T] softmax over keys; masked entries exactly 0 */
  probs: Tensor;
  /** [H, T, D] probs @ v per head */
  headOut: Tensor;
  /** [T, C] heads concatenated in head order */
  concat: Tensor;
  /** [T, C] concat @ wo */
  attnOut: Tensor;
  /** [T, C] input + attnOut */
  resid1: Tensor;
  /** [T] */
  mlpNormRms: Tensor;
  /** [T, C] */
  mlpNormed: Tensor;
  /** [T, F] mlpNormed @ wGate */
  gate: Tensor;
  /** [T, F] mlpNormed @ wUp */
  up: Tensor;
  /** [T, F] silu(gate) = gate * sigmoid(gate) */
  act: Tensor;
  /** [T, F] act * up */
  hidden: Tensor;
  /** [T, C] hidden @ wDown */
  mlpOut: Tensor;
  /** [T, C] resid1 + mlpOut */
  output: Tensor;
}

export interface ForwardTrace {
  tokens: number[];
  /** [T, C] rows of tokEmb */
  embeddings: Tensor;
  layers: LayerTrace[];
  /** [T] RMS used by the final norm */
  finalNormRms: Tensor;
  /** [T, C] */
  finalNormed: Tensor;
  /** [T, V] */
  logits: Tensor;
  /** [V] softmax(logits[T-1]) at temperature 1 */
  probs: Tensor;
}

// ---------------------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------------------

const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

function readFloat32(bin: ArrayBuffer, offset: number, length: number): Float32Array {
  if (offset + 4 * length > bin.byteLength) throw new Error("model.bin is truncated");
  if (LITTLE_ENDIAN && offset % 4 === 0) return new Float32Array(bin, offset, length);
  const dv = new DataView(bin, offset, 4 * length);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = dv.getFloat32(4 * i, true);
  return out;
}

function configFromJson(c: ModelConfigJson): ModelConfig {
  const cfg: ModelConfig = {
    vocabSize: c.vocab_size,
    dModel: c.d_model,
    nLayers: c.n_layers,
    nHeads: c.n_heads,
    dHead: c.d_head,
    dFF: c.d_ff,
    maxSeqLen: c.max_seq_len,
    ropeTheta: c.rope_theta,
    normEps: c.norm_eps,
    tiedEmbeddings: c.tied_embeddings,
  };
  if (cfg.nHeads * cfg.dHead !== cfg.dModel) throw new Error("n_heads * d_head != d_model");
  if (cfg.dHead % 2 !== 0) throw new Error("d_head must be even for RoPE");
  if (!cfg.tiedEmbeddings) throw new Error("only tied embeddings are supported");
  return cfg;
}

/** Build a LoadedModel from model.json (parsed) and the raw bytes of model.bin. */
export function loadModel(json: ModelJson, bin: ArrayBuffer): LoadedModel {
  const config = configFromJson(json.config);
  const tensors: Record<string, Tensor> = {};
  for (const t of json.tensors) {
    if (t.dtype !== "float32") throw new Error(`unsupported dtype ${t.dtype} for ${t.name}`);
    const n = t.shape.reduce((a, b) => a * b, 1);
    if (n !== t.length) throw new Error(`shape/length mismatch for ${t.name}`);
    tensors[t.name] = { data: readFloat32(bin, t.offset, t.length), shape: [...t.shape] };
  }
  const { vocabSize: V, dModel: C, dFF: F } = config;
  const get = (name: string, shape: number[]): Tensor => {
    const t = tensors[name];
    if (!t) throw new Error(`missing tensor ${name}`);
    if (t.shape.length !== shape.length || t.shape.some((s, i) => s !== shape[i]))
      throw new Error(`tensor ${name} has shape [${t.shape}], expected [${shape}]`);
    return t;
  };
  const layers: LayerWeights[] = [];
  for (let i = 0; i < config.nLayers; i++) {
    const p = `layers.${i}.`;
    layers.push({
      attnNorm: get(p + "attn_norm", [C]),
      wq: get(p + "wq", [C, C]),
      wk: get(p + "wk", [C, C]),
      wv: get(p + "wv", [C, C]),
      wo: get(p + "wo", [C, C]),
      mlpNorm: get(p + "mlp_norm", [C]),
      wGate: get(p + "w_gate", [C, F]),
      wUp: get(p + "w_up", [C, F]),
      wDown: get(p + "w_down", [F, C]),
    });
  }
  const tr = json.training;
  return {
    config,
    weights: { tokEmb: get("tok_emb", [V, C]), layers, finalNorm: get("final_norm", [C]) },
    tensors,
    tensorNames: json.tensors.map((t) => t.name),
    training: {
      dataset: tr.dataset,
      trainTokensSeen: tr.train_tokens_seen,
      steps: tr.steps,
      finalTrainLoss: tr.final_train_loss,
      finalValLoss: tr.final_val_loss,
      paramsTotal: tr.params_total,
      paramsNonEmbedding: tr.params_non_embedding,
      notes: tr.notes,
      raw: tr,
    },
    samples: json.samples ?? [],
  };
}

// ---------------------------------------------------------------------------------------
// Compute kernels (float64 copies of the weights, transposed for dot-product loops).
// Cached per model object so LoadedModel stays plain, cloneable data.
// ---------------------------------------------------------------------------------------

interface LayerKernel {
  attnNorm: Float64Array;
  wqT: Float64Array; // [C, C] (out, in)
  wkT: Float64Array;
  wvT: Float64Array;
  woT: Float64Array;
  mlpNorm: Float64Array;
  wGateT: Float64Array; // [F, C]
  wUpT: Float64Array; // [F, C]
  wDownT: Float64Array; // [C, F]
}

interface Kernel {
  tokEmb: Float64Array; // [V, C] == LM head transposed
  finalNorm: Float64Array;
  layers: LayerKernel[];
  ropeCos: Float64Array; // [maxSeqLen, D/2]
  ropeSin: Float64Array;
}

const kernelCache = new WeakMap<LoadedModel, Kernel>();

function transposeF64(t: Tensor): Float64Array {
  const [R, K] = t.shape;
  const out = new Float64Array(R * K);
  const d = t.data;
  for (let r = 0; r < R; r++) for (let k = 0; k < K; k++) out[k * R + r] = d[r * K + k];
  return out;
}

function getKernel(model: LoadedModel): Kernel {
  let k = kernelCache.get(model);
  if (k) return k;
  const { config: cfg, weights: w } = model;
  const half = cfg.dHead / 2;
  const ropeCos = new Float64Array(cfg.maxSeqLen * half);
  const ropeSin = new Float64Array(cfg.maxSeqLen * half);
  for (let i = 0; i < half; i++) {
    const invFreq = Math.pow(cfg.ropeTheta, (-2 * i) / cfg.dHead);
    for (let pos = 0; pos < cfg.maxSeqLen; pos++) {
      const ang = pos * invFreq;
      ropeCos[pos * half + i] = Math.cos(ang);
      ropeSin[pos * half + i] = Math.sin(ang);
    }
  }
  k = {
    tokEmb: Float64Array.from(w.tokEmb.data),
    finalNorm: Float64Array.from(w.finalNorm.data),
    layers: w.layers.map((l) => ({
      attnNorm: Float64Array.from(l.attnNorm.data),
      wqT: transposeF64(l.wq),
      wkT: transposeF64(l.wk),
      wvT: transposeF64(l.wv),
      woT: transposeF64(l.wo),
      mlpNorm: Float64Array.from(l.mlpNorm.data),
      wGateT: transposeF64(l.wGate),
      wUpT: transposeF64(l.wUp),
      wDownT: transposeF64(l.wDown),
    })),
    ropeCos,
    ropeSin,
  };
  kernelCache.set(model, k);
  return k;
}

/**
 * y[T, N] = x[T, K] @ W where wT = W^T as float64 [N, K].
 * Every output is a plain sequential float64 sum over k, rounded once to float32.
 * Register-blocked 4 rows x 4 columns (rows of x interleaved into a float64 scratch
 * buffer) so each load feeds several multiply-adds; ~4x faster than the naive loop in V8.
 */
function linear(x: Float32Array, T: number, K: number, wT: Float64Array, N: number): Float32Array {
  const y = new Float32Array(T * N);
  const xb = new Float64Array(4 * K);
  const N4 = N - (N % 4);
  let t = 0;
  for (; t + 4 <= T; t += 4) {
    const x0 = t * K;
    for (let k = 0; k < K; k++) {
      xb[4 * k] = x[x0 + k];
      xb[4 * k + 1] = x[x0 + K + k];
      xb[4 * k + 2] = x[x0 + 2 * K + k];
      xb[4 * k + 3] = x[x0 + 3 * K + k];
    }
    const y0 = t * N;
    const y1 = y0 + N;
    const y2 = y1 + N;
    const y3 = y2 + N;
    let n = 0;
    for (; n < N4; n += 4) {
      const w0 = n * K;
      const w1 = w0 + K;
      const w2 = w1 + K;
      const w3 = w2 + K;
      let a0 = 0, a1 = 0, a2 = 0, a3 = 0; // prettier-ignore
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0; // prettier-ignore
      let c0 = 0, c1 = 0, c2 = 0, c3 = 0; // prettier-ignore
      let d0 = 0, d1 = 0, d2 = 0, d3 = 0; // prettier-ignore
      for (let k = 0; k < K; k++) {
        const kb = 4 * k;
        const p0 = xb[kb];
        const p1 = xb[kb + 1];
        const p2 = xb[kb + 2];
        const p3 = xb[kb + 3];
        const wa = wT[w0 + k];
        const wb = wT[w1 + k];
        const wc = wT[w2 + k];
        const wd = wT[w3 + k];
        a0 += p0 * wa; a1 += p1 * wa; a2 += p2 * wa; a3 += p3 * wa; // prettier-ignore
        b0 += p0 * wb; b1 += p1 * wb; b2 += p2 * wb; b3 += p3 * wb; // prettier-ignore
        c0 += p0 * wc; c1 += p1 * wc; c2 += p2 * wc; c3 += p3 * wc; // prettier-ignore
        d0 += p0 * wd; d1 += p1 * wd; d2 += p2 * wd; d3 += p3 * wd; // prettier-ignore
      }
      y[y0 + n] = a0; y[y1 + n] = a1; y[y2 + n] = a2; y[y3 + n] = a3; // prettier-ignore
      y[y0 + n + 1] = b0; y[y1 + n + 1] = b1; y[y2 + n + 1] = b2; y[y3 + n + 1] = b3; // prettier-ignore
      y[y0 + n + 2] = c0; y[y1 + n + 2] = c1; y[y2 + n + 2] = c2; y[y3 + n + 2] = c3; // prettier-ignore
      y[y0 + n + 3] = d0; y[y1 + n + 3] = d1; y[y2 + n + 3] = d2; y[y3 + n + 3] = d3; // prettier-ignore
    }
    for (; n < N; n++) {
      const w0 = n * K;
      let a0 = 0, a1 = 0, a2 = 0, a3 = 0; // prettier-ignore
      for (let k = 0; k < K; k++) {
        const w = wT[w0 + k];
        a0 += xb[4 * k] * w;
        a1 += xb[4 * k + 1] * w;
        a2 += xb[4 * k + 2] * w;
        a3 += xb[4 * k + 3] * w;
      }
      y[y0 + n] = a0; y[y1 + n] = a1; y[y2 + n] = a2; y[y3 + n] = a3; // prettier-ignore
    }
  }
  for (; t < T; t++) {
    const x0 = t * K;
    for (let k = 0; k < K; k++) xb[k] = x[x0 + k];
    const y0 = t * N;
    for (let n = 0; n < N; n++) {
      const w0 = n * K;
      let s = 0;
      for (let k = 0; k < K; k++) s += xb[k] * wT[w0 + k];
      y[y0 + n] = s;
    }
  }
  return y;
}

function rmsNorm(x: Float32Array, T: number, C: number, w: Float64Array, eps: number): [Float32Array, Float32Array] {
  const rms = new Float32Array(T);
  const out = new Float32Array(T * C);
  for (let t = 0; t < T; t++) {
    const o = t * C;
    let ss = 0;
    for (let c = 0; c < C; c++) ss += x[o + c] * x[o + c];
    const r = Math.sqrt(ss / C + eps);
    rms[t] = r;
    for (let c = 0; c < C; c++) out[o + c] = (x[o + c] / r) * w[c];
  }
  return [rms, out];
}

function add(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] + b[i];
  return out;
}

function rope(x: Float32Array, T: number, H: number, D: number, cos: Float64Array, sin: Float64Array): Float32Array {
  const out = new Float32Array(x.length);
  const half = D / 2;
  const C = H * D;
  for (let t = 0; t < T; t++) {
    for (let h = 0; h < H; h++) {
      const base = t * C + h * D;
      for (let i = 0; i < half; i++) {
        const c = cos[t * half + i];
        const s = sin[t * half + i];
        const x0 = x[base + 2 * i];
        const x1 = x[base + 2 * i + 1];
        out[base + 2 * i] = x0 * c - x1 * s;
        out[base + 2 * i + 1] = x0 * s + x1 * c;
      }
    }
  }
  return out;
}

const tensor = (data: Float32Array, shape: number[]): Tensor => ({ data, shape });

// ---------------------------------------------------------------------------------------
// Forward
// ---------------------------------------------------------------------------------------

/**
 * Full forward pass over `tokenIds` (1 <= T <= maxSeqLen; prepend bosId yourself, as
 * the model was trained with <|endoftext|> at the start of every story). Positions
 * are 0..T-1. Returns every intermediate tensor (see ForwardTrace / LayerTrace).
 */
export function forward(model: LoadedModel, tokenIds: number[]): ForwardTrace {
  const cfg = model.config;
  const { vocabSize: V, dModel: C, nHeads: H, dHead: D, dFF: F, normEps: eps } = cfg;
  const T = tokenIds.length;
  if (T < 1) throw new Error("forward() needs at least one token");
  if (T > cfg.maxSeqLen) throw new Error(`sequence length ${T} exceeds maxSeqLen ${cfg.maxSeqLen}`);
  for (const id of tokenIds)
    if (!Number.isInteger(id) || id < 0 || id >= V) throw new RangeError(`token id ${id} out of range`);
  const K = getKernel(model);
  const emb = model.weights.tokEmb.data;

  const embeddings = new Float32Array(T * C);
  for (let t = 0; t < T; t++) embeddings.set(emb.subarray(tokenIds[t] * C, tokenIds[t] * C + C), t * C);

  const scale = Math.sqrt(D);
  const layers: LayerTrace[] = [];
  let x: Float32Array = embeddings;
  for (let l = 0; l < cfg.nLayers; l++) {
    const w = K.layers[l];
    const input = x;
    const [attnNormRms, attnNormed] = rmsNorm(input, T, C, w.attnNorm, eps);
    const q = linear(attnNormed, T, C, w.wqT, C);
    const k = linear(attnNormed, T, C, w.wkT, C);
    const v = linear(attnNormed, T, C, w.wvT, C);
    const qRot = rope(q, T, H, D, K.ropeCos, K.ropeSin);
    const kRot = rope(k, T, H, D, K.ropeCos, K.ropeSin);

    const scores = new Float32Array(H * T * T);
    const probs = new Float32Array(H * T * T);
    const headOut = new Float32Array(H * T * D);
    const concat = new Float32Array(T * C);
    const e = new Float64Array(T);
    const acc = new Float64Array(D);
    for (let h = 0; h < H; h++) {
      const hb = h * T * T;
      for (let i = 0; i < T; i++) {
        const row = hb + i * T;
        const qo = i * C + h * D;
        let m = -Infinity;
        for (let j = 0; j <= i; j++) {
          const ko = j * C + h * D;
          let s = 0;
          for (let d = 0; d < D; d++) s += qRot[qo + d] * kRot[ko + d];
          scores[row + j] = s / scale;
          const sv = scores[row + j]; // the stored float32 value
          if (sv > m) m = sv;
        }
        for (let j = i + 1; j < T; j++) scores[row + j] = -Infinity;
        let sum = 0;
        for (let j = 0; j <= i; j++) {
          const ev = Math.exp(scores[row + j] - m);
          e[j] = ev;
          sum += ev;
        }
        acc.fill(0);
        for (let j = 0; j <= i; j++) {
          probs[row + j] = e[j] / sum;
          const p = probs[row + j]; // headOut = (stored float32 probs) @ v
          const vo = j * C + h * D;
          for (let d = 0; d < D; d++) acc[d] += p * v[vo + d];
        }
        // probs[row + j] for j > i stay exactly 0
        const ho = (h * T + i) * D;
        for (let d = 0; d < D; d++) headOut[ho + d] = acc[d];
        concat.set(headOut.subarray(ho, ho + D), i * C + h * D);
      }
    }
    const attnOut = linear(concat, T, C, w.woT, C);
    const resid1 = add(input, attnOut);
    const [mlpNormRms, mlpNormed] = rmsNorm(resid1, T, C, w.mlpNorm, eps);
    const gate = linear(mlpNormed, T, C, w.wGateT, F);
    const up = linear(mlpNormed, T, C, w.wUpT, F);
    const act = new Float32Array(T * F);
    const hidden = new Float32Array(T * F);
    for (let i = 0; i < T * F; i++) {
      const g = gate[i];
      act[i] = g / (1 + Math.exp(-g));
      hidden[i] = act[i] * up[i];
    }
    const mlpOut = linear(hidden, T, F, w.wDownT, C);
    const output = add(resid1, mlpOut);
    layers.push({
      input: tensor(input, [T, C]),
      attnNormRms: tensor(attnNormRms, [T]),
      attnNormed: tensor(attnNormed, [T, C]),
      q: tensor(q, [T, C]),
      k: tensor(k, [T, C]),
      v: tensor(v, [T, C]),
      qRot: tensor(qRot, [T, C]),
      kRot: tensor(kRot, [T, C]),
      scores: tensor(scores, [H, T, T]),
      probs: tensor(probs, [H, T, T]),
      headOut: tensor(headOut, [H, T, D]),
      concat: tensor(concat, [T, C]),
      attnOut: tensor(attnOut, [T, C]),
      resid1: tensor(resid1, [T, C]),
      mlpNormRms: tensor(mlpNormRms, [T]),
      mlpNormed: tensor(mlpNormed, [T, C]),
      gate: tensor(gate, [T, F]),
      up: tensor(up, [T, F]),
      act: tensor(act, [T, F]),
      hidden: tensor(hidden, [T, F]),
      mlpOut: tensor(mlpOut, [T, C]),
      output: tensor(output, [T, C]),
    });
    x = output;
  }
  const [finalNormRms, finalNormed] = rmsNorm(x, T, C, K.finalNorm, eps);
  const logits = linear(finalNormed, T, C, K.tokEmb, V); // tied: W^T = tokEmb [V, C]
  const probs = softmaxWithTemperature(logits.subarray((T - 1) * V, T * V), 1);
  return {
    tokens: [...tokenIds],
    embeddings: tensor(embeddings, [T, C]),
    layers,
    finalNormRms: tensor(finalNormRms, [T]),
    finalNormed: tensor(finalNormed, [T, C]),
    logits: tensor(logits, [T, V]),
    probs: tensor(probs, [V]),
  };
}

/**
 * View (no copy) of t[i0, i1, ...] over the remaining trailing dimensions, e.g.
 * tensorRow(trace.logits, t) -> [V], tensorRow(layer.probs, h, i) -> [T] (attention
 * of query i in head h), tensorRow(layer.probs, h) -> [T, T] (flattened).
 */
export function tensorRow(t: Tensor, ...index: number[]): Float32Array {
  if (index.length > t.shape.length) throw new RangeError("too many indices");
  let offset = 0;
  let size = t.data.length;
  for (let d = 0; d < index.length; d++) {
    const i = index[d];
    if (!Number.isInteger(i) || i < 0 || i >= t.shape[d]) throw new RangeError(`index ${i} out of range for dim ${d}`);
    size /= t.shape[d];
    offset += i * size;
  }
  return t.data.subarray(offset, offset + size);
}

/** Last-position logits [V] of a trace (a view into trace.logits). */
export function lastLogits(trace: ForwardTrace): Float32Array {
  return tensorRow(trace.logits, trace.tokens.length - 1);
}

// ---------------------------------------------------------------------------------------
// Sampling
// ---------------------------------------------------------------------------------------

/** softmax(logits / temperature) in float64, stored float32. temperature <= 0 -> one-hot argmax. */
export function softmaxWithTemperature(logits: Float32Array, temperature: number): Float32Array {
  const n = logits.length;
  const out = new Float32Array(n);
  if (n === 0) return out;
  if (!(temperature > 0)) {
    out[argmax(logits)] = 1;
    return out;
  }
  let m = -Infinity;
  for (let i = 0; i < n; i++) {
    const z = logits[i] / temperature;
    if (z > m) m = z;
  }
  const e = new Float64Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const v = Math.exp(logits[i] / temperature - m);
    e[i] = v;
    sum += v;
  }
  for (let i = 0; i < n; i++) out[i] = e[i] / sum;
  return out;
}

function argmax(a: ArrayLike<number>): number {
  let best = 0;
  for (let i = 1; i < a.length; i++) if (a[i] > a[best]) best = i;
  return best;
}

export interface SampleOptions {
  /** <= 0 means greedy (argmax) */
  temperature: number;
  /** keep only the k most likely tokens (after temperature) */
  topK?: number;
  /** nucleus sampling: smallest set of top tokens with cumulative prob >= topP */
  topP?: number;
  /** uniform [0, 1) generator, e.g. mulberry32(seed) */
  rng: () => number;
  /** how to interpret the input; default: probabilities if it looks like a distribution */
  inputType?: "logits" | "probs";
}

export interface SampleResult {
  id: number;
  /** [V] final sampling distribution (after temperature, top-k, top-p; renormalized) */
  probs: Float32Array;
}

function looksLikeProbs(a: ArrayLike<number>): boolean {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const v = a[i];
    if (!(v >= 0 && v <= 1)) return false;
    s += v;
  }
  return Math.abs(s - 1) < 1e-3;
}

/**
 * Sample one token. Pipeline: (probs -> log) ; z = logits / temperature ;
 * p = softmax(z) ; sort by p desc (ties: lower id first) ; keep top-k ; keep the
 * top-p nucleus ; renormalize ; inverse-CDF draw with rng() over the sorted list.
 * Mirrored bit-for-bit by sample_token() in scripts/llm/model.py.
 */
export function sampleToken(probsOrLogits: Float32Array | ArrayLike<number>, opts: SampleOptions): SampleResult {
  const n = probsOrLogits.length;
  const isProbs = opts.inputType ? opts.inputType === "probs" : looksLikeProbs(probsOrLogits);
  if (!(opts.temperature > 0)) {
    const id = argmax(probsOrLogits);
    const probs = new Float32Array(n);
    probs[id] = 1;
    return { id, probs };
  }
  const z = new Float64Array(n);
  let m = -Infinity;
  for (let i = 0; i < n; i++) {
    const raw = isProbs ? Math.log(probsOrLogits[i]) : probsOrLogits[i];
    const v = (z[i] = raw / opts.temperature);
    if (v > m) m = v;
  }
  let total = 0;
  for (let i = 0; i < n; i++) {
    const v = (z[i] = Math.exp(z[i] - m));
    total += v;
  }
  const p = z; // reuse buffer
  for (let i = 0; i < n; i++) p[i] = p[i] / total;
  let keep: number[] = [];
  for (let i = 0; i < n; i++) if (p[i] > 0) keep.push(i);
  keep.sort((a, b) => p[b] - p[a] || a - b);
  if (opts.topK !== undefined && opts.topK > 0) keep = keep.slice(0, opts.topK);
  const sumOf = (ix: number[]) => {
    let s = 0;
    for (const j of ix) s += p[j];
    return s;
  };
  let s = sumOf(keep);
  if (opts.topP !== undefined && opts.topP > 0 && opts.topP < 1) {
    let acc = 0;
    let cut = keep.length;
    for (let i = 0; i < keep.length; i++) {
      acc += p[keep[i]] / s;
      if (acc >= opts.topP) {
        cut = i + 1;
        break;
      }
    }
    keep = keep.slice(0, cut);
    s = sumOf(keep);
  }
  const r = opts.rng();
  let acc = 0;
  let id = keep[keep.length - 1];
  for (const j of keep) {
    acc += p[j] / s;
    if (r < acc) {
      id = j;
      break;
    }
  }
  const probs = new Float32Array(n);
  for (const j of keep) probs[j] = p[j] / s;
  return { id, probs };
}

/** Small, fast, seedable PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------------------
// Generation helper
// ---------------------------------------------------------------------------------------

export interface GenerateOptions {
  /** default 64 */
  maxNewTokens?: number;
  /** default 0.8; <= 0 means greedy */
  temperature?: number;
  /** default 40 (pass 0 to disable) */
  topK?: number;
  topP?: number;
  /** seed for mulberry32 when `rng` is not given (default 0) */
  seed?: number;
  rng?: () => number;
  /** stop when the model emits <|endoftext|> (default true) */
  stopAtEndOfText?: boolean;
  /** called after every generated token */
  onToken?: (step: GenerateStep) => void;
}

export interface GenerateStep {
  id: number;
  /** probability of the chosen token under the final sampling distribution */
  prob: number;
  /** decoded token string */
  text: string;
}

export interface GenerateResult {
  /** [bosId, ...encode(prompt)] */
  promptIds: number[];
  /** newly generated ids (excluding the terminating <|endoftext|>) */
  generatedIds: number[];
  /** decode(generatedIds) */
  completion: string;
  /** normalized prompt + completion */
  text: string;
  steps: GenerateStep[];
  stoppedAtEndOfText: boolean;
}

/**
 * Autoregressive generation: prepends BOS, runs forward() on (at most) the last
 * maxSeqLen tokens each step and samples with sampleToken().
 */
export function generate(
  model: LoadedModel,
  tokenizer: BpeTokenizer,
  prompt: string,
  opts: GenerateOptions = {},
): GenerateResult {
  const maxNew = opts.maxNewTokens ?? 64;
  const temperature = opts.temperature ?? 0.8;
  const topK = opts.topK ?? 40;
  const rng = opts.rng ?? mulberry32(opts.seed ?? 0);
  const stop = opts.stopAtEndOfText ?? true;
  const promptIds = [tokenizer.bosId, ...tokenizer.encode(prompt)];
  const ids = [...promptIds];
  const generatedIds: number[] = [];
  const steps: GenerateStep[] = [];
  let stopped = false;
  const L = model.config.maxSeqLen;
  for (let n = 0; n < maxNew; n++) {
    const ctx = ids.length > L ? ids.slice(ids.length - L) : ids;
    const trace = forward(model, ctx);
    const { id, probs } = sampleToken(lastLogits(trace), {
      temperature,
      topK: topK > 0 ? topK : undefined,
      topP: opts.topP,
      rng,
      inputType: "logits",
    });
    if (stop && id === tokenizer.eosId) {
      stopped = true;
      break;
    }
    const step = { id, prob: probs[id], text: tokenizer.tokenString(id) };
    ids.push(id);
    generatedIds.push(id);
    steps.push(step);
    opts.onToken?.(step);
  }
  const completion = tokenizer.decode(generatedIds);
  return {
    promptIds,
    generatedIds,
    completion,
    text: tokenizer.normalize(prompt) + completion,
    steps,
    stoppedAtEndOfText: stopped,
  };
}
