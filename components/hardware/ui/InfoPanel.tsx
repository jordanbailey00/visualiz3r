"use client";

import { EyeOff, X, ZoomIn } from "lucide-react";
import { useState } from "react";
import { KV, Section, pad } from "@/components/hud/Hud";
import { Rich } from "@/components/site/Rich";
import { CATEGORY_META } from "@/lib/hardware/catalog";
import { ancestorsOf, useExplorer } from "@/lib/hardware/store";
import type { DeviceInfo } from "@/lib/hardware/types";

type SectionKey = "detail" | "spec" | "process" | "note" | "contains";

const PANEL =
  "ui-chrome hud-panel hud-reveal absolute z-20 flex flex-col max-md:inset-x-3 max-md:bottom-[76px] max-md:max-h-[46vh] md:right-4 md:top-[64px] md:max-h-[calc(100%-150px)] md:w-[316px]";

/**
 * Readout on the right. It is empty until asked for: clicking a part shows
 * that part; the BRIEF switch shows the unit's overview.
 */
export function InfoPanel({ device, briefOpen, onCloseBrief }: { device: DeviceInfo; briefOpen: boolean; onCloseBrief: () => void }) {
  const selectedId = useExplorer((s) => s.selectedId);
  // Which sections are open carries over from one part to the next.
  const [open, setOpen] = useState<Record<SectionKey, boolean>>({
    detail: true,
    spec: true,
    process: false,
    note: false,
    contains: false,
  });
  const toggle = (k: SectionKey) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const info = selectedId ? device.parts[selectedId] : undefined;

  return (
    <>
      {selectedId ? (
        <aside key={selectedId} className={PANEL} aria-label="Component readout">
          {info ? (
            <PartReadout device={device} id={selectedId} open={open} toggle={toggle} />
          ) : (
            <p className="hud-label p-4 text-hud-faint">No record for “{selectedId}”</p>
          )}
        </aside>
      ) : briefOpen ? (
        <aside className={PANEL} aria-label="Unit brief">
          <UnitBrief device={device} onClose={onCloseBrief} />
        </aside>
      ) : null}
      <span className="sr-only" aria-live="polite">
        {info ? `Selected ${info.name}` : ""}
      </span>
    </>
  );
}

