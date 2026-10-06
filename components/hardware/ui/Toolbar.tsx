"use client";

import { Fan, Focus, Gauge, ListTree, Rotate3d, RotateCcw, ScanEye, Tags } from "lucide-react";
import { useExplorer } from "@/lib/hardware/store";

export function Toolbar({
  treeOpen,
  onToggleTree,
  hasAnimation,
}: {
  treeOpen: boolean;
  onToggleTree: () => void;
  hasAnimation: boolean;
}) {
  const explode = useExplorer((s) => s.explode);
  const xray = useExplorer((s) => s.xray);
  const focusMode = useExplorer((s) => s.focusMode);
  const autoRotate = useExplorer((s) => s.autoRotate);
  const animate = useExplorer((s) => s.animate);
  const quality = useExplorer((s) => s.quality);
  const labels = useExplorer((s) => s.labels);
  const s = useExplorer.getState();

  return (
    <div className="ui-chrome pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-3">
      <div className="pointer-events-auto panel flex max-w-full items-center gap-1.5 overflow-x-auto p-1.5">
        <button
          className="btn btn-icon"
          data-active={treeOpen}
          onClick={onToggleTree}
          title="Component tree"
          aria-label="Toggle component tree"
        >
          <ListTree className="size-4" />
        </button>
        <div className="mx-1 h-6 w-px bg-white/10" />
        <label className="flex h-[34px] items-center gap-3 rounded-[9px] bg-white/[0.04] px-3 ring-1 ring-white/[0.06]">
          <span className="text-[12px] font-medium text-ink-200">Explode</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={explode}
            onChange={(e) => s.setExplode(Number(e.target.value))}
            className="slider w-28 sm:w-40"
            style={{ ["--slider-pct" as string]: `${explode * 100}%` }}
            aria-label="Exploded view"
          />
          <button
            className="text-[11px] font-semibold uppercase tracking-wider text-sky-300 hover:text-sky-100"
            onClick={() => s.setExplode(explode > 0.5 ? 0 : 1)}
          >
            {explode > 0.5 ? "Close" : "Open"}
          </button>
        </label>
        <button className="btn" data-active={xray} onClick={s.toggleXray} title="See through covers (X)">
          <ScanEye className="size-4" /> <span className="hidden md:inline">X-ray</span>
        </button>
        <button
          className="btn"
          data-active={focusMode}
          onClick={s.toggleFocusMode}
          title="Fade everything except the selected part"
        >
          <Focus className="size-4" /> <span className="hidden md:inline">Focus</span>
        </button>
        <button className="btn" data-active={labels} onClick={s.toggleLabels} title="Show part names (L)">
          <Tags className="size-4" /> <span className="hidden md:inline">Labels</span>
        </button>
        <div className="mx-1 h-6 w-px bg-white/10" />
        <button
          className="btn btn-icon"
          data-active={autoRotate}
          onClick={() => s.setAutoRotate(!autoRotate)}
          title="Auto-rotate"
          aria-label="Auto-rotate"
        >
          <Rotate3d className="size-4" />
        </button>
        {hasAnimation && (
          <button
            className="btn btn-icon"
            data-active={animate}
            onClick={() => s.setAnimate(!animate)}
            title="Animate moving parts"
            aria-label="Animate moving parts"
          >
            <Fan className="size-4" />
          </button>
        )}
        <button
          className="btn btn-icon"
          data-active={quality === "high"}
          onClick={() => s.setQuality(quality === "high" ? "low" : "high")}
          title={quality === "high" ? "High quality (shadows + ambient occlusion)" : "Fast mode"}
          aria-label="Toggle render quality"
        >
          <Gauge className="size-4" />
        </button>
        <button className="btn btn-icon" onClick={s.resetView} title="Reset view (R)" aria-label="Reset view">
          <RotateCcw className="size-4" />
        </button>
      </div>
    </div>
  );
}
