"use client";

import { ChevronDown, ChevronRight, Eye, EyeOff, ListTree, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CATEGORY_META } from "@/lib/hardware/catalog";
import { ancestorsOf, useExplorer } from "@/lib/hardware/store";
import type { DeviceInfo, PartNode } from "@/lib/hardware/types";

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

  // Expand top level by default, and always reveal the selected part.
  useEffect(() => {
    setExpanded((e) => {
      const next = { ...e };
      for (const id of rootIds) if (next[id] === undefined) next[id] = true;
      return next;
    });
  }, [rootIds]);
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
      className={`ui-chrome panel absolute bottom-24 left-3 top-16 z-20 flex w-[280px] flex-col overflow-hidden transition-[opacity,transform] duration-200 sm:left-4 ${
        open ? "translate-x-0 opacity-100" : "pointer-events-none -translate-x-4 opacity-0"
      }`}
      aria-label="Component tree"
    >
      <div className="flex items-center gap-2 px-4 pb-2 pt-3.5">
        <ListTree className="size-4 text-sky-300" />
        <h2 className="text-[13px] font-semibold text-ink-50">Components</h2>
        <span className="rounded-full bg-white/5 px-1.5 text-[11px] text-ink-300">{count}</span>
        <button className="btn btn-icon ml-auto !h-7 !w-7" onClick={onClose} aria-label="Hide component tree">
          <X className="size-3.5" />
        </button>
      </div>
      <label className="mx-3 mb-2 flex h-8 items-center gap-2 rounded-lg bg-white/[0.04] px-2.5 ring-1 ring-white/[0.06] focus-within:ring-sky-400/50">
        <Search className="size-3.5 text-ink-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a component…"
          className="w-full bg-transparent text-[13px] text-ink-100 placeholder:text-ink-400 focus:outline-none"
        />
      </label>
      <div ref={listRef} className="panel-scroll min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
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
        {count === 0 && <p className="px-3 py-6 text-center text-[12px] text-ink-400">Loading model…</p>}
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
        className={`group relative flex h-8 cursor-pointer items-center gap-1.5 rounded-lg pr-1.5 text-[13px] transition-colors ${
          selected
            ? "bg-sky-400/15 text-white ring-1 ring-sky-400/40"
            : hovered
              ? "bg-white/[0.06] text-ink-50"
              : "text-ink-200 hover:bg-white/[0.04]"
        }`}
        style={{ paddingLeft: 6 + node.depth * 14 }}
        onPointerEnter={() => useExplorer.getState().hover(id)}
        onPointerLeave={() => {
          if (useExplorer.getState().hoveredId === id) useExplorer.getState().hover(null);
        }}
        onClick={() => useExplorer.getState().select(id, "focus")}
      >
        <button
          className={`grid size-5 shrink-0 place-items-center rounded text-ink-400 hover:text-ink-100 ${hasChildren ? "" : "invisible"}`}
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((x) => ({ ...x, [id]: !isOpen }));
          }}
          aria-label={isOpen ? "Collapse" : "Expand"}
          tabIndex={hasChildren ? 0 : -1}
        >
          {isOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </button>
        <span className="size-1.5 shrink-0 rounded-full" style={{ background: color }} />
        <span className={`min-w-0 flex-1 truncate ${hidden ? "opacity-40" : ""}`}>{nameOf(id)}</span>
        {hasChildren && (
          <span className="text-[10.5px] tabular-nums text-ink-400">{node.children.length}</span>
        )}
        <button
          className={`grid size-6 shrink-0 place-items-center rounded-md text-ink-400 hover:bg-white/10 hover:text-ink-100 ${
            hidden ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
          onClick={(e) => {
            e.stopPropagation();
            useExplorer.getState().toggleHidden(id);
          }}
          aria-label={hidden ? `Show ${nameOf(id)}` : `Hide ${nameOf(id)}`}
          title={hidden ? "Show" : "Hide"}
        >
          {hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
        </button>
      </div>
      {hasChildren && isOpen && (
        <div>
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
