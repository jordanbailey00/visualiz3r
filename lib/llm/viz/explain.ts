/**
 * Explanations for every part of the transformer visualisation, written for a
 * curious non-expert. `describe*` functions mix fixed text with live numbers
 * from the current forward pass.
 */

import type { ForwardTrace, LoadedModel } from "../model";
import type { BpeTokenizer } from "../tokenizer";
import { stats, valueAt, type SlabData } from "./data";
import type { OpSpec, SlabSpec, StepId } from "./layout";

export interface StepInfo {
  title: string;
  /** One-line summary. */
  short: string;
  body: string[];
  formula?: string;
}

export const STEPS: Record<StepId | "tokens" | "unembed" | "sample", StepInfo> = {
  tokens: {
    title: "Tokenization",
    short: "Text is split into tokens — whole words or word pieces.",
    body: [
      "A language model never sees letters. The text is first cut into **tokens**: common words like ` the` become a single token (note the leading space is part of it), rarer words are split into pieces.",
      "This model's tokenizer has **2,048 tokens**, learned from its training stories with byte-pair encoding (BPE): start from single bytes and repeatedly merge the most frequent adjacent pair. GPT-4-class models use the same idea with 100,000–200,000 tokens.",
      "A special **[start]** token marks the beginning of the text. Each token is just a number — its position in the vocabulary.",
    ],
  },
  embed: {
    title: "Embedding",
    short: "Each token ID looks up its own row of 64 learned numbers.",
    formula: "x_t = E[id_t]",
    body: [
      "The **embedding table** E has one row for every token in the vocabulary — 2,048 rows of 64 numbers. Each token simply picks out its row. The mosaic shows the whole table: every 8×8 square is one token's 64 numbers (orange = positive, blue = negative).",
      "These numbers were learned during training. Tokens used in similar ways end up with similar vectors, so the model can generalise from one to another.",
    ],
  },
  resid: {
    title: "The residual stream",
    short: "Each token's vector, carried through the model and refined by every block.",
    body: [
      "Each token now has a **lane** — one row of 64 numbers — that runs through the entire model. This bundle of vectors is called the **residual stream**: the model's working memory.",
      "Every block **reads** the stream, computes an update and **adds** it back. Information only moves _between_ lanes inside attention; everything else works on each token separately.",
    ],
  },
  "attn-norm": {
    title: "RMSNorm",
    short: "Rescale each token's vector to a standard size before using it.",
    formula: "x̂ = x / √(mean(x²) + ε) · g",
    body: [
      "Before each sub-layer every token's vector is **normalised**: divided by its root-mean-square (the yellow RMS column, one number per token), then multiplied channel-by-channel by a learned **gain** vector g.",
      "This keeps the numbers in a predictable range no matter how large the stream grows, which makes deep networks much easier to train.",
    ],
  },
  qkv: {
    title: "Queries, keys and values",
    short: "Three learned projections of every token: what it seeks, what it offers, what it says.",
    formula: "Q = x̂·Wq   K = x̂·Wk   V = x̂·Wv",
    body: [
      "Three weight matrices turn each token's normalised vector into three new vectors: a **query** (\"what am I looking for?\"), a **key** (\"what do I contain?\") and a **value** (\"what will I pass on if you attend to me?\").",
      "Read each matrix multiply as a crossroads: a token's row on the **left**, a weight column standing **above** the output; their dot product (multiply 64 pairs, add them up) gives the number where they meet. Click any output cell to see that sum.",
    ],
  },
  rope: {
    title: "Heads and rotary positions (RoPE)",
    short: "Split into 4 heads of 16 numbers, then rotate by position.",
    formula: "(q₂ᵢ, q₂ᵢ₊₁) → rotate by angle  pos · θᵢ",
    body: [
      "The 64 query/key/value numbers are split into **4 heads** of 16 — four independent attention mechanisms that run side by side (shown fanned out in depth). Each head can learn to look for a different kind of relationship.",
      "Attention by itself has no idea of word order, so queries and keys are **rotated** by an angle proportional to the token's position (RoPE). Pairs of numbers turn like clock hands, each pair at a different speed. When a query and a key are compared, only the _difference_ in their angles matters — so the score depends on how far apart the two tokens are.",
    ],
  },
  scores: {
    title: "Attention scores",
    short: "Every query is compared with every earlier key.",
    formula: "score[i, j] = qᵢ · kⱼ / √16",
    body: [
      "Each head compares the query of token i (rows) with the key of every token j (columns, the keys stand transposed above the grid). A large dot product means \"token j looks relevant to token i\". Dividing by √16 = 4 keeps the scores in a sensible range.",
      "The hatched upper triangle is **masked**: a token may only look at itself and _earlier_ tokens. When the model writes text, the future doesn't exist yet — training with the same mask teaches it to predict without peeking.",
    ],
  },
  softmax: {
    title: "Softmax → attention weights",
    short: "Each row becomes a set of positive weights that add up to 1.",
    formula: "aᵢⱼ = exp(scoreᵢⱼ) / Σₖ exp(scoreᵢₖ)",
    body: [
      "Softmax exponentiates each row of scores and divides by its total. The result is how token i **divides its attention** among the tokens up to and including itself — bright cells take most of the share.",
      "Real attention patterns are interpretable: heads that look at the previous token, heads that look back at the start of the text (a common \"resting\" spot), heads that link a word to an earlier related word.",
    ],
  },
  "weighted-sum": {
    title: "Mixing values",
    short: "Each token's output is a weighted average of the value vectors it attends to.",
    formula: "outᵢ = Σⱼ aᵢⱼ · vⱼ",
    body: [
      "The attention weights are used to average the **value** vectors (standing above, one row per token). If token i puts 70% of its attention on token j, its output is mostly token j's value.",
      "This is the **only** step in the whole model where information moves from one token's lane to another. It's how \"little\" can find out that the story is about a girl or a boy.",
    ],
  },
  concat: {
    title: "Concatenate heads",
    short: "The 4 head outputs are placed side by side again.",
    formula: "concat = [head₁ | head₂ | head₃ | head₄]",
    body: ["The four 16-number head outputs are joined back into one 64-number vector per token."],
  },
  "out-proj": {
    title: "Output projection",
    short: "A final matrix mixes the heads into an update for the stream.",
    formula: "update = concat · Wo",
    body: [
      "Wo blends what the different heads found into a single 64-number update per token, in the \"language\" of the residual stream.",
    ],
  },
  "attn-add": {
    title: "Residual add",
    short: "Add the attention update to the stream (skip connection).",
    formula: "x ← x + attention(x)",
    body: [
      "The update is **added** to the vector that entered the block, carried around the sub-layer by the skip connection (the glowing tube underneath). Each block therefore refines the stream rather than replacing it.",
      "Skip connections are why very deep networks train well: information and gradients always have a direct path through the model.",
    ],
  },
  "mlp-norm": {
    title: "RMSNorm (before the MLP)",
    short: "Normalise again before the MLP.",
    formula: "x̂ = x / √(mean(x²) + ε) · g",
    body: ["Same operation as before attention, with its own learned gain."],
  },
  "mlp-up": {
    title: "MLP: expand",
    short: "Each token's 64 numbers are projected up to 256 — twice.",
    formula: "gate = x̂·W_gate    up = x̂·W_up",
    body: [
      "The MLP (multilayer perceptron) works on **each token on its own** — lanes never mix here. Two matrices expand the 64 numbers into a wider 256-number space: a **gate** (front) and an **up** projection (behind).",
      "The wider space gives the network room to detect many features at once. Researchers think a lot of a model's factual knowledge lives in these MLP weights.",
    ],
  },
  "mlp-act": {
    title: "MLP: gate (SwiGLU)",
    short: "SiLU switches features on or off; multiplying by `up` applies the switch.",
    formula: "h = SiLU(gate) × up,   SiLU(z) = z · sigmoid(z)",
    body: [
      "**SiLU** lets positive values through almost unchanged and squashes negative ones toward zero. Multiplying it element-by-element with the up projection makes each of the 256 features **switchable**: the gate decides how much of each feature passes.",
      "This non-linearity is essential — without it, all the matrix multiplies in the model would collapse into a single linear function.",
    ],
  },
  "mlp-down": {
    title: "MLP: compress",
    short: "Project the 256 features back down to 64.",
    formula: "update = h · W_down",
    body: ["W_down (the tall matrix) combines the active features into a 64-number update for the stream."],
  },
  "mlp-add": {
    title: "Residual add — block complete",
    short: "Add the MLP update to the stream. One transformer block done.",
    formula: "x ← x + MLP(x)",
    body: [
      "That's one transformer block: **attention** (tokens share information) then an **MLP** (each token thinks on its own), each wrapped in a normalise → compute → add pattern.",
      "This model stacks **4** identical blocks with different weights. GPT-3 stacks 96; Llama 3 70B stacks 80.",
    ],
  },
  "final-norm": {
    title: "Final normalisation",
    short: "One last RMSNorm on the stream.",
    formula: "x̂ = RMSNorm(x)",
    body: ["After the last block, each token's vector is normalised once more before being turned into predictions."],
  },
  unembed: {
    title: "Unembedding → logits",
    short: "Compare the final vector with every token's embedding.",
    formula: "logitₖ = x̂ · E[k]   for all 2,048 tokens k",
    body: [
      "To predict the next token, the final vector is compared (dot product) with **every row of the embedding table** — the same table used at the start (\"weight tying\"). The result is 2,048 scores called **logits**, one per possible next token.",
      "The model makes a prediction at **every** position (shown beside each lane): during training all of them are checked against the real next token at once. When generating, only the last one matters.",
    ],
  },
  sample: {
    title: "Probabilities and sampling",
    short: "Softmax the logits, then draw the next token.",
    formula: "p = softmax(logits / temperature)",
    body: [
      "Softmax turns the logits into probabilities — the height of each tower in the skyline. **Temperature** sharpens (< 1) or flattens (> 1) the distribution; **top-k** keeps only the k most likely tokens.",
      "A token is drawn at random according to these probabilities, appended to the text, and the whole model runs again for the next one. Writing a story is just this loop, repeated.",
      "Real systems don't recompute everything each time: the keys and values of earlier tokens never change, so they are stored in a **KV cache** and each new token only adds one new row. Here everything is recomputed so you can see all of it.",
    ],
  },
};

