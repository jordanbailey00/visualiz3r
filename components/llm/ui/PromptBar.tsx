"use client";

import { CornerDownLeft, Pause, Play, RotateCcw, Sparkles, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { showTokenPlain } from "@/lib/llm/viz/format";
import { DEFAULT_PROMPT, MAX_TOKENS, useLlm } from "@/lib/llm/viz/store";
import { triggerSweep } from "../scene/pulse";

const CHIP_COLORS = ["#a78bfa", "#38bdf8", "#f472b6", "#fbbf24", "#4ade80", "#fb923c"];

export function PromptBar() {
  const prompt = useLlm((s) => s.prompt);
  const tokens = useLlm((s) => s.tokens);
  const tokenizer = useLlm((s) => s.tokenizer);
  const temperature = useLlm((s) => s.temperature);
  const topK = useLlm((s) => s.topK);
  const lane = useLlm((s) => s.laneHighlight);
  const lastSampled = useLlm((s) => s.lastSampled);
  const [draft, setDraft] = useState(prompt);
  const [playing, setPlaying] = useState(false);

  useEffect(() => setDraft(prompt), [prompt]);

  // Auto-generate: write the story one token at a time.
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const s = useLlm.getState();
      if (s.tokens.length >= MAX_TOKENS || !s.generateNext()) {
        setPlaying(false);
        return;
      }
      triggerSweep(1.2);
    }, 1500);
    return () => window.clearInterval(id);
  }, [playing]);

  const submit = () => {
    if (draft.trim() === "") return;
    useLlm.getState().setPrompt(draft);
  };
  const full = tokens.length >= MAX_TOKENS;

  return (
    <div className="ui-chrome pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-3">
      <div className="pointer-events-auto panel w-[min(980px,100%)] px-3 pb-3 pt-2.5">
        {/* Token chips */}
        <div className="flex min-h-7 flex-wrap items-center gap-1 pb-2">
          <span className="mr-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-400">{tokens.length} tokens</span>
          {tokenizer &&
            tokens.map((id, i) => {
              const color = CHIP_COLORS[i % CHIP_COLORS.length];
              const isNew = lastSampled && i === tokens.length - 1 && lastSampled.id === id;
              return (
                <button
                  key={i}
                  className="rounded-md px-1.5 py-0.5 font-mono text-[12px] transition-colors"
                  style={{
                    background: lane === i ? `${color}55` : `${color}1f`,
                    color: lane === i ? "#fff" : color,
                    boxShadow: isNew ? `0 0 0 1px ${color}` : undefined,
                  }}
                  onPointerEnter={() => useLlm.getState().setLane(i)}
                  onPointerLeave={() => useLlm.getState().setLane(null)}
                  onClick={() => useLlm.getState().select({ kind: "token", index: i })}
                  title={`token #${id}`}
                >
                  {showTokenPlain(tokenizer.isSpecial(id) ? "" : tokenizer.tokenString(id))}
                </button>
              );
            })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <form
            className="flex h-10 min-w-[240px] flex-1 items-center gap-2 rounded-xl bg-black/30 px-3 ring-1 ring-white/[0.08] focus-within:ring-violet-300/50"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => draft !== prompt && submit()}
              placeholder="Type the start of a story…"
              className="w-full bg-transparent text-[14px] text-ink-50 placeholder:text-ink-400 focus:outline-none"
              aria-label="Prompt"
              maxLength={200}
            />
            <button type="submit" className="text-ink-400 hover:text-ink-100" title="Run (Enter)" aria-label="Run">
              <CornerDownLeft className="size-4" />
            </button>
          </form>

          <button
            className="btn !h-10 !bg-emerald-500/20 !px-4 !text-emerald-50 ring-1 ring-emerald-300/40 hover:!bg-emerald-500/30 disabled:opacity-40"
            disabled={full}
            onClick={() => {
              useLlm.getState().generateNext();
              triggerSweep(2.2);
            }}
            title={full ? `The demo shows at most ${MAX_TOKENS} tokens` : "Sample the next token and run again"}
          >
            <Sparkles className="size-4" /> Generate next token
          </button>
          <button
            className="btn btn-icon !h-10 !w-10"
            data-active={playing}
            disabled={full && !playing}
            onClick={() => setPlaying((p) => !p)}
            title={playing ? "Stop writing" : "Keep generating, one token every 1.5 s"}
            aria-label={playing ? "Stop auto-generate" : "Auto-generate"}
          >
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </button>
          <button className="btn btn-icon !h-10 !w-10" onClick={() => useLlm.getState().undoLast()} title="Remove the last token" aria-label="Undo">
            <Undo2 className="size-4" />
          </button>
          <button className="btn btn-icon !h-10 !w-10" onClick={() => useLlm.getState().setPrompt(DEFAULT_PROMPT)} title="Reset prompt" aria-label="Reset prompt">
            <RotateCcw className="size-4" />
          </button>

          <label className="flex h-10 items-center gap-2 rounded-xl bg-white/[0.04] px-3 ring-1 ring-white/[0.06]" title="Temperature: lower = safer, higher = more random">
            <span className="text-[11.5px] text-ink-300">Temp</span>
            <input
              type="range"
              min={0.1}
              max={2}
              step={0.05}
              value={temperature}
              onChange={(e) => useLlm.getState().setTemperature(Number(e.target.value))}
              className="slider w-20"
              style={{ ["--slider-pct" as string]: `${((temperature - 0.1) / 1.9) * 100}%`, ["--slider-fill" as string]: "#a78bfa" }}
              aria-label="Temperature"
            />
            <span className="w-8 font-mono text-[11.5px] text-ink-100">{temperature.toFixed(2)}</span>
          </label>
          <label className="flex h-10 items-center gap-2 rounded-xl bg-white/[0.04] px-3 ring-1 ring-white/[0.06]" title="Only sample from the k most likely tokens">
            <span className="text-[11.5px] text-ink-300">Top-k</span>
            <select
              value={topK}
              onChange={(e) => useLlm.getState().setTopK(Number(e.target.value))}
              className="bg-transparent font-mono text-[12px] text-ink-100 focus:outline-none"
              aria-label="Top-k"
            >
              {[1, 5, 10, 40, 200, 0].map((k) => (
                <option key={k} value={k} className="bg-ink-900">
                  {k === 0 ? "all" : k}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </div>
  );
}
