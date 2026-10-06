import { showTokenPlain } from "./format";
import { STEPS, startAttention, strongestAttention, tokenLabel, topPredictionAt, type Ctx } from "./explain";
import type { VizLayout } from "./layout";

type Box = { min: [number, number, number]; max: [number, number, number] };

export interface TourStep {
  id: string;
  chapter: string;
  title: string;
  formula?: string;
  body: (ctx: Ctx) => string[];
  /** Ids (or `step:` / `layer:` keys) kept bright; everything else dims. Null = nothing dims. */
  focus: (L: VizLayout) => string[] | null;
  frame: (L: VizLayout) => Box & { dir?: [number, number, number] };
}

/** Bounding box of the given slab ids (plus padding). */
export function slabBox(L: VizLayout, ids: string[], pad = 6): Box {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const s of L.slabs) {
    if (!ids.includes(s.id)) continue;
    const w = s.cols * s.cellW;
    const h = s.rows * s.cellH;
    min[0] = Math.min(min[0], s.x);
    max[0] = Math.max(max[0], s.x + w);
    min[1] = Math.min(min[1], s.y - h);
    max[1] = Math.max(max[1], s.y);
    min[2] = Math.min(min[2], s.z);
    max[2] = Math.max(max[2], s.z);
  }
  return {
    min: [min[0] - pad, min[1] - pad, min[2] - pad / 2],
    max: [max[0] + pad, max[1] + pad, max[2] + pad / 2],
  };
}

const heads = (l: number, parts: string[]) => [0, 1, 2, 3].flatMap((h) => parts.map((p) => `L${l}.h${h}.${p}`));
const ANGLED: [number, number, number] = [0.62, 0.3, 1];
/** Slight angle: head 1 in front, the other heads visible behind it. */
const HEAD_VIEW: [number, number, number] = [0.32, 0.2, 1];
const head0 = (l: number, parts: string[]) => parts.map((p) => `L${l}.h0.${p}`);
const FRONT: [number, number, number] = [0.12, 0.08, 1];

function embedBox(L: VizLayout): Box {
  const m = L.embed.mosaic;
  return { min: [m.x - 6, -L.T - 8, -2], max: [70, m.y + 38, 2] };
}