export const OP_INFO: Record<OpSpec["kind"], { title: string; body: string }> = {
  norm: { title: "RMSNorm", body: "Divide each token's vector by its root-mean-square, then multiply by a learned gain." },
  matmul: { title: "Matrix multiply", body: "Each output number is the dot product of one row of the input (left) and one column of the weight matrix (above)." },
  rope: { title: "Split heads + RoPE", body: "Cut Q/K/V into 4 heads of 16 numbers and rotate queries and keys by an angle that depends on the token's position." },
  qk: { title: "Dot-product scores", body: "Compare every query with every key, divided by √16 = 4." },
  softmax: { title: "Softmax", body: "Exponentiate each row and normalise it to sum to 1." },
  av: { title: "Weighted sum of values", body: "Average the value vectors using the attention weights." },
  concat: { title: "Concatenate", body: "Join the four 16-number head outputs back into 64 numbers." },
  add: { title: "Residual add", body: "Add the sub-layer's update to the residual stream." },
  silu: { title: "SiLU", body: "z · sigmoid(z): smooth gate that passes positives and squashes negatives." },
  mul: { title: "Element-wise multiply", body: "Multiply SiLU(gate) and up, number by number." },
  split: { title: "Split", body: "Split the vector into heads." },
};

// ---------------------------------------------------------------------------

