"use client";

import { ChevronLeft, ChevronRight, Map, X } from "lucide-react";
import { useEffect, useMemo } from "react";
import { KV, pad } from "@/components/hud/Hud";
import { Rich } from "@/components/site/Rich";
import { MODEL_COMPARISON, type Ctx } from "@/lib/llm/viz/explain";
import { useLlm } from "@/lib/llm/viz/store";
import { TOUR } from "@/lib/llm/viz/tour";
import { RopeFigure, SiluFigure, TemperatureFigure } from "./Figures";

/** Applies a tour step: camera framing and focus dimming. */
export function useTourEffects() {
  const step = useLlm((s) => s.tourStep);
  const layout = useLlm((s) => s.layout);
  useEffect(() => {
    const s = useLlm.getState();
    if (step === null || !layout) {
      s.setFocus(null);
      return;
    }
    const t = TOUR[step];
    const f = t.focus(layout);
    s.setFocus(f);
    const box = t.frame(layout);
    s.frame(box.min, box.max, box.dir);
    // Re-frame only when the step changes, not on every new token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);
  // Keep focus ids valid when the layout changes (e.g. after generating a token).
  useEffect(() => {
    const s = useLlm.getState();
    if (s.tourStep !== null && layout) s.setFocus(TOUR[s.tourStep].focus(layout));
  }, [layout]);
}

export function TourPanel({ onClose }: { onClose: () => void }) {
  const step = useLlm((s) => s.tourStep);
  const model = useLlm((s) => s.model);
  const tokenizer = useLlm((s) => s.tokenizer);
  const trace = useLlm((s) => s.trace);
  const tokens = useLlm((s) => s.tokens);
  const setTour = useLlm((s) => s.setTour);
  const hasSelection = useLlm((s) => s.selected !== null);

  const ctx = useMemo<Ctx | null>(
    () => (model && tokenizer && trace ? { model, tokenizer, trace, tokens } : null),
    [model, tokenizer, trace, tokens],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const cur = useLlm.getState().tourStep;
      if (e.key === "ArrowRight") setTour(Math.min(TOUR.length - 1, (cur ?? -1) + 1));
      else if (e.key === "ArrowLeft" && cur !== null) setTour(Math.max(0, cur - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setTour]);

  const i = step ?? -1;
  const t = step !== null ? TOUR[step] : null;
  const chapters = useMemo(() => {
    const out: { name: string; first: number }[] = [];
    TOUR.forEach((s, k) => {
      if (!out.length || out[out.length - 1].name !== s.chapter) out.push({ name: s.chapter, first: k });
    });
    return out;
  }, []);

  return (
    <aside
      className={`ui-chrome hud-panel hud-reveal absolute z-20 flex flex-col max-lg:inset-x-3 max-lg:bottom-[150px] max-lg:max-h-[42vh] lg:left-4 lg:top-[64px] lg:max-h-[calc(100%-214px)] lg:w-[336px] ${
        hasSelection ? "max-lg:hidden" : ""
      }`}
      aria-label="Guided tour"
    >
      <header className="flex items-center gap-2 border-b border-hud-line py-2 pl-3.5 pr-2">
        <span className="hud-lamp" data-on={step !== null ? "true" : undefined} />
        <span className="hud-label text-hud-text">Guided tour</span>
        {step !== null && (
          <span className="hud-label tabular-nums text-hud-faint">
            {pad(step + 1)}/{pad(TOUR.length)}
          </span>
        )}
        <button className="hud-x ml-auto" onClick={onClose} aria-label="Hide tour">
          <X className="size-3" />
        </button>
      </header>

      <nav className="flex flex-wrap gap-x-3 gap-y-1.5 border-b border-hud-line px-3.5 py-2.5" aria-label="Tour chapters">
        {chapters.map((c) => {
          const active = t?.chapter === c.name;
          return (
            <button
              key={c.name}
              onClick={() => setTour(c.first)}
              className={`hud-label text-[9px] transition-colors ${active ? "text-hud-accent-text" : "text-hud-faint hover:text-hud-text"}`}
            >
              {c.name}
            </button>
          );
        })}
      </nav>

      <div className="hud-scroll min-h-0 flex-1 overflow-y-auto px-3.5 pb-4 pt-3.5">
        {t && ctx ? (
          <div key={t.id}>
            <p className="hud-label text-hud-accent-text">{t.chapter}</p>
            <h1 className="mt-1.5 text-[17px] font-medium leading-snug tracking-tight text-hud-text">{t.title}</h1>
            {t.formula && <div className="hud-formula mt-3">{t.formula}</div>}
            <div className="hud-prose mt-3">
              {t.body(ctx).map((p, k) => (
                <p key={k}>
                  <Rich text={p} />
                </p>
              ))}
            </div>
            {t.id === "rope" && <RopeFigure positions={ctx.tokens.length} />}
            {t.id === "mlp" && <SiluFigure />}
            {t.id === "sample" && <TemperatureFigure ctx={ctx} />}
            {t.id === "scale" && <ComparisonTable />}
          </div>
        ) : (
          <div>
            <h1 className="text-[17px] font-medium leading-snug tracking-tight text-hud-text">How a language model turns text into the next word</h1>
            <p className="hud-prose mt-3">
              A real transformer is running in your browser. Every grid of glowing cells is an actual matrix of numbers from it.
              Take the tour to follow your prompt step by step, or explore freely:
            </p>
            <dl className="mt-3">
              <KV k="Drag · right-drag" v={<span className="text-hud-dim">Rotate · pan</span>} />
              <KV k="Scroll" v={<span className="text-hud-dim">Zoom</span>} />
              <KV k="Hover a lane" v={<span className="text-hud-dim">Follow one token</span>} />
              <KV k="Click" v={<span className="text-hud-dim">What it is · how it was computed</span>} />
            </dl>
            <button className="hud-btn mt-5 w-full !h-9" data-on="true" onClick={() => setTour(0)}>
              <Map className="size-3.5" /> Start the tour
            </button>
          </div>
        )}
      </div>

      {step !== null && (
        <footer className="flex items-center gap-2.5 border-t border-hud-line px-3 py-2.5">
          <button className="hud-btn hud-btn-sq" onClick={() => setTour(i > 0 ? i - 1 : null)} aria-label="Previous step" title="Previous (←)">
            <ChevronLeft className="size-3.5" />
          </button>
          <div className="flex h-[7px] flex-1 gap-[2px]">
            {TOUR.map((_, k) => (
              <button
                key={k}
                onClick={() => setTour(k)}
                className={`flex-1 transition-colors ${
                  k === i ? "bg-hud-accent shadow-[0_0_8px_rgb(56_189_248/0.9)]" : k < i ? "bg-hud-accent/35 hover:bg-hud-accent/60" : "bg-white/10 hover:bg-white/25"
                }`}
                aria-label={`Step ${k + 1}`}
              />
            ))}
          </div>
          {i < TOUR.length - 1 ? (
            <button className="hud-btn" data-on="true" onClick={() => setTour(i + 1)} title="Next (→)">
              Next <ChevronRight className="size-3.5" />
            </button>
          ) : (
            <button className="hud-btn" onClick={() => setTour(null)}>
              Explore
            </button>
          )}
        </footer>
      )}
    </aside>
  );
}

function ComparisonTable() {
  return (
    <div className="mt-4 overflow-x-auto border border-hud-line">
      <table className="w-full text-left text-[11.5px]">
        <thead className="hud-label bg-white/[0.03] text-[9px]">
          <tr>
            {["Model", "Blocks", "Width", "Heads", "Vocab", "Params"].map((h) => (
              <th key={h} className="px-2.5 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-hud-line">
          {MODEL_COMPARISON.map((m, k) => (
            <tr key={m.name} className={k === 0 ? "text-hud-accent-text" : "text-hud-dim"}>
              <td className="px-2.5 py-1.5 font-medium">{m.name}</td>
              <td className="px-2.5 py-1.5 tabular-nums">{m.layers}</td>
              <td className="px-2.5 py-1.5 tabular-nums">{m.width}</td>
              <td className="px-2.5 py-1.5 tabular-nums">{m.heads}</td>
              <td className="px-2.5 py-1.5 tabular-nums">{m.vocab}</td>
              <td className="px-2.5 py-1.5 tabular-nums">{m.params}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