export const TOUR: TourStep[] = [
  {
    id: "intro",
    chapter: "Start",
    title: "Meet the model",
    body: (ctx) => [
      `This is a complete language model, small enough to see every number: **${ctx.model.training.paramsTotal.toLocaleString()} parameters**, trained for about nine minutes on a GPU to continue children's stories.`,
      "It is built exactly like the large models behind modern chatbots — a stack of transformer blocks — just with fewer and narrower layers. Everything you see is computed live in your browser from the prompt at the bottom.",
      "Text enters at the **top-left**, flows **left to right** through four blocks (one per row), and comes out at the **bottom-right** as a prediction of the next token.",
    ],
    focus: () => null,
    frame: (L) => ({ ...L.bounds, dir: [0.16, 0.12, 1] }),
  },
  {
    id: "tokens",
    chapter: "Input",
    title: STEPS.tokens.title,
    body: (ctx) => [
      ...STEPS.tokens.body,
      `Your prompt became **${ctx.tokens.length} tokens** — one per lane, top to bottom: ${ctx.tokens
        .slice(0, 8)
        .map((_, i) => tokenLabel(ctx, i))
        .join(", ")}${ctx.tokens.length > 8 ? ", …" : ""}.`,
    ],
    focus: () => ["step:embed", "tokens"],
    frame: (L) => ({ ...embedBox(L), dir: FRONT }),
  },
  {
    id: "embed",
    chapter: "Input",
    title: STEPS.embed.title,
    formula: STEPS.embed.formula,
    body: () => STEPS.embed.body,
    focus: () => ["step:embed", "L0.x"],
    frame: (L) => ({ ...embedBox(L), dir: FRONT }),
  },
  {
    id: "resid",
    chapter: "Input",
    title: STEPS.resid.title,
    body: () => [...STEPS.resid.body, "Hover over any lane to highlight that token everywhere in the model."],
    focus: (L) => ["step:resid", ...L.slabs.filter((s) => s.step === "attn-add" || s.step === "mlp-add").map((s) => s.id), ...L.returns.map((r) => r.id)],
    frame: (L) => ({ min: [-20, L.rowTop[1] - L.T - 20, -10], max: [L.slabs.find((s) => s.id === "L0.out")!.x + 80, 40, 10], dir: FRONT }),
  },
  {
    id: "attn-norm",
    chapter: "Block 1 · Attention",
    title: STEPS["attn-norm"].title,
    formula: STEPS["attn-norm"].formula,
    body: (ctx) => {
      const rms = ctx.trace.layers[0].attnNormRms.data;
      const T = rms.length;
      return [...STEPS["attn-norm"].body, `For the last token ${tokenLabel(ctx, T - 1)} the RMS is **${rms[T - 1].toFixed(3)}**, so its vector is divided by that before the gain is applied.`];
    },
    focus: () => ["L0.x", "L0.attn.rms", "L0.attn.gain", "L0.attn.normed", "L0.op.norm1"],
    frame: (L) => ({ ...slabBox(L, ["L0.x", "L0.attn.normed", "L0.attn.gain"], 8), dir: FRONT }),
  },
  {
    id: "qkv",
    chapter: "Block 1 · Attention",
    title: STEPS.qkv.title,
    formula: STEPS.qkv.formula,
    body: () => STEPS.qkv.body,
    focus: () => ["L0.attn.normed", "L0.attn.wq", "L0.attn.wk", "L0.attn.wv", "L0.attn.q", "L0.attn.k", "L0.attn.v", "L0.op.qkv"],
    frame: (L) => ({ ...slabBox(L, ["L0.attn.normed", "L0.attn.wq", "L0.attn.v", "L0.attn.wv"], 6), dir: FRONT }),
  },
  {
    id: "rope",
    chapter: "Block 1 · Attention",
    title: STEPS.rope.title,
    formula: STEPS.rope.formula,
    body: () => STEPS.rope.body,
    focus: () => ["L0.attn.q", "L0.attn.k", "L0.attn.v", "L0.op.rope", ...heads(0, ["q", "kT"])],
    frame: (L) => ({ ...slabBox(L, ["L0.attn.v", ...heads(0, ["q", "kT", "scores"])], 6), dir: ANGLED }),
  },
  {
    id: "scores",
    chapter: "Block 1 · Attention",
    title: STEPS.scores.title,
    formula: STEPS.scores.formula,
    body: () => STEPS.scores.body,
    focus: () => [...heads(0, ["q", "kT", "scores"]), "L0.op.qk0"],
    frame: (L) => ({ ...slabBox(L, head0(0, ["q", "kT", "scores", "probs"]), 5), dir: HEAD_VIEW }),
  },
  {
    id: "softmax",
    chapter: "Block 1 · Attention",
    title: STEPS.softmax.title,
    formula: STEPS.softmax.formula,
    body: (ctx) => {
      const b = strongestAttention(ctx, 0);
      const T = ctx.tokens.length;
      return [
        ...STEPS.softmax.body,
        `Right now, in head ${b.head + 1}, the last token ${tokenLabel(ctx, T - 1)} gives **${(b.p * 100).toFixed(0)}%** of its attention to ${tokenLabel(ctx, b.j)}. On average, tokens in this block give **${(startAttention(ctx, 0) * 100).toFixed(0)}%** of their attention to [start].`,
      ];
    },
    focus: () => [...heads(0, ["scores", "probs"]), "L0.op.sm0"],
    frame: (L) => ({ ...slabBox(L, head0(0, ["scores", "probs", "kT"]), 5), dir: HEAD_VIEW }),
  },
  {
    id: "weighted-sum",
    chapter: "Block 1 · Attention",
    title: STEPS["weighted-sum"].title,
    formula: STEPS["weighted-sum"].formula,
    body: () => STEPS["weighted-sum"].body,
    focus: () => [...heads(0, ["probs", "v", "out"]), "L0.op.av0"],
    frame: (L) => ({ ...slabBox(L, head0(0, ["probs", "v", "out"]), 5), dir: HEAD_VIEW }),
  },
  {
    id: "concat",
    chapter: "Block 1 · Attention",
    title: "Combine the heads",
    formula: "update = [head₁ | … | head₄] · Wo",
    body: () => [...STEPS.concat.body, ...STEPS["out-proj"].body],
    focus: () => [...heads(0, ["out"]), "L0.attn.concat", "L0.attn.wo", "L0.attn.out", "L0.op.concat", "L0.op.wo"],
    frame: (L) => ({ ...slabBox(L, [...heads(0, ["out"]), "L0.attn.concat", "L0.attn.wo", "L0.attn.out"], 6), dir: [0.35, 0.18, 1] }),
  },
  {
    id: "attn-add",
    chapter: "Block 1 · Attention",
    title: STEPS["attn-add"].title,
    formula: STEPS["attn-add"].formula,
    body: () => STEPS["attn-add"].body,
    focus: () => ["L0.x", "L0.attn.out", "L0.resid1", "L0.skip1", "L0.op.add1"],
    frame: (L) => ({ ...slabBox(L, ["L0.x", "L0.resid1"], 12), dir: FRONT }),
  },
  {
    id: "mlp",
    chapter: "Block 1 · MLP",
    title: "The MLP: expand, gate, compress",
    formula: "MLP(x) = (SiLU(x̂·W_gate) × x̂·W_up) · W_down",
    body: () => [STEPS["mlp-up"].body[0], STEPS["mlp-act"].body[0], STEPS["mlp-down"].body[0], STEPS["mlp-up"].body[1]],
    focus: (L) => L.slabs.filter((s) => s.layer === 0 && s.id.startsWith("L0.mlp")).map((s) => s.id).concat(["L0.op.norm2", "L0.op.up", "L0.op.silu", "L0.op.mul", "L0.op.down"]),
    frame: (L) => ({ ...slabBox(L, ["L0.mlp.normed", "L0.mlp.wgate", "L0.mlp.up", "L0.mlp.wdown", "L0.mlp.out"], 6), dir: [0.3, 0.16, 1] }),
  },
  {
    id: "mlp-add",
    chapter: "Block 1 · MLP",
    title: STEPS["mlp-add"].title,
    formula: STEPS["mlp-add"].formula,
    body: () => STEPS["mlp-add"].body,
    focus: () => ["L0.resid1", "L0.mlp.out", "L0.out", "L0.skip2", "L0.op.add2"],
    frame: (L) => ({ ...slabBox(L, ["L0.resid1", "L0.out"], 14), dir: FRONT }),
  },
  {
    id: "stack",
    chapter: "Blocks 2–4",
    title: "Repeat: four blocks",
    body: (ctx) => [
      "The stream flows into block 2, 3 and 4 — the same architecture with different learned weights. Early blocks tend to handle local patterns (which word came before); later blocks build up more abstract context.",
      `Watch the attention to [start] change with depth: block 1 gives it ${(startAttention(ctx, 0) * 100).toFixed(0)}% on average, block 4 gives it ${(startAttention(ctx, 3) * 100).toFixed(0)}%. Many heads use the first token as a place to \"park\" attention when nothing else is relevant.`,
    ],
    focus: () => null,
    frame: (L) => ({ min: [-30, L.rowTop[3] - L.T - 20, -100], max: [L.slabs.find((s) => s.id === "L0.out")!.x + 70, L.rowTop[1] + 140, 10], dir: [0.22, 0.14, 1] }),
  },
  {
    id: "unembed",
    chapter: "Output",
    title: STEPS.unembed.title,
    formula: STEPS.unembed.formula,
    body: (ctx) => {
      const T = ctx.tokens.length;
      const show = (t: number) => {
        const p = topPredictionAt(ctx, t);
        return `after ${tokenLabel(ctx, t)} it expects **${showTokenPlain(ctx.tokenizer.tokenString(p.id))}** (${Math.round(p.prob * 100)}%)`;
      };
      const picks = [1, Math.floor(T / 2), T - 1].filter((t, i, a) => t > 0 && a.indexOf(t) === i);
      return [...STEPS.unembed.body, `Reading down the column of predictions: ${picks.map(show).join("; ")}.`];
    },
    focus: () => ["final.rms", "final.gain", "final.normed", "final.op.norm", "step:unembed"],
    frame: (L) => {
      const b = slabBox(L, ["final.rms", "final.normed", "final.gain"], 8);
      return { min: [b.min[0] - 20, b.min[1], b.min[2]], max: [L.output.predictionsX + 40, b.max[1] + 4, b.max[2]], dir: [0.12, 0.1, 1] };
    },
  },
  {
    id: "sample",
    chapter: "Output",
    title: STEPS.sample.title,
    formula: STEPS.sample.formula,
    body: (ctx) => {
      const T = ctx.tokens.length;
      const V = ctx.trace.probs.data.length;
      let best = 0;
      for (let i = 1; i < V; i++) if (ctx.trace.probs.data[i] > ctx.trace.probs.data[best]) best = i;
      return [
        ...STEPS.sample.body,
        `For your prompt the most likely next token is **${showTokenPlain(ctx.tokenizer.tokenString(best))}** at ${(ctx.trace.probs.data[best] * 100).toFixed(1)}% (temperature 1). Press **Generate next token** to sample one and run the model again with ${T + 1} tokens.`,
      ];
    },
    focus: () => ["step:unembed", "step:sample", "final.normed"],
    frame: (L) => {
      const c = L.output.city;
      return { min: [c.x - 10, c.y - 2, c.z - 6], max: [L.output.sampleX + 20, c.y + 50, c.z + c.d], dir: [0.1, 0.75, 0.8] };
    },
  },
  {
    id: "scale",
    chapter: "Finish",
    title: "How big are real LLMs?",
    body: () => [
      "Everything here works the same way in the largest models — they just have wider vectors, more heads, more blocks, bigger vocabularies and longer contexts, trained on trillions of tokens.",
      "Scaled up, the same few operations — **normalise, project, attend, mix, add** — produce models that can write code, translate and reason. See the table below, then try your own prompt.",
      "Large modern models add a few refinements: **grouped-query attention** (several query heads share one set of keys and values to save memory), **mixture-of-experts** MLPs (each token is routed to only a few of many MLPs), much longer contexts, and training on trillions of tokens followed by fine-tuning to follow instructions.",
    ],
    focus: () => null,
    frame: (L) => ({ ...L.bounds, dir: [0.16, 0.12, 1] }),
  },
];