export interface Ctx {
  model: LoadedModel;
  tokenizer: BpeTokenizer;
  trace: ForwardTrace;
  tokens: number[];
}

export function tokenLabel(ctx: Ctx, i: number) {
  const id = ctx.tokens[i];
  if (id === undefined) return "?";
  if (ctx.tokenizer.isSpecial(id)) return "[start]";
  return JSON.stringify(ctx.tokenizer.tokenString(id));
}

const AXIS_NAME: Record<SlabSpec["rowAxis"], string> = {
  token: "tokens",
  channel: "channels",
  hidden: "hidden features",
  dhead: "head dims",
  one: "",
};

export function shapeText(spec: SlabSpec) {
  const r = AXIS_NAME[spec.rowAxis];
  const c = AXIS_NAME[spec.colAxis];
  if (spec.rows === 1) return `${spec.cols} ${c}`;
  if (spec.cols === 1) return `${spec.rows} ${r}`;
  return `${spec.rows} ${r} × ${spec.cols} ${c}`;
}

export function slabTitle(spec: SlabSpec) {
  const where = spec.layer < 4 ? ` · block ${spec.layer + 1}` : "";
  return `${spec.label}${where}`;
}

export interface Contribution {
  index: number;
  a: number;
  b: number;
  product: number;
}

