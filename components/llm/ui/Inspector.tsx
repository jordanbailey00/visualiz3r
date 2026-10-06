"use client";

import { Sigma, X } from "lucide-react";
import { useMemo } from "react";
import { Rich } from "@/components/site/Rich";
import { valueAt } from "@/lib/llm/viz/data";
import {
  OP_INFO,
  STEPS,
  dotTerms,
  headProfile,
  shapeText,
  slabStats,
  slabTitle,
  tokenLabel,
  type Ctx,
} from "@/lib/llm/viz/explain";
import { fmt, pct, showTokenPlain } from "@/lib/llm/viz/format";
import type { SlabSpec } from "@/lib/llm/viz/layout";
import { useLlm, type Target } from "@/lib/llm/viz/store";

const KIND_LABEL: Record<SlabSpec["kind"], string> = {
  activation: "Activations",
  weight: "Learned weights",
  vector: "Learned weights",
  rms: "Per-token scale",
  scores: "Attention scores",
  probs: "Attention weights",
  keysT: "Keys (transposed)",
  values: "Values",
};

export function Inspector() {
  const selected = useLlm((s) => s.selected);
  const model = useLlm((s) => s.model);
  const tokenizer = useLlm((s) => s.tokenizer);
  const trace = useLlm((s) => s.trace);
  const tokens = useLlm((s) => s.tokens);
  const ctx = useMemo<Ctx | null>(() => (model && tokenizer && trace ? { model, tokenizer, trace, tokens } : null), [model, tokenizer, trace, tokens]);
  if (!ctx) return null;
  return (
    <aside
      className={`ui-chrome panel absolute z-20 flex flex-col overflow-hidden max-lg:inset-x-3 max-lg:bottom-[150px] max-lg:max-h-[40vh] lg:bottom-[132px] lg:right-4 lg:top-16 lg:w-[380px] ${
        selected ? "" : "max-lg:hidden"
      }`}
    >
      <div className="panel-scroll min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4">
        {selected ? <TargetDetails target={selected} ctx={ctx} /> : <Predictions ctx={ctx} />}
      </div>
    </aside>
  );
}

function Header({ eyebrow, title, color = "#c4b5fd" }: { eyebrow: string; title: string; color?: string }) {
  return (
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color }}>
          {eyebrow}
        </p>
        <h1 className="mt-1 text-[19px] font-semibold leading-tight tracking-tight text-white">{title}</h1>
      </div>
      <button className="btn btn-icon !h-7 !w-7 shrink-0" onClick={() => useLlm.getState().select(null)} aria-label="Close details">
        <X className="size-3.5" />
      </button>
    </div>
  );
}

function Formula({ text }: { text?: string }) {
  if (!text) return null;
  return <div className="mt-3 rounded-lg bg-black/30 px-3 py-2 font-mono text-[12.5px] text-violet-100 ring-1 ring-white/[0.06]">{text}</div>;
}

function Paragraphs({ items }: { items: string[] }) {
  return (
    <div className="prose-panel mt-3 text-[13px] leading-relaxed text-ink-200">
      {items.map((p, k) => (
        <p key={k}>
          <Rich text={p} />
        </p>
      ))}
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg bg-white/[0.035] px-2.5 py-1.5 ring-1 ring-white/[0.05]">
      <div className="text-[10.5px] uppercase tracking-wider text-ink-400">{k}</div>
      <div className="font-mono text-[12.5px] text-ink-50">{v}</div>
    </div>
  );
}

