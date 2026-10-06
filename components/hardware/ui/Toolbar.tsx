"use client";

import { Fan, Focus, Gauge, ListTree, Rotate3d, RotateCcw, ScanEye, Tags } from "lucide-react";
import type { ReactNode } from "react";
import { Lamp } from "@/components/hud/Hud";
import { useExplorer } from "@/lib/hardware/store";

/** Labelled switch with an indicator lamp; on small screens the icon stands in for the label. */
function Switch({ on, onClick, title, icon, label }: { on: boolean; onClick: () => void; title: string; icon: ReactNode; label: string }) {
  return (
    <button className="hud-btn" data-on={on} onClick={onClick} title={title} aria-pressed={on}>
      <Lamp on={on} />
      <span className="md:hidden">{icon}</span>
      <span className="hidden md:inline">{label}</span>
    </button>
  );
}

function Divider() {
  return <div className="mx-1 h-5 w-px shrink-0 bg-hud-line-strong" />;
}

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
      <div className="pointer-events-auto hud-panel flex max-w-full items-center gap-1.5 overflow-x-auto p-1.5 [scrollbar-width:none]">
        <button
          className="hud-btn hud-btn-sq shrink-0"
          data-on={treeOpen}
          onClick={onToggleTree}
          title="Component tree (C)"
          aria-label="Toggle component tree"
          aria-pressed={treeOpen}
        >
          <ListTree className="size-3.5" />
        </button>
        <Divider />
        <div className="flex h-[30px] shrink-0 items-center gap-3 border border-hud-line-strong bg-[rgb(6_8_11/0.74)] px-3">
          <span className="hud-label text-[9.5px] max-sm:hidden">Explode</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={explode}
            onChange={(e) => s.setExplode(Number(e.target.value))}
            className="hud-fader w-20 sm:w-36"
            style={{ ["--slider-pct" as string]: `${explode * 100}%` }}
            aria-label="Exploded view"
          />
          <span className="w-8 text-right font-mono text-[10px] tabular-nums text-hud-dim max-sm:hidden">{String(Math.round(explode * 100)).padStart(3, "0")}</span>
          <button
            className="hud-label w-11 text-left text-[9.5px] !text-hud-accent-text transition-colors hover:!text-white"
            onClick={() => s.setExplode(explode > 0.5 ? 0 : 1)}
            title="Open or close the exploded view (E)"
          >
            {explode > 0.5 ? "Close" : "Open"}
          </button>
        </div>
        <Switch on={xray} onClick={s.toggleXray} title="See through covers (X)" icon={<ScanEye className="size-3.5" />} label="X-ray" />
        <Switch
          on={focusMode}
          onClick={s.toggleFocusMode}
          title="Fade everything except the selected part"
          icon={<Focus className="size-3.5" />}
          label="Focus"
        />
        <Switch on={labels} onClick={s.toggleLabels} title="Show part names (L)" icon={<Tags className="size-3.5" />} label="Labels" />
        <Divider />
        <button
          className="hud-btn hud-btn-sq shrink-0"
          data-on={autoRotate}
          onClick={() => s.setAutoRotate(!autoRotate)}
          title="Auto-rotate"
          aria-label="Auto-rotate"
          aria-pressed={autoRotate}
        >
          <Rotate3d className="size-3.5" />
        </button>
        {hasAnimation && (
          <button
            className="hud-btn hud-btn-sq shrink-0"
            data-on={animate}
            onClick={() => s.setAnimate(!animate)}
            title="Animate moving parts"
            aria-label="Animate moving parts"
            aria-pressed={animate}
          >
            <Fan className="size-3.5" />
          </button>
        )}
        <button
          className="hud-btn hud-btn-sq shrink-0"
          data-on={quality === "high"}
          onClick={() => s.setQuality(quality === "high" ? "low" : "high")}
          title={quality === "high" ? "High quality (shadows + ambient occlusion)" : "Fast mode"}
          aria-label="Toggle render quality"
          aria-pressed={quality === "high"}
        >
          <Gauge className="size-3.5" />
        </button>
        <button className="hud-btn hud-btn-sq shrink-0" onClick={s.resetView} title="Reset view (R)" aria-label="Reset view">
          <RotateCcw className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
