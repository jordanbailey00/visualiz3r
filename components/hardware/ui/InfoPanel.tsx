"use client";

import { ChevronRight, EyeOff, Focus, Lightbulb, MousePointerClick, Move3d, X, ZoomIn } from "lucide-react";
import { Rich } from "@/components/site/Rich";
import { CATEGORY_META } from "@/lib/hardware/catalog";
import { ancestorsOf, useExplorer } from "@/lib/hardware/store";
import type { DeviceInfo } from "@/lib/hardware/types";

export function InfoPanel({ device }: { device: DeviceInfo }) {
  const selectedId = useExplorer((s) => s.selectedId);
  const info = selectedId ? device.parts[selectedId] : undefined;

  return (
    <aside
      className={`ui-chrome panel absolute z-20 flex flex-col overflow-hidden max-md:inset-x-3 max-md:bottom-[84px] max-md:max-h-[44vh] md:bottom-24 md:right-4 md:top-16 md:w-[min(380px,calc(100vw-24px))] ${
        selectedId ? "" : "max-md:hidden"
      }`}
      aria-label="Component details"
    >
      {selectedId ? (
        <PartDetails device={device} id={selectedId} />
      ) : (
        <DeviceOverview device={device} />
      )}
      {selectedId && !info && (
        <p className="px-5 pb-5 text-[13px] text-ink-400">No description for “{selectedId}”.</p>
      )}
      <span className="sr-only" aria-live="polite">
        {info ? `Selected ${info.name}` : ""}
      </span>
    </aside>
  );
}

function DeviceOverview({ device }: { device: DeviceInfo }) {
  return (
    <div className="panel-scroll flex-1 overflow-y-auto px-5 pb-6 pt-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-300/90">{device.shortName}</p>
      <h1 className="mt-1 text-[22px] font-semibold leading-tight tracking-tight text-white">{device.name}</h1>
      <p className="mt-1 text-[13px] text-ink-300">{device.model}</p>
      <div className="prose-panel mt-4 text-[13.5px] leading-relaxed text-ink-200">
        {device.intro.map((p, i) => (
          <p key={i}>
            <Rich text={p} />
          </p>
        ))}
      </div>
      <SpecTable rows={device.specs} />
      <div className="mt-6 rounded-xl bg-white/[0.035] p-3.5 ring-1 ring-white/[0.06]">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-300">How to explore</p>
        <ul className="space-y-1.5 text-[12.5px] text-ink-200">
          <li className="flex gap-2">
            <Move3d className="mt-0.5 size-3.5 shrink-0 text-sky-300" /> Drag to rotate · right-drag to pan · scroll to zoom
          </li>
          <li className="flex gap-2">
            <MousePointerClick className="mt-0.5 size-3.5 shrink-0 text-sky-300" /> Click a part to learn about it, double-click to fly to it
          </li>
          <li className="flex gap-2">
            <Focus className="mt-0.5 size-3.5 shrink-0 text-sky-300" /> Use <b className="font-semibold text-ink-50">Explode</b> to pull the layers apart
          </li>
        </ul>
      </div>
    </div>
  );
}

function PartDetails({ device, id }: { device: DeviceInfo; id: string }) {
  const nodes = useExplorer((s) => s.nodes);
  const info = device.parts[id];
  const node = nodes[id];
  const trail = ancestorsOf(nodes, id).slice(1).reverse();
  if (!info) return null;
  const cat = CATEGORY_META[info.category];
  const { select, focusPart, toggleHidden } = useExplorer.getState();

  return (
    <div className="panel-scroll flex-1 overflow-y-auto px-5 pb-6 pt-4">
      <div className="flex items-start gap-2">
        <nav className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1 gap-y-0.5 text-[11.5px] text-ink-400" aria-label="Part path">
          <button className="hover:text-ink-100" onClick={() => select(null)}>
            {device.shortName}
          </button>
          {trail.map((a) => (
            <span key={a} className="flex items-center gap-1">
              <ChevronRight className="size-3" />
              <button className="max-w-[150px] truncate hover:text-ink-100" onClick={() => select(a, "focus")}>
                {device.parts[a]?.name ?? a}
              </button>
            </span>
          ))}
        </nav>
        <button className="btn btn-icon !h-7 !w-7 shrink-0" onClick={() => select(null)} aria-label="Close details">
          <X className="size-3.5" />
        </button>
      </div>

      <span className="chip mt-3" style={{ background: `${cat.color}1f`, color: cat.color }}>
        <span className="size-1.5 rounded-full" style={{ background: cat.color }} />
        {cat.label}
      </span>
      <h1 className="mt-2 text-[21px] font-semibold leading-tight tracking-tight text-white">{info.name}</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-100">
        <Rich text={info.summary} />
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn !h-8 !text-[12px]" onClick={() => focusPart(id)}>
          <ZoomIn className="size-3.5" /> Zoom to part
        </button>
        <button className="btn !h-8 !text-[12px]" onClick={() => toggleHidden(id)}>
          <EyeOff className="size-3.5" /> Hide
        </button>
      </div>

      <div className="prose-panel mt-4 text-[13.5px] leading-relaxed text-ink-200">
        {info.details.map((p, i) => (
          <p key={i}>
            <Rich text={p} />
          </p>
        ))}
      </div>

      {info.specs && info.specs.length > 0 && <SpecTable rows={info.specs} />}

      {info.howItWorks && info.howItWorks.length > 0 && (
        <section className="mt-5">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-300">How it works</h3>
          <ol className="space-y-2">
            {info.howItWorks.map((step, i) => (
              <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-ink-200">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-sky-400/15 text-[11px] font-semibold text-sky-200">
                  {i + 1}
                </span>
                <span className="prose-panel">
                  <Rich text={step} />
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {info.didYouKnow && (
        <aside className="mt-5 flex gap-2.5 rounded-xl bg-amber-300/[0.07] p-3.5 ring-1 ring-amber-300/15">
          <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber-300" />
          <p className="prose-panel text-[12.5px] leading-relaxed text-amber-50/90">
            <Rich text={info.didYouKnow} />
          </p>
        </aside>
      )}

      {node && node.children.length > 0 && (
        <section className="mt-5">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-300">
            Inside ({node.children.length})
          </h3>
          <div className="grid gap-1">
            {node.children.map((c) => {
              const ci = device.parts[c];
              const cc = ci ? CATEGORY_META[ci.category].color : "#64748b";
              return (
                <button
                  key={c}
                  className="group flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-white/[0.05]"
                  onClick={() => select(c, "focus")}
                  onPointerEnter={() => useExplorer.getState().hover(c)}
                  onPointerLeave={() => useExplorer.getState().hover(null)}
                >
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full" style={{ background: cc }} />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-ink-50">{ci?.name ?? c}</span>
                    {ci && <span className="line-clamp-2 block text-[12px] leading-snug text-ink-300">{ci.summary}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function SpecTable({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="mt-5 divide-y divide-white/[0.06] overflow-hidden rounded-xl bg-white/[0.03] ring-1 ring-white/[0.06]">
      {rows.map(([k, v]) => (
        <div key={k} className="flex gap-3 px-3.5 py-2 text-[12.5px]">
          <dt className="w-[42%] shrink-0 text-ink-300">{k}</dt>
          <dd className="min-w-0 flex-1 font-medium text-ink-50">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
