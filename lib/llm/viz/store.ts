"use client";

import { create } from "zustand";
import { loadLlmAssets } from "../index";
import { forward, mulberry32, sampleToken, softmaxWithTemperature, type ForwardTrace, type LoadedModel } from "../model";
import type { BpeTokenizer, TokenPiece } from "../tokenizer";
import { computeAllSlabData, type SlabDataMap } from "./data";
import { computeLayout, type VizLayout } from "./layout";

export const DEFAULT_PROMPT = "Once upon a time, there was a little";
/** Most tokens shown (including the start-of-text marker). */
export const MAX_TOKENS = 28;

export type Target =
  | { kind: "slab"; id: string; cell?: [number, number] }
  | { kind: "op"; id: string }
  | { kind: "module"; id: string }
  | { kind: "token"; index: number }
  | { kind: "vocab"; id: number; where: "embed" | "output" }
  | { kind: "skip"; id: string };

export interface Prediction {
  id: number;
  prob: number;
}

export interface CameraGoal {
  /** World-space box to frame. */
  min: [number, number, number];
  max: [number, number, number];
  /** View direction (from target toward camera). */
  dir?: [number, number, number];
  nonce: number;
}

interface LlmState {
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  model: LoadedModel | null;
  tokenizer: BpeTokenizer | null;

  prompt: string;
  tokens: number[];
  pieces: TokenPiece[];
  truncated: boolean;
  trace: ForwardTrace | null;
  layout: VizLayout | null;
  data: SlabDataMap;
  /** Top predictions for the next token (after temperature / top-k). */
  predictions: Prediction[];
  /** Distribution after temperature / top-k, for the output skyline. */
  shownProbs: Float32Array | null;

  temperature: number;
  topK: number;
  seed: number;
  lastSampled: { id: number; prob: number } | null;

  hovered: Target | null;
  selected: Target | null;
  /** Token lane highlighted across the whole model. */
  laneHighlight: number | null;

  tourStep: number | null;
  /** Slab/op/module ids emphasised by the current tour step (others dim). */
  focus: Set<string> | null;
  camera: CameraGoal | null;

  init: () => Promise<void>;
  setPrompt: (text: string) => void;
  run: () => void;
  runTokens: (tokens: number[]) => void;
  setTemperature: (t: number) => void;
  setTopK: (k: number) => void;
  generateNext: () => Prediction | null;
  undoLast: () => void;
  hover: (t: Target | null) => void;
  select: (t: Target | null) => void;
  setLane: (i: number | null) => void;
  setTour: (i: number | null) => void;
  setFocus: (ids: Iterable<string> | null) => void;
  frame: (min: [number, number, number], max: [number, number, number], dir?: [number, number, number]) => void;
}

let nonce = 0;

function computeShown(trace: ForwardTrace, temperature: number, topK: number) {
  const [T, V] = trace.logits.shape;
  const last = trace.logits.data.subarray((T - 1) * V, T * V);
  const probs = softmaxWithTemperature(last, Math.max(temperature, 0.05));
  if (topK > 0 && topK < V) {
    const cutoff = Array.from(probs).sort((a, b) => b - a)[topK - 1];
    let sum = 0;
    for (let i = 0; i < V; i++) {
      if (probs[i] < cutoff) probs[i] = 0;
      sum += probs[i];
    }
    for (let i = 0; i < V; i++) probs[i] /= sum;
  }
  const idx = Array.from(probs.keys()).sort((a, b) => probs[b] - probs[a]);
  return { probs, top: idx.slice(0, 12).map((id) => ({ id, prob: probs[id] })) };
}