/**
 * For an output slab of a matrix product, the [left, right] operand slabs:
 * output[r, c] = Σₖ left[r, k] · right[k, c]  (× scale).
 */
export function matmulOperands(id: string): { left: string; right: string; scale: number } | null {
  const m = /^L(\d+)\.(.+)$/.exec(id);
  if (!m) return null;
  const P = `L${m[1]}`;
  const rest = m[2];
  const table: Record<string, [string, string, number?]> = {
    "attn.q": [`${P}.attn.normed`, `${P}.attn.wq`],
    "attn.k": [`${P}.attn.normed`, `${P}.attn.wk`],
    "attn.v": [`${P}.attn.normed`, `${P}.attn.wv`],
    "attn.out": [`${P}.attn.concat`, `${P}.attn.wo`],
    "mlp.gate": [`${P}.mlp.normed`, `${P}.mlp.wgate`],
    "mlp.up": [`${P}.mlp.normed`, `${P}.mlp.wup`],
    "mlp.out": [`${P}.mlp.hidden`, `${P}.mlp.wdown`],
  };
  const h = /^h(\d)\.(out|scores)$/.exec(rest);
  if (h) {
    return h[2] === "out"
      ? { left: `${P}.h${h[1]}.probs`, right: `${P}.h${h[1]}.v`, scale: 1 }
      : { left: `${P}.h${h[1]}.q`, right: `${P}.h${h[1]}.kT`, scale: 0.25 };
  }
  const t = table[rest];
  return t ? { left: t[0], right: t[1], scale: t[2] ?? 1 } : null;
}

/** The dot-product terms behind one output cell of a matrix multiply, if any. */
export function dotTerms(spec: SlabSpec, data: Map<string, SlabData>, row: number, col: number) {
  const ops = matmulOperands(spec.id);
  if (!ops) return null;
  const A = data.get(ops.left);
  const B = data.get(ops.right);
  if (!A || !B) return null;
  const terms: Contribution[] = [];
  let sum = 0;
  for (let k = 0; k < A.cols; k++) {
    const a = valueAt(A, row, k);
    const b = valueAt(B, k, col);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const product = a * b * ops.scale;
    sum += product;
    terms.push({ index: k, a, b, product });
  }
  return { left: ops.left, right: ops.right, terms, sum, scale: ops.scale };
}

export function slabStats(d: SlabData) {
  return stats(d.values);
}

