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
      <div className="pointer-events-auto hud-panel w-[min(980px,100%)]">
        {/* Token strip */}
        <div className="flex min-h-9 flex-wrap items-center gap-1 border-b border-hud-line px-3 py-1.5">
          <span className="hud-label mr-2 text-[9px] text-hud-faint">
            Tokens <span className="text-hud-dim">{String(tokens.length).padStart(2, "0")}</span>
          </span>
          {tokenizer &&
            tokens.map((id, i) => {
              const color = CHIP_COLORS[i % CHIP_COLORS.length];
              const isNew = lastSampled && i === tokens.length - 1 && lastSampled.id === id;
              return (
                <button
                  key={i}
                  className="px-1.5 py-[1px] font-mono text-[12px] transition-colors"
                  style={{
                    background: lane === i ? `${color}40` : `${color}14`,
                    color: lane === i ? "#fff" : color,
                    borderBottom: `1px solid ${color}${lane === i ? "" : "88"}`,
                    boxShadow: isNew ? `0 0 0 1px ${color}, 0 0 12px -2px ${color}` : undefined,
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

        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
          <form
            className="flex h-[30px] min-w-[220px] flex-1 items-center gap-2 border-b border-hud-line-strong transition-colors focus-within:border-hud-accent/60"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <span className="font-mono text-[13px] text-hud-accent">›</span>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => draft !== prompt && submit()}
              placeholder="Type the start of a story"
              className="hud-field !text-[13px] !tracking-normal"
              aria-label="Prompt"
              maxLength={200}
            />
            <button type="submit" className="text-hud-faint transition-colors hover:text-hud-text" title="Run (Enter)" aria-label="Run">
              <CornerDownLeft className="size-3.5" />
            </button>
          </form>

          <button
            className="hud-btn"
            data-on="true"
            disabled={full}
            onClick={() => {
              useLlm.getState().generateNext();
              triggerSweep(2.2);
            }}
            title={full ? `The demo shows at most ${MAX_TOKENS} tokens` : "Sample the next token and run again"}
          >
            <Sparkles className="size-3.5" /> Generate next token
          </button>
          <button
            className="hud-btn hud-btn-sq"
            data-on={playing}
            disabled={full && !playing}
            onClick={() => setPlaying((p) => !p)}
            title={playing ? "Stop writing" : "Keep generating, one token every 1.5 s"}
            aria-label={playing ? "Stop auto-generate" : "Auto-generate"}
          >
            {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
          </button>
          <button className="hud-btn hud-btn-sq" onClick={() => useLlm.getState().undoLast()} title="Remove the last token" aria-label="Undo">
            <Undo2 className="size-3.5" />
          </button>
          <button className="hud-btn hud-btn-sq" onClick={() => useLlm.getState().setPrompt(DEFAULT_PROMPT)} title="Reset prompt" aria-label="Reset prompt">
            <RotateCcw className="size-3.5" />
          </button>

          <div className="mx-1 h-5 w-px bg-hud-line-strong max-sm:hidden" />

          <label className="flex h-[30px] items-center gap-2.5" title="Temperature: lower = safer, higher = more random">
            <span className="hud-label text-[9px]">Temp</span>
            <input
              type="range"
              min={0.1}
              max={2}
              step={0.05}
              value={temperature}
              onChange={(e) => useLlm.getState().setTemperature(Number(e.target.value))}
              className="hud-fader w-20"
              style={{ ["--slider-pct" as string]: `${((temperature - 0.1) / 1.9) * 100}%` }}
              aria-label="Temperature"
            />
            <span className="w-8 font-mono text-[11px] tabular-nums text-hud-text">{temperature.toFixed(2)}</span>
          </label>
          <label className="flex h-[30px] items-center gap-2" title="Only sample from the k most likely tokens">
            <span className="hud-label text-[9px]">Top-k</span>
            <select
              value={topK}
              onChange={(e) => useLlm.getState().setTopK(Number(e.target.value))}
              className="border-b border-hud-line-strong bg-transparent pb-0.5 font-mono text-[11px] text-hud-text focus:border-hud-accent/60 focus:outline-none"
              aria-label="Top-k"
            >
              {[1, 5, 10, 40, 200, 0].map((k) => (
                <option key={k} value={k} className="bg-[#0a0d12]">
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
