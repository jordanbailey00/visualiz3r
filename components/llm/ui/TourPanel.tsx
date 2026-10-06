"use client";

import { ChevronLeft, ChevronRight, Compass, Map, X } from "lucide-react";
import { useEffect, useMemo } from "react";
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
      className={`ui-chrome panel absolute z-20 flex flex-col overflow-hidden max-lg:inset-x-3 max-lg:bottom-[150px] max-lg:max-h-[42vh] lg:bottom-[132px] lg:left-4 lg:top-16 lg:w-[370px] ${
        hasSelection ? "max-lg:hidden" : ""
      }`}
    >
      <div className="flex items-center gap-2 px-4 pb-2 pt-3.5">
        <Compass className="size-4 text-violet-300" />
        <h2 className="text-[13px] font-semibold text-ink-50">Guided tour</h2>
        {step !== null && (
          <span className="rounded-full bg-white/5 px-2 text-[11px] tabular-nums text-ink-300">
            {step + 1} / {TOUR.length}
          </span>
        )}
        <button className="btn btn-icon ml-auto !h-7 !w-7" onClick={onClose} aria-label="Hide tour">
          <X className="size-3.5" />
        </button>
      </div>

      <div className="flex flex-wrap gap-1 px-4 pb-3">
        {chapters.map((c) => {
          const active = t?.chapter === c.name;
          return (
            <button
              key={c.name}
              onClick={() => setTour(c.first)}
              className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                active ? "bg-violet-400/20 text-violet-100 ring-1 ring-violet-300/40" : "bg-white/[0.04] text-ink-300 hover:bg-white/[0.08] hover:text-ink-100"
              }`}
            >
              {c.name}
            </button>
          );
        })}
      </div>

      <div className="panel-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {t && ctx ? (
          <div key={t.id}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-300/90">{t.chapter}</p>
            <h1 className="mt-1 text-[20px] font-semibold leading-tight tracking-tight text-white">{t.title}</h1>
            {t.formula && (
              <div className="mt-3 rounded-lg bg-black/30 px-3 py-2 font-mono text-[13px] text-violet-100 ring-1 ring-white/[0.06]">{t.formula}</div>
            )}
            <div className="prose-panel mt-3 text-[13.5px] leading-relaxed text-ink-200">
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
            <h1 className="text-[20px] font-semibold leading-tight tracking-tight text-white">How a language model turns text into the next word</h1>
            <p className="mt-3 text-[13.5px] leading-relaxed text-ink-200">
              A real transformer is running in your browser. Every grid of glowing cells is an actual matrix of numbers from it.
              Take the tour to follow your prompt step by step, or explore freely:
            </p>
            <ul className="mt-3 space-y-1.5 text-[12.5px] text-ink-200">
              <li>• Drag to rotate · right-drag to pan · scroll to zoom</li>
              <li>• Hover a lane to follow one token through the model</li>
              <li>• Click any grid, cell or label to see what it is and how it was computed</li>
            </ul>
            <button className="btn mt-5 w-full !h-10 !bg-violet-500/25 !text-violet-50 ring-1 ring-violet-300/40 hover:!bg-violet-500/35" onClick={() => setTour(0)}>
              <Map className="size-4" /> Start the tour
            </button>
          </div>
        )}
      </div>

      {step !== null && (
        <div className="flex items-center gap-2 border-t border-white/[0.06] px-3 py-2.5">
          <button className="btn !h-8" onClick={() => setTour(i > 0 ? i - 1 : null)} aria-label="Previous step">
            <ChevronLeft className="size-4" /> Back
          </button>
          <div className="flex flex-1 justify-center gap-[3px]">
            {TOUR.map((_, k) => (
              <button
                key={k}
                onClick={() => setTour(k)}
                className={`h-1.5 rounded-full transition-all ${k === i ? "w-4 bg-violet-300" : k < i ? "w-1.5 bg-violet-300/50" : "w-1.5 bg-white/15"}`}
                aria-label={`Step ${k + 1}`}
              />
            ))}
          </div>
          {i < TOUR.length - 1 ? (
            <button className="btn !h-8 !bg-violet-500/25 !text-violet-50 ring-1 ring-violet-300/40" onClick={() => setTour(i + 1)}>
              Next <ChevronRight className="size-4" />
            </button>
          ) : (
            <button className="btn !h-8" onClick={() => setTour(null)}>
              Explore
            </button>
          )}
        </div>
      )}
    </aside>
  );
}

function ComparisonTable() {
  return (
    <div className="mt-4 overflow-x-auto rounded-xl ring-1 ring-white/[0.07]">
      <table className="w-full text-left text-[11.5px]">
        <thead className="bg-white/[0.04] text-ink-300">
          <tr>
            {["Model", "Blocks", "Width", "Heads", "Vocab", "Params"].map((h) => (
              <th key={h} className="px-2.5 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.05]">
          {MODEL_COMPARISON.map((m, k) => (
            <tr key={m.name} className={k === 0 ? "text-violet-100" : "text-ink-200"}>
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