/** Strongest attention (excluding [start]) of the last token, over all heads of a layer. */
export function strongestAttention(ctx: Ctx, layer: number) {
  const probs = ctx.trace.layers[layer].probs;
  const [H, T] = probs.shape;
  const i = T - 1;
  let best = { head: 0, j: 0, p: 0 };
  for (let h = 0; h < H; h++) {
    for (let j = 1; j < T; j++) {
      const p = probs.data[h * T * T + i * T + j];
      if (p > best.p) best = { head: h, j, p };
    }
  }
  return best;
}

/** Average attention paid to the [start] token by all later tokens in a layer. */
export function startAttention(ctx: Ctx, layer: number) {
  const probs = ctx.trace.layers[layer].probs;
  const [H, T] = probs.shape;
  let sum = 0;
  let n = 0;
  for (let h = 0; h < H; h++)
    for (let i = 1; i < T; i++) {
      sum += probs.data[h * T * T + i * T + 0];
      n++;
    }
  return n ? sum / n : 0;
}

export const MODEL_COMPARISON: { name: string; layers: string; width: string; heads: string; vocab: string; context: string; params: string }[] = [
  { name: "This model", layers: "4", width: "64", heads: "4", vocab: "2,048", context: "128", params: "0.39 M" },
  { name: "GPT-2 small (2019)", layers: "12", width: "768", heads: "12", vocab: "50,257", context: "1,024", params: "124 M" },
  { name: "GPT-3 (2020)", layers: "96", width: "12,288", heads: "96", vocab: "50,257", context: "2,048", params: "175 B" },
  { name: "Llama 3 70B (2024)", layers: "80", width: "8,192", heads: "64", vocab: "128,256", context: "8,192+", params: "70 B" },
];

export interface HeadProfile {
  start: number;
  self: number;
  previous: number;
  other: number;
  /** Plain-language description of the dominant pattern. */
  summary: string;
}

/** Average share of attention a head gives to [start], itself, the previous token and the rest. */
export function headProfile(ctx: Ctx, layer: number, head: number): HeadProfile {
  const probs = ctx.trace.layers[layer].probs;
  const T = probs.shape[1];
  let start = 0;
  let self = 0;
  let previous = 0;
  let n = 0;
  // Skip the first two rows: they have almost no choice.
  for (let i = 2; i < T; i++) {
    const row = head * T * T + i * T;
    start += probs.data[row + 0];
    self += probs.data[row + i];
    previous += probs.data[row + i - 1];
    n++;
  }
  if (n === 0) return { start: 0, self: 0, previous: 0, other: 0, summary: "Not enough tokens to tell yet." };
  start /= n;
  self /= n;
  previous /= n;
  const other = Math.max(0, 1 - start - self - previous);
  const best = Math.max(start, self, previous, other);
  const pctS = (v: number) => `${Math.round(v * 100)}%`;
  let summary: string;
  if (best === previous) summary = `A **previous-token head**: on average ${pctS(previous)} of each token's attention goes to the token just before it.`;
  else if (best === start) summary = `Mostly **parks its attention on [start]** (${pctS(start)} on average) — a common way for a head to "do nothing" when nothing relevant is in view.`;
  else if (best === self) summary = `Mostly **attends to itself** (${pctS(self)} on average), passing each token's own value along.`;
  else summary = `A **content-based head**: ${pctS(other)} of attention goes to earlier tokens other than [start] and the previous one — it picks tokens by what they are, not where they are.`;
  return { start, self, previous, other, summary };
}

/** Most likely next token after position t (temperature 1). */
export function topPredictionAt(ctx: Ctx, t: number) {
  const [, V] = ctx.trace.logits.shape;
  const row = ctx.trace.logits.data.subarray(t * V, (t + 1) * V);
  let best = 0;
  for (let i = 1; i < V; i++) if (row[i] > row[best]) best = i;
  let sum = 0;
  for (let i = 0; i < V; i++) sum += Math.exp(row[i] - row[best]);
  return { id: best, prob: 1 / sum };
}
