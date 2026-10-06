"use client";

import { Compass, Cpu, Maximize } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PresentationMode } from "@/components/site/PresentationMode";
import { SectionLink, TopNav } from "@/components/site/TopNav";
import type { VizLayout } from "@/lib/llm/viz/layout";
import { useLlm } from "@/lib/llm/viz/store";
import { slabBox } from "@/lib/llm/viz/tour";
import LlmCanvas from "./scene/LlmCanvas";
import { HoverInfo } from "./ui/HoverInfo";
import { Inspector } from "./ui/Inspector";
import { PromptBar } from "./ui/PromptBar";
import { TourPanel, useTourEffects } from "./ui/TourPanel";

type Region = { label: string; box: (L: VizLayout) => { min: [number, number, number]; max: [number, number, number] }; dir: [number, number, number] };

const REGIONS: Region[] = [
  { label: "Overview", box: (L) => L.bounds, dir: [0.16, 0.12, 1] },
  {
    label: "Input",
    box: (L) => ({ min: [L.embed.mosaic.x - 6, -L.T - 8, -2], max: [70, L.embed.mosaic.y + 38, 2] }),
    dir: [0.12, 0.08, 1],
  },
  ...[0, 1, 2, 3].map(
    (l): Region => ({
      label: `Block ${l + 1}`,
      box: (L) => {
        const b = slabBox(L, L.slabs.filter((s) => s.layer === l).map((s) => s.id), 10);
        return { min: [b.min[0], b.min[1] - 10, b.min[2]], max: [b.max[0], b.max[1] + 16, b.max[2]] };
      },
      dir: [0.22, 0.14, 1],
    }),
  ),
  {
    label: "Output",
    box: (L) => {
      const c = L.output.city;
      const f = slabBox(L, ["final.normed"]);
      return { min: [f.min[0], c.y - 4, -4], max: [L.output.sampleX + 22, L.rowTop[3] + 40, c.z + c.d] };
    },
    dir: [0.15, 0.35, 1],
  },
];

export default function LlmExplorer() {
  const container = useRef<HTMLDivElement>(null);
  const status = useLlm((s) => s.status);
  const error = useLlm((s) => s.error);
  const [tourOpen, setTourOpen] = useState(true);
  useTourEffects();

  useEffect(() => {
    useLlm.getState().init();
    if (window.innerWidth < 900) setTourOpen(false);
    if (process.env.NODE_ENV !== "production") (window as unknown as { __llm: typeof useLlm }).__llm = useLlm;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") useLlm.getState().select(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (r: Region) => {
    const s = useLlm.getState();
    if (!s.layout) return;
    s.setTour(null);
    const b = r.box(s.layout);
    s.frame(b.min, b.max, r.dir);
  };

  return (
    <div ref={container} className="fixed inset-0 overflow-hidden bg-[#05060a]">
      <div className="absolute inset-0">{status === "ready" && <LlmCanvas />}</div>
      <PresentationMode />
      <TopNav
        center={
          <nav className="panel flex h-10 items-center gap-0.5 overflow-x-auto p-1" aria-label="Model sections">
            {REGIONS.map((r) => (
              <button
                key={r.label}
                onClick={() => go(r)}
                className="flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[12.5px] font-medium text-ink-300 transition-colors hover:bg-white/5 hover:text-ink-50"
              >
                {r.label === "Overview" && <Maximize className="size-3.5" />}
                {r.label}
              </button>
            ))}
          </nav>
        }
        right={
          <>
            {!tourOpen && (
              <button className="panel flex h-10 items-center gap-2 px-3.5 text-[13px] font-medium text-violet-200 hover:text-white" onClick={() => setTourOpen(true)}>
                <Compass className="size-4" /> Tour
              </button>
            )}
            <SectionLink href="/hardware">
              <Cpu className="size-4" />
              <span className="hidden lg:inline">Hardware</span>
            </SectionLink>
          </>
        }
      />
      {status === "ready" && (
        <>
          {tourOpen && <TourPanel onClose={() => setTourOpen(false)} />}
          <Inspector />
          <PromptBar />
          <HoverInfo container={container} />
        </>
      )}
      {(status === "loading" || status === "idle") && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="flex flex-col items-center gap-4">
            <div className="size-9 animate-spin rounded-full border-2 border-white/10 border-t-violet-400" />
            <p className="text-[13px] text-ink-300">Loading the model (1.6 MB of weights)…</p>
          </div>
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 grid place-items-center text-[13px] text-red-300">Could not load the model: {error}</div>
      )}
    </div>
  );
}
