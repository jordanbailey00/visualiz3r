"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ControlHint, ExitLink, HudBar, Lamp } from "@/components/hud/Hud";
import { HudLoader } from "@/components/site/LoadingScreen";
import { PresentationMode } from "@/components/site/PresentationMode";
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
  const tourStep = useLlm((s) => s.tourStep);
  // The tour is summoned from the top-right switch; its lamp blinks until then.
  const [tourOpen, setTourOpen] = useState(false);
  const [tourSeen, setTourSeen] = useState(false);
  const [region, setRegion] = useState<string | null>("Overview");
  const [engaged, setEngaged] = useState(false);
  const selected = useLlm((s) => s.selected);
  const config = useLlm((s) => s.model?.config);
  useTourEffects();

  useEffect(() => {
    useLlm.getState().init();
    if (process.env.NODE_ENV !== "production") (window as unknown as { __llm: typeof useLlm }).__llm = useLlm;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") useLlm.getState().select(null);
      else if (e.key === "t" || e.key === "T") {
        setTourOpen((o) => !o);
        setTourSeen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (tourStep !== null) setRegion(null);
  }, [tourStep]);
  useEffect(() => {
    if (selected) setEngaged(true);
  }, [selected]);

  const go = (r: Region) => {
    const s = useLlm.getState();
    if (!s.layout) return;
    s.setTour(null);
    const b = r.box(s.layout);
    s.frame(b.min, b.max, r.dir);
    setRegion(r.label);
  };

  // Room taken by panels: the readout (324 px) is always there, the tour (336 px) on demand.
  const insets = useMemo(() => ({ left: tourOpen ? 368 : 0, right: 356 }), [tourOpen]);

  const openTour = () => {
    setTourOpen((o) => !o);
    setTourSeen(true);
  };

  return (
    <div ref={container} className="fixed inset-0 overflow-hidden bg-[#05060a]">
      <div className="absolute inset-0">{status === "ready" && <LlmCanvas insets={insets} />}</div>
      <PresentationMode />
      <HudBar
        exit={<ExitLink href="/" label="Home" />}
        center={
          <nav className="hud-selector" aria-label="Model sections">
            {REGIONS.map((r) => (
              <button key={r.label} onClick={() => go(r)} className="hud-sel" data-on={region === r.label}>
                {r.label}
              </button>
            ))}
          </nav>
        }
        caption={
          config
            ? `${config.nLayers} blocks · ${config.nHeads} heads · width ${config.dModel} · ${config.vocabSize.toLocaleString()}-token vocabulary`
            : undefined
        }
        right={
          <button className="hud-btn" data-on={tourOpen} onClick={openTour} title="Guided tour (T)" aria-pressed={tourOpen}>
            <Lamp on={tourOpen} blink={!tourOpen && !tourSeen} /> Tour
          </button>
        }
      />
      {status === "ready" && (
        <>
          {tourOpen && <TourPanel onClose={() => setTourOpen(false)} />}
          <Inspector />
          <PromptBar />
          {!engaged && !tourOpen && (
            <ControlHint
              className="bottom-[150px]"
              items={[
                ["Drag", "rotate"],
                ["Scroll", "zoom"],
                ["Hover a lane", "follow a token"],
                ["Click", "inspect"],
                ["T", "guided tour"],
              ]}
            />
          )}
          <HoverInfo container={container} />
        </>
      )}
      {(status === "loading" || status === "idle") && (
        <div className="absolute inset-0 grid place-items-center">
          <HudLoader label="Loading model · 1.6 MB of weights" />
        </div>
      )}
      {status === "error" && (
        <div className="hud-label absolute inset-0 grid place-items-center text-red-300">Could not load the model: {error}</div>
      )}
    </div>
  );
}