function TargetDetails({ target, ctx }: { target: Target; ctx: Ctx }) {
  switch (target.kind) {
    case "slab":
      return <SlabDetails id={target.id} cell={target.cell} ctx={ctx} />;
    case "op": {
      const op = useLlm.getState().layout?.ops.find((o) => o.id === target.id);
      if (!op) return null;
      const info = OP_INFO[op.kind];
      const step = STEPS[op.step];
      return (
        <div>
          <Header eyebrow={op.layer < 4 ? `Operation · block ${op.layer + 1}` : "Operation"} title={info.title} />
          <Formula text={step.formula} />
          <Paragraphs items={[info.body, ...step.body]} />
        </div>
      );
    }
    case "module": {
      const m = useLlm.getState().layout?.modules.find((x) => x.id === target.id);
      if (!m) return null;
      const isAttn = m.id.endsWith("attn");
      const items = isAttn
        ? [STEPS.qkv.short, STEPS.rope.short, STEPS.scores.short, STEPS.softmax.short, STEPS["weighted-sum"].short, STEPS["out-proj"].short]
        : [STEPS["mlp-up"].short, STEPS["mlp-act"].short, STEPS["mlp-down"].short];
      return (
        <div>
          <Header eyebrow="Sub-layer" title={m.title} color={isAttn ? "#f472b6" : "#fb923c"} />
          <p className="mt-2 text-[13px] text-ink-300">{m.subtitle}</p>
          <ol className="mt-4 space-y-2">
            {items.map((s, k) => (
              <li key={k} className="flex gap-2.5 text-[13px] leading-relaxed text-ink-200">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-white/[0.07] text-[11px] font-semibold text-ink-100">{k + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
          <Paragraphs items={isAttn ? [STEPS["weighted-sum"].body[1]] : [STEPS["mlp-up"].body[1]]} />
        </div>
      );
    }
    case "token": {
      const id = ctx.tokens[target.index];
      const bytes = Array.from(ctx.tokenizer.tokenBytes(id));
      return (
        <div>
          <Header eyebrow={`Token ${target.index + 1} of ${ctx.tokens.length}`} title={showTokenPlain(ctx.tokenizer.isSpecial(id) ? "" : ctx.tokenizer.tokenString(id))} color="#fde68a" />
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Stat k="Token id" v={`#${id}`} />
            <Stat k="Bytes" v={bytes.length > 6 ? `${bytes.length} bytes` : bytes.map((b) => b.toString(16).padStart(2, "0")).join(" ")} />
          </div>
          {!ctx.tokenizer.isSpecial(id) && <MergeTree ctx={ctx} id={id} />}
          <Paragraphs
            items={[
              ctx.tokenizer.isSpecial(id)
                ? "This special token marks the start of the text. It gives every other token something to attend to and lets the model know a new story begins."
                : `This token's lane is highlighted across the whole model. Its embedding is row ${id} of the embedding table.`,
              STEPS.resid.body[1],
            ]}
          />
        </div>
      );
    }
    case "vocab": {
      const { id, where } = target;
      const probs = useLlm.getState().shownProbs;
      const p = probs?.[id] ?? 0;
      let rank = 1;
      if (probs) for (let i = 0; i < probs.length; i++) if (probs[i] > p) rank++;
      return (
        <div>
          <Header eyebrow={where === "embed" ? "Embedding table row" : "Vocabulary entry"} title={showTokenPlain(ctx.tokenizer.isSpecial(id) ? "" : ctx.tokenizer.tokenString(id))} color="#fde68a" />
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Stat k="Token id" v={`#${id}`} />
            <Stat k="Next-token prob." v={pct(p, 2)} />
            <Stat k="Rank" v={`${rank} of ${ctx.model.config.vocabSize}`} />
            <Stat k="In prompt" v={ctx.tokens.includes(id) ? "yes" : "no"} />
          </div>
          <EmbeddingStrip ctx={ctx} id={id} />
          <Paragraphs items={[where === "embed" ? STEPS.embed.body[0] : STEPS.unembed.body[0]]} />
        </div>
      );
    }
    case "skip":
      if (target.id === "loop")
        return (
          <div>
            <Header eyebrow="Generation" title="The autoregressive loop" color="#4ade80" />
            <Paragraphs items={STEPS.sample.body} />
          </div>
        );
      return (
        <div>
          <Header eyebrow="Residual stream" title={target.id.includes("return") ? "Into the next block" : "Skip connection"} />
          <Formula text={STEPS["attn-add"].formula} />
          <Paragraphs items={target.id.includes("return") ? STEPS.resid.body : STEPS["attn-add"].body} />
        </div>
      );
  }
}

/** How byte-pair encoding assembled this token from bytes, merge by merge. */
function MergeTree({ ctx, id }: { ctx: Ctx; id: number }) {
  const steps: { id: number; parts: [number, number] }[] = [];
  const walk = (t: number) => {
    const p = ctx.tokenizer.mergeParts(t);
    if (!p) return;
    walk(p[0]);
    walk(p[1]);
    steps.push({ id: t, parts: [p[0], p[1]] });
  };
  walk(id);
  const show = (t: number) => showTokenPlain(ctx.tokenizer.tokenString(t));
  if (steps.length === 0)
    return <p className="mt-3 text-[12.5px] text-ink-300">A single byte — one of the 256 base tokens every text can fall back to.</p>;
  return (
    <div className="mt-4">
      <p className="mb-1.5 text-[11px] uppercase tracking-wider text-ink-400">Built by {steps.length} BPE merge{steps.length > 1 ? "s" : ""}</p>
      <ol className="space-y-1">
        {steps.map((s, k) => (
          <li key={k} className="flex items-center gap-1.5 font-mono text-[12px]">
            <span className="w-5 text-right text-ink-500">{k + 1}.</span>
            <span className="rounded bg-white/[0.06] px-1.5 text-ink-200">{show(s.parts[0])}</span>
            <span className="text-ink-500">+</span>
            <span className="rounded bg-white/[0.06] px-1.5 text-ink-200">{show(s.parts[1])}</span>
            <span className="text-ink-500">→</span>
            <span className="rounded bg-amber-300/15 px-1.5 text-amber-100">{show(s.id)}</span>
            <span className="ml-auto text-[10.5px] text-ink-500">merge #{s.id - 255}</span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[11.5px] leading-snug text-ink-400">
        Lower merge numbers were learned first — they are the most frequent pairs in the training stories.
      </p>
    </div>
  );
}

function EmbeddingStrip({ ctx, id }: { ctx: Ctx; id: number }) {
  const C = ctx.model.config.dModel;
  const row = ctx.model.weights.tokEmb.data.subarray(id * C, (id + 1) * C);
  let max = 1e-6;
  for (const v of row) max = Math.max(max, Math.abs(v));
  return (
    <div className="mt-4">
      <p className="mb-1.5 text-[11px] uppercase tracking-wider text-ink-400">Its 64 embedding numbers</p>
      <div className="flex h-10 items-center gap-px">
        {Array.from(row).map((v, k) => (
          <div
            key={k}
            className="flex-1"
            style={{
              height: `${Math.max(4, (Math.abs(v) / max) * 100)}%`,
              background: v >= 0 ? "#f59e0b" : "#3b82f6",
              alignSelf: "center",
              opacity: 0.85,
            }}
            title={`${k}: ${v.toFixed(3)}`}
          />
        ))}
      </div>
    </div>
  );
}

function SlabDetails({ id, cell, ctx }: { id: string; cell?: [number, number]; ctx: Ctx }) {
  const layout = useLlm((s) => s.layout);
  const data = useLlm((s) => s.data);
  const spec = layout?.slabs.find((s) => s.id === id);
  const d = data.get(id);
  const st = useMemo(() => (d ? slabStats(d) : null), [d]);
  if (!spec || !d || !st) return null;
  const step = STEPS[spec.step];

  return (
    <div>
      <Header eyebrow={KIND_LABEL[spec.kind]} title={slabTitle(spec)} />
      <p className="mt-1.5 font-mono text-[12px] text-ink-300">{shapeText(spec)}</p>
      {cell && <CellDetails spec={spec} cell={cell} ctx={ctx} />}
      {spec.head !== undefined && spec.layer < ctx.model.config.nLayers && <HeadSummary ctx={ctx} layer={spec.layer} head={spec.head} />}
      <Formula text={step.formula} />
      <Paragraphs items={[step.short, ...step.body.slice(0, cell ? 1 : 2)]} />
      <div className="mt-4 grid grid-cols-4 gap-2">
        <Stat k="min" v={fmt(st.min, 2)} />
        <Stat k="max" v={fmt(st.max, 2)} />
        <Stat k="mean" v={fmt(st.mean, 2)} />
        <Stat k="std" v={fmt(st.std, 2)} />
      </div>
      {!cell && <p className="mt-3 text-[12px] text-ink-400">Click a single cell to see its value and where it came from.</p>}
    </div>
  );
}

function HeadSummary({ ctx, layer, head }: { ctx: Ctx; layer: number; head: number }) {
  const p = useMemo(() => headProfile(ctx, layer, head), [ctx, layer, head]);
  const bars: [string, number, string][] = [
    ["[start]", p.start, "#94a3b8"],
    ["itself", p.self, "#a78bfa"],
    ["previous token", p.previous, "#f472b6"],
    ["other tokens", p.other, "#4ade80"],
  ];
  return (
    <div className="mt-4 rounded-xl bg-white/[0.035] p-3 ring-1 ring-white/[0.06]">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-300">What head {head + 1} does on this prompt</p>
      <p className="prose-panel mt-1.5 text-[12.5px] leading-relaxed text-ink-200">
        <Rich text={p.summary} />
      </p>
      <div className="mt-2.5 flex h-2 overflow-hidden rounded-full">
        {bars.map(([k, v, c]) => (
          <div key={k} style={{ width: `${v * 100}%`, background: c }} title={`${k}: ${pct(v, 0)}`} />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
        {bars.map(([k, v, c]) => (
          <span key={k} className="flex items-center gap-1 text-[10.5px] text-ink-300">
            <span className="size-1.5 rounded-full" style={{ background: c }} />
            {k} {pct(v, 0)}
          </span>
        ))}
      </div>
    </div>
  );
}

function axisName(spec: SlabSpec, axis: "row" | "col", i: number, ctx: Ctx) {
  const a = axis === "row" ? spec.rowAxis : spec.colAxis;
  if (a === "token") return `token ${i + 1} ${tokenLabel(ctx, i)}`;
  if (a === "channel") return `channel ${i}`;
  if (a === "hidden") return `hidden feature ${i}`;
  if (a === "dhead") return `head dim ${i}`;
  return "";
}

function CellDetails({ spec, cell, ctx }: { spec: SlabSpec; cell: [number, number]; ctx: Ctx }) {
  const data = useLlm((s) => s.data);
  const d = data.get(spec.id)!;
  const [r, c] = cell;
  const v = valueAt(d, r, c);
  const terms = useMemo(() => dotTerms(spec, data, r, c), [spec, data, r, c]);
  const where = [axisName(spec, "row", r, ctx), axisName(spec, "col", c, ctx)].filter(Boolean).join(" · ");

  let note: string | null = null;
  if (spec.kind === "probs") {
    note = Number.isNaN(v)
      ? `Masked: ${tokenLabel(ctx, r)} cannot look ahead at ${tokenLabel(ctx, c)}.`
      : `${tokenLabel(ctx, r)} gives **${pct(v)}** of this head's attention to ${tokenLabel(ctx, c)}.`;
  } else if (spec.kind === "scores") {
    note = Number.isNaN(v) ? `Masked (future token): set to −∞ so softmax gives it exactly 0.` : `Query of ${tokenLabel(ctx, r)} · key of ${tokenLabel(ctx, c)} ÷ 4.`;
  } else if (spec.kind === "rms") {
    note = `Every number in ${tokenLabel(ctx, r)}'s vector is divided by this.`;
  } else if (spec.kind === "weight") {
    note = `How strongly input ${spec.rowAxis === "hidden" ? "feature" : "channel"} ${r} feeds output ${spec.colAxis === "hidden" ? "feature" : "channel"} ${c}.`;
  } else if (spec.kind === "vector") {
    note = `After normalisation, channel ${c} is multiplied by this.`;
  }

  return (
    <div className="mt-4 rounded-xl bg-violet-400/[0.07] p-3 ring-1 ring-violet-300/20">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11.5px] text-violet-200">{where}</span>
        <span className="font-mono text-[18px] font-semibold text-white">{fmt(v)}</span>
      </div>
      {note && (
        <p className="prose-panel mt-1.5 text-[12.5px] leading-relaxed text-ink-200">
          <Rich text={note} />
        </p>
      )}
      {terms && <DotProduct terms={terms} spec={spec} />}
    </div>
  );
}

function DotProduct({ terms, spec }: { terms: NonNullable<ReturnType<typeof dotTerms>>; spec: SlabSpec }) {
  const top = [...terms.terms].sort((a, b) => Math.abs(b.product) - Math.abs(a.product)).slice(0, 8);
  const max = Math.max(1e-9, ...top.map((t) => Math.abs(t.product)));
  const n = terms.terms.length;
  return (
    <div className="mt-3">
      <p className="flex items-center gap-1.5 text-[11.5px] text-ink-300">
        <Sigma className="size-3.5 text-violet-300" />
        Sum of {n} products {spec.id.endsWith(".out") && spec.id.includes(".h") ? "(attention × value)" : spec.kind === "scores" ? "(query × key ÷ 4)" : "(input × weight)"} — largest:
      </p>
      <div className="mt-2 space-y-1">
        {top.map((t) => (
          <div key={t.index} className="flex items-center gap-2 font-mono text-[11px]">
            <span className="w-8 shrink-0 text-right text-ink-400">#{t.index}</span>
            <span className="w-[92px] shrink-0 text-ink-300">
              {t.a.toFixed(2)} × {t.b.toFixed(2)}
            </span>
            <div className="relative h-2.5 flex-1 rounded-sm bg-white/[0.04]">
              <div
                className="absolute top-0 h-full rounded-sm"
                style={{
                  width: `${(Math.abs(t.product) / max) * 50}%`,
                  left: t.product >= 0 ? "50%" : `${50 - (Math.abs(t.product) / max) * 50}%`,
                  background: t.product >= 0 ? "#f59e0b" : "#3b82f6",
                }}
              />
              <div className="absolute left-1/2 top-0 h-full w-px bg-white/20" />
            </div>
            <span className="w-12 shrink-0 text-right text-ink-100">{t.product >= 0 ? "+" : ""}{t.product.toFixed(2)}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-right font-mono text-[11.5px] text-ink-200">
        total of all {n} = <span className="text-white">{terms.sum.toFixed(4)}</span>
      </p>
    </div>
  );
}

function Predictions({ ctx }: { ctx: Ctx }) {
  const predictions = useLlm((s) => s.predictions);
  const temperature = useLlm((s) => s.temperature);
  const topK = useLlm((s) => s.topK);
  const max = predictions[0]?.prob ?? 1;
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-300/90">Next-token prediction</p>
      <h1 className="mt-1 text-[19px] font-semibold leading-tight tracking-tight text-white">What comes next?</h1>
      <p className="mt-2 text-[12.5px] leading-relaxed text-ink-300">
        Probabilities after temperature {temperature.toFixed(2)} and top-{topK}. Click <b className="text-ink-100">Generate</b> to sample one and feed it back in.
      </p>
      <div className="mt-4 space-y-1.5">
        {predictions.slice(0, 10).map((p) => (
          <button
            key={p.id}
            className="group flex w-full items-center gap-2.5 rounded-lg px-2 py-1 text-left hover:bg-white/[0.05]"
            onClick={() => useLlm.getState().select({ kind: "vocab", id: p.id, where: "output" })}
          >
            <span className="w-24 shrink-0 truncate font-mono text-[12.5px] text-ink-50">{showTokenPlain(ctx.tokenizer.tokenString(p.id))}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-lime-300" style={{ width: `${(p.prob / max) * 100}%` }} />
            </div>
            <span className="w-12 shrink-0 text-right font-mono text-[11.5px] text-ink-300">{pct(p.prob)}</span>
          </button>
        ))}
      </div>
      <div className="mt-6 grid grid-cols-2 gap-2">
        <Stat k="Parameters" v={ctx.model.training.paramsTotal.toLocaleString()} />
        <Stat k="Blocks × heads" v={`${ctx.model.config.nLayers} × ${ctx.model.config.nHeads}`} />
        <Stat k="Width" v={`${ctx.model.config.dModel} (MLP ${ctx.model.config.dFF})`} />
        <Stat k="Vocabulary" v={ctx.model.config.vocabSize.toLocaleString()} />
      </div>
      <p className="mt-3 text-[11.5px] leading-relaxed text-ink-400">
        Trained on TinyStories (short children&apos;s stories) — validation loss {ctx.model.training.finalValLoss.toFixed(2)} nats/token.
      </p>
    </div>
  );
}