function PartReadout({
  device,
  id,
  open,
  toggle,
}: {
  device: DeviceInfo;
  id: string;
  open: Record<SectionKey, boolean>;
  toggle: (k: SectionKey) => void;
}) {
  const nodes = useExplorer((s) => s.nodes);
  const hidden = useExplorer((s) => !!s.hidden[id]);
  const info = device.parts[id];
  const node = nodes[id];
  const trail = ancestorsOf(nodes, id).slice(1).reverse();
  const cat = CATEGORY_META[info.category];
  const ids = Object.keys(device.parts);
  const { select, focusPart, toggleHidden } = useExplorer.getState();

  return (
    <>
      <header className="flex items-center gap-2 border-b border-hud-line py-2 pl-3.5 pr-2">
        <span className="h-2.5 w-[2px]" style={{ background: cat.color, boxShadow: `0 0 6px ${cat.color}` }} />
        <span className="hud-label" style={{ color: cat.color }}>
          {cat.label}
        </span>
        <span className="hud-label ml-auto text-hud-faint">
          P·{pad(ids.indexOf(id) + 1, 3)}
          <span className="opacity-60">/{pad(ids.length, 3)}</span>
        </span>
        <button className="hud-x" onClick={() => select(null)} aria-label="Close readout">
          <X className="size-3" />
        </button>
      </header>

      <div className="hud-scroll min-h-0 flex-1 overflow-y-auto px-3.5 pb-2">
        <nav className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1" aria-label="Part path">
          {[null, ...trail].map((a, k) => (
            <span key={a ?? "root"} className="flex items-center gap-1.5">
              {k > 0 && <span className="text-[9px] text-hud-faint">/</span>}
              <button
                className="hud-label max-w-[130px] truncate text-[9px] text-hud-faint transition-colors hover:text-hud-text"
                onClick={() => select(a, a ? "focus" : "none")}
              >
                {a ? (device.parts[a]?.name ?? a) : device.shortName}
              </button>
            </span>
          ))}
        </nav>

        <h1 className="mt-2.5 text-[17px] font-medium leading-snug tracking-tight text-hud-text">{info.name}</h1>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-hud-dim">
          <Rich text={info.summary} />
        </p>

        <div className="mt-3.5 flex gap-1.5">
          <button className="hud-btn !h-[26px]" onClick={() => focusPart(id)}>
            <ZoomIn className="size-3" /> Zoom
          </button>
          <button className="hud-btn !h-[26px]" data-on={hidden} onClick={() => toggleHidden(id)}>
            <EyeOff className="size-3" /> {hidden ? "Show" : "Hide"}
          </button>
        </div>

        <div className="hud-rule mb-1 mt-4" />

        <Section title="Detail" open={open.detail} onToggle={() => toggle("detail")}>
          <div className="hud-prose">
            {info.details.map((p, i) => (
              <p key={i}>
                <Rich text={p} />
              </p>
            ))}
          </div>
        </Section>

        {info.specs && info.specs.length > 0 && (
          <Section title="Specification" count={info.specs.length} open={open.spec} onToggle={() => toggle("spec")}>
            <dl>
              {info.specs.map(([k, v]) => (
                <KV key={k} k={k} v={v} />
              ))}
            </dl>
          </Section>
        )}

        {info.howItWorks && info.howItWorks.length > 0 && (
          <Section title="Process" count={info.howItWorks.length} open={open.process} onToggle={() => toggle("process")}>
            <ol className="space-y-2.5">
              {info.howItWorks.map((step, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="mt-[3px] font-mono text-[10px] tabular-nums text-hud-accent-text">{pad(i + 1)}</span>
                  <span className="hud-prose">
                    <Rich text={step} />
                  </span>
                </li>
              ))}
            </ol>
          </Section>
        )}

        {info.didYouKnow && (
          <Section title="Field note" open={open.note} onToggle={() => toggle("note")}>
            <p className="hud-prose border-l-2 border-hud-amber/60 pl-3 !text-[12.5px] !text-amber-50/85">
              <Rich text={info.didYouKnow} />
            </p>
          </Section>
        )}

        {node && node.children.length > 0 && (
          <Section title="Contains" count={node.children.length} open={open.contains} onToggle={() => toggle("contains")}>
            <div className="-ml-1 grid gap-px">
              {node.children.map((c) => {
                const ci = device.parts[c];
                const cc = ci ? CATEGORY_META[ci.category].color : "#64748b";
                return (
                  <button
                    key={c}
                    className="group flex items-start gap-2.5 px-1 py-1.5 text-left transition-colors hover:bg-white/[0.04]"
                    onClick={() => select(c, "focus")}
                    onPointerEnter={() => useExplorer.getState().hover(c)}
                    onPointerLeave={() => useExplorer.getState().hover(null)}
                  >
                    <span className="mt-1 h-2.5 w-[2px] shrink-0" style={{ background: cc }} />
                    <span className="min-w-0">
                      <span className="block text-[12.5px] text-hud-text">{ci?.name ?? c}</span>
                      {ci && <span className="line-clamp-2 block text-[11.5px] leading-snug text-hud-dim">{ci.summary}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </Section>
        )}
      </div>
    </>
  );
}

const CONTROLS: [string, string][] = [
  ["Drag", "Rotate"],
  ["Right-drag", "Pan"],
  ["Scroll", "Zoom"],
  ["Click", "Inspect a part"],
  ["Double-click / F", "Fly to it"],
  ["E", "Explode"],
  ["X", "X-ray"],
  ["L", "Labels"],
  ["R", "Reset view"],
  ["H", "Hide interface"],
];

function UnitBrief({ device, onClose }: { device: DeviceInfo; onClose: () => void }) {
  return (
    <>
      <header className="flex items-center gap-2 border-b border-hud-line py-2 pl-3.5 pr-2">
        <span className="hud-lamp" data-on="true" />
        <span className="hud-label text-hud-text">Unit brief</span>
        <span className="hud-label ml-auto text-hud-faint">{device.shortName}</span>
        <button className="hud-x" onClick={onClose} aria-label="Close brief">
          <X className="size-3" />
        </button>
      </header>
      <div className="hud-scroll min-h-0 flex-1 overflow-y-auto px-3.5 pb-4 pt-3">
        <h1 className="text-[17px] font-medium leading-snug tracking-tight text-hud-text">{device.name}</h1>
        <p className="hud-label mt-1.5 text-[9.5px] normal-case tracking-[0.06em] text-hud-dim">{device.model}</p>
        <div className="hud-prose mt-3">
          {device.intro.map((p, i) => (
            <p key={i}>
              <Rich text={p} />
            </p>
          ))}
        </div>
        <div className="hud-rule mb-2 mt-4" />
        <p className="hud-label py-1.5 text-hud-text">Specification</p>
        <dl>
          {device.specs.map(([k, v]) => (
            <KV key={k} k={k} v={v} />
          ))}
        </dl>
        <p className="hud-label mt-4 py-1.5 text-hud-text">Controls</p>
        <dl>
          {CONTROLS.map(([k, v]) => (
            <KV key={k} k={k} v={<span className="text-hud-dim">{v}</span>} />
          ))}
        </dl>
      </div>
    </>
  );
}
