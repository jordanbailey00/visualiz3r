"use client";

import { BrainCircuit } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PresentationMode } from "@/components/site/PresentationMode";
import { SectionLink, TopNav } from "@/components/site/TopNav";
import { CATALOG } from "@/lib/hardware/catalog";
import { useExplorer } from "@/lib/hardware/store";
import type { DeviceInfo } from "@/lib/hardware/types";
import HardwareCanvas from "./HardwareCanvas";
import { DEVICE_MODELS } from "./models/registry";
import { HoverTooltip } from "./ui/HoverTooltip";
import { InfoPanel } from "./ui/InfoPanel";
import { PartsPanel } from "./ui/PartsPanel";
import { Toolbar } from "./ui/Toolbar";

export default function HardwareExplorer({ device }: { device: DeviceInfo }) {
  const container = useRef<HTMLDivElement>(null);
  const [treeOpen, setTreeOpen] = useState(true);
  const entry = DEVICE_MODELS[device.id];
  const ready = useExplorer((s) => s.deviceId === device.id);

  useEffect(() => {
    useExplorer.getState().setDevice(device.id);
    if (window.innerWidth < 900) setTreeOpen(false);
    // Handle for automated visual checks (scripts/screenshot.mjs --eval).
    if (process.env.NODE_ENV !== "production") (window as unknown as { __explorer: typeof useExplorer }).__explorer = useExplorer;
  }, [device.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const s = useExplorer.getState();
      if (e.key === "Escape") s.select(null);
      else if (e.key === "r" || e.key === "R") s.resetView();
      else if (e.key === "x" || e.key === "X") s.toggleXray();
      else if (e.key === "e" || e.key === "E") s.setExplode(s.explode > 0.5 ? 0 : 1);
      else if (e.key === "l" || e.key === "L") s.toggleLabels();
      else if ((e.key === "f" || e.key === "F") && s.selectedId) s.focusPart(s.selectedId);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div ref={container} className="fixed inset-0 overflow-hidden bg-ink-950">
      <div className="absolute inset-0">
        {ready && <HardwareCanvas device={device} Model={entry.Model} />}
      </div>

      <PresentationMode />
      <TopNav
        center={
          <nav className="panel flex h-10 items-center gap-0.5 overflow-x-auto p-1" aria-label="Devices">
            {CATALOG.map((d) => (
              <Link
                key={d.id}
                href={`/hardware/${d.id}`}
                className={`flex h-8 items-center rounded-lg px-3 text-[12.5px] font-medium whitespace-nowrap transition-colors ${
                  d.id === device.id
                    ? "bg-sky-400/15 text-white ring-1 ring-sky-400/40"
                    : "text-ink-300 hover:bg-white/5 hover:text-ink-50"
                }`}
                aria-current={d.id === device.id ? "page" : undefined}
              >
                {d.shortName}
              </Link>
            ))}
          </nav>
        }
        right={
          <SectionLink href="/llm" accent="llm">
            <BrainCircuit className="size-4" />
            <span className="hidden lg:inline">How LLMs work</span>
          </SectionLink>
        }
      />

      <PartsPanel device={device} open={treeOpen} onClose={() => setTreeOpen(false)} />
      <InfoPanel device={device} />
      <Toolbar treeOpen={treeOpen} onToggleTree={() => setTreeOpen((o) => !o)} hasAnimation={entry.animated} />
      <HoverTooltip device={device} container={container} />
    </div>
  );
}
