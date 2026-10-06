"use client";

import { ChevronRight, Eye, EyeOff, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { pad } from "@/components/hud/Hud";
import { CATEGORY_META } from "@/lib/hardware/catalog";
import { ancestorsOf, useExplorer } from "@/lib/hardware/store";
import type { DeviceInfo, PartNode } from "@/lib/hardware/types";

/** Component tree: a compact index of every part, summoned from the toolbar. */
export function PartsPanel({
  device,
  open,
  onClose,
}: {
  device: DeviceInfo;
  open: boolean;
  onClose: () => void;
}) {
  const nodes = useExplorer((s) => s.nodes);
  const rootIds = useExplorer((s) => s.rootIds);
  const selectedId = useExplorer((s) => s.selectedId);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  // Always reveal the selected part.
  useEffect(() => {
    if (!selectedId) return;
    const anc = ancestorsOf(nodes, selectedId).slice(1);
    setExpanded((e) => {
      const next = { ...e };
      for (const id of anc) next[id] = true;
      return next;
    });
    requestAnimationFrame(() => {
      listRef.current
        ?.querySelector(`[data-part="${CSS.escape(selectedId)}"]`)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }, [selectedId, nodes]);

  const nameOf = (id: string) => device.parts[id]?.name ?? id;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const keep = new Set<string>();
    for (const id of Object.keys(nodes)) {
      const info = device.parts[id];
      const hay = `${info?.name ?? id} ${info?.summary ?? ""}`.toLowerCase();
      if (hay.includes(q)) for (const a of ancestorsOf(nodes, id)) keep.add(a);
    }
    return keep;
  }, [query, nodes, device]);

  const count = Object.keys(nodes).length;

  return (
    <aside
      className={`ui-chrome hud-panel absolute left-3 top-[64px] z-20 flex max-h-[calc(100%-150px)] w-[min(248px,calc(100vw-24px))] flex-col transition-[opacity,transform] duration-200 sm:left-4 ${
        open ? "translate-x-0 opacity-100" : "pointer-events-none -translate-x-3 opacity-0"
      }`}
      aria-label="Component tree"
      aria-hidden={!open}
      inert={!open}
    >
      <header className="flex items-center gap-2.5 border-b border-hud-line py-2 pl-3 pr-2">
        <span className="hud-label text-hud-text">Components</span>
        <span className="hud-label text-hud-faint">{pad(count, 3)}</span>
        <button className="hud-x ml-auto" onClick={onClose} aria-label="Hide component tree">
          <X className="size-3" />
        </button>
      </header>
      <label className="mx-3 mb-1 mt-2.5 flex items-center gap-2 border-b border-hud-line-strong pb-1.5 transition-colors focus-within:border-hud-accent/60">
        <Search className="size-3 shrink-0 text-hud-faint" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter" className="hud-field" aria-label="Filter components" />
      </label>
      <div ref={listRef} className="hud-scroll min-h-0 flex-1 overflow-y-auto px-1.5 pb-2 pt-1">
        {rootIds.map((id) => (
          <TreeRow
            key={id}
            id={id}
            nodes={nodes}
            device={device}
            expanded={expanded}
            setExpanded={setExpanded}
            matches={matches}
            nameOf={nameOf}
          />
        ))}
        {count === 0 && <p className="hud-label px-3 py-6 text-center text-hud-faint">Loading model</p>}
      </div>
    </aside>
  );
}

function TreeRow({
  id,
  nodes,
  device,
  expanded,
  setExpanded,
  matches,
  nameOf,
}: {
  id: string;
  nodes: Record<string, PartNode>;
  device: DeviceInfo;
  expanded: Record<string, boolean>;
  setExpanded: (fn: (e: Record<string, boolean>) => Record<string, boolean>) => void;
  matches: Set<string> | null;
  nameOf: (id: string) => string;
}) {
  const node = nodes[id];
  const selected = useExplorer((s) => s.selectedId === id);
  const hovered = useExplorer((s) => s.hoveredId === id);
  const hidden = useExplorer((s) => !!s.hidden[id]);
  if (!node || (matches && !matches.has(id))) return null;
  const info = device.parts[id];
  const color = info ? CATEGORY_META[info.category].color : "#64748b";
  const hasChildren = node.children.length > 0;
  const isOpen = matches ? true : !!expanded[id];

  return (
    <div>
      <div
        data-part={id}
        className={`group relative flex h-[26px] cursor-pointer items-center gap-1.5 pl-0.5 pr-1 text-[12px] transition-colors ${
          selected
            ? "bg-hud-accent/[0.09] text-hud-accent-text"
            : hovered
              ? "bg-white/[0.05] text-hud-text"
              : "text-hud-dim hover:bg-white/[0.03] hover:text-hud-text"
        }`}
        onPointerEnter={() => useExplorer.getState().hover(id)}
        onPointerLeave={() => {
          if (useExplorer.getState().hoveredId === id) useExplorer.getState().hover(null);
        }}
        onClick={() => useExplorer.getState().select(id, "focus")}
      >
        {selected && <span className="absolute inset-y-1 left-0 w-[2px] bg-hud-accent shadow-[0_0_8px_rgb(56_189_248/0.9)]" />}
        <button
          className={`grid size-4 shrink-0 place-items-center text-hud-faint hover:text-hud-text ${hasChildren ? "" : "invisible"}`}
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((x) => ({ ...x, [id]: !isOpen }));
          }}
          aria-label={isOpen ? "Collapse" : "Expand"}
          tabIndex={hasChildren ? 0 : -1}
        >
          <ChevronRight className={`size-3 transition-transform ${isOpen ? "rotate-90" : ""}`} />
        </button>
        <span className="h-2.5 w-[2px] shrink-0" style={{ background: color }} />
        <span className={`min-w-0 flex-1 truncate ${hidden ? "line-through opacity-40" : ""}`}>{nameOf(id)}</span>
        {hasChildren && <span className="font-mono text-[9.5px] tabular-nums text-hud-faint">{pad(node.children.length)}</span>}
        <button
          className={`grid size-5 shrink-0 place-items-center text-hud-faint hover:text-hud-text ${
            hidden ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
          onClick={(e) => {
            e.stopPropagation();
            useExplorer.getState().toggleHidden(id);
          }}
          aria-label={hidden ? `Show ${nameOf(id)}` : `Hide ${nameOf(id)}`}
          title={hidden ? "Show" : "Hide"}
        >
          {hidden ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
        </button>
      </div>
      {hasChildren && isOpen && (
        <div className="ml-[10px] border-l border-hud-line pl-1">
          {node.children.map((c) => (
            <TreeRow
              key={c}
              id={c}
              nodes={nodes}
              device={device}
              expanded={expanded}
              setExpanded={setExpanded}
              matches={matches}
              nameOf={nameOf}
            />
          ))}
        </div>
      )}
    </div>
  );
}