export const useLlm = create<LlmState>()((set, get) => ({
  status: "idle",
  error: null,
  model: null,
  tokenizer: null,
  prompt: DEFAULT_PROMPT,
  tokens: [],
  pieces: [],
  truncated: false,
  trace: null,
  layout: null,
  data: new Map(),
  predictions: [],
  shownProbs: null,
  temperature: 0.8,
  topK: 40,
  seed: 7,
  lastSampled: null,
  hovered: null,
  selected: null,
  laneHighlight: null,
  tourStep: null,
  focus: null,
  camera: null,

  init: async () => {
    if (get().status === "loading" || get().status === "ready") return;
    set({ status: "loading" });
    try {
      const { model, tokenizer } = await loadLlmAssets();
      set({ model, tokenizer, status: "ready" });
      get().run();
    } catch (e) {
      set({ status: "error", error: e instanceof Error ? e.message : String(e) });
    }
  },

  setPrompt: (text) => {
    set({ prompt: text, lastSampled: null });
    get().run();
  },

  run: () => {
    const { tokenizer, prompt } = get();
    if (!tokenizer) return;
    get().runTokens(tokenizer.encode(prompt.replace(/\s+$/, ""), { addBos: true }));
  },

  runTokens: (input) => {
    const { model, tokenizer, temperature, topK } = get();
    if (!model || !tokenizer) return;
    let tokens = input;
    let truncated = false;
    if (tokens.length > MAX_TOKENS) {
      tokens = [tokens[0], ...tokens.slice(tokens.length - (MAX_TOKENS - 1))];
      truncated = true;
    }
    // Token pieces with character offsets into the decoded text.
    const pieces: TokenPiece[] = [];
    let pos = 0;
    for (const id of tokens) {
      const text = tokenizer.isSpecial(id) ? "" : tokenizer.tokenString(id);
      pieces.push({ id, text, start: pos, end: pos + text.length });
      pos += text.length;
    }
    const trace = forward(model, tokens);
    const layout = computeLayout(model.config, tokens.length);
    const data = computeAllSlabData(layout.slabs, model, trace);
    const { probs, top } = computeShown(trace, get().temperature ?? temperature, get().topK ?? topK);
    const sel = get().selected;
    const keepSel = sel && (sel.kind !== "token" || sel.index < tokens.length) ? sel : null;
    set({ tokens, pieces, truncated, trace, layout, data, predictions: top, shownProbs: probs, selected: keepSel });
  },

  setTemperature: (t) => {
    set({ temperature: t });
    const { trace, topK } = get();
    if (!trace) return;
    const { probs, top } = computeShown(trace, t, topK);
    set({ predictions: top, shownProbs: probs });
  },

  setTopK: (k) => {
    set({ topK: k });
    const { trace, temperature } = get();
    if (!trace) return;
    const { probs, top } = computeShown(trace, temperature, k);
    set({ predictions: top, shownProbs: probs });
  },

  generateNext: () => {
    const { trace, tokenizer, temperature, topK, seed, tokens, shownProbs } = get();
    if (!trace || !tokenizer || tokens.length >= MAX_TOKENS) return null;
    const rng = mulberry32(seed + tokens.length * 7919);
    const [T, V] = trace.logits.shape;
    const last = trace.logits.data.slice((T - 1) * V, T * V);
    const res = sampleToken(last, { temperature, topK, rng, inputType: "logits" });
    const prob = shownProbs?.[res.id] ?? res.probs[res.id];
    const next = [...tokens, res.id];
    set({ prompt: tokenizer.decode(next.slice(1)), lastSampled: { id: res.id, prob } });
    get().runTokens(next);
    return { id: res.id, prob };
  },

  undoLast: () => {
    const { tokens, tokenizer } = get();
    if (!tokenizer || tokens.length <= 2) return;
    const prev = tokens.slice(0, -1);
    set({ prompt: tokenizer.decode(prev.slice(1)), lastSampled: null });
    get().runTokens(prev);
  },

  hover: (t) => {
    const h = get().hovered;
    if (h === t || (h && t && JSON.stringify(h) === JSON.stringify(t))) return;
    set({ hovered: t });
  },
  select: (t) => set({ selected: t }),
  setLane: (i) => {
    if (get().laneHighlight !== i) set({ laneHighlight: i });
  },
  setTour: (i) => set({ tourStep: i }),
  setFocus: (ids) => set({ focus: ids ? new Set(ids) : null }),
  frame: (min, max, dir) => set({ camera: { min, max, dir, nonce: ++nonce } }),
}));
