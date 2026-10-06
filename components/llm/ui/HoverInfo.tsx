"use client";

import { useEffect, useRef } from "react";
import { valueAt } from "@/lib/llm/viz/data";
import { OP_INFO, slabTitle } from "@/lib/llm/viz/explain";
import { fmt, pct, showTokenPlain } from "@/lib/llm/viz/format";
import { useLlm } from "@/lib/llm/viz/store";

/** Tooltip that follows the pointer over the 3D scene. */
export function HoverInfo({ container }: { container: React.RefObject<HTMLElement | null> }) {
  const ref = useRef<HTMLDivElement>(null);
  const hovered = useLlm((s) => s.hovered);
  const layout = useLlm((s) => s.layout);
  const data = useLlm((s) => s.data);
  const tokenizer = useLlm((s) => s.tokenizer);
  const tokens = useLlm((s) => s.tokens);
  const probs = useLlm((s) => s.shownProbs);

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const move = (e: PointerEvent) => {
      const t = ref.current;
      if (!t) return;
      const onCanvas = (e.target as HTMLElement)?.tagName === "CANVAS";
      t.style.transform = `translate(${e.clientX + 16}px, ${e.clientY + 18}px)`;
      t.style.opacity = onCanvas ? "1" : "0";
    };
    el.addEventListener("pointermove", move);
    return () => el.removeEventListener("pointermove", move);
  }, [container]);

  let title = "";
  let sub = "";
  if (hovered && layout && tokenizer) {
    const tok = (i: number) => (tokens[i] === undefined ? "" : showTokenPlain(tokenizer.isSpecial(tokens[i]) ? "" : tokenizer.tokenString(tokens[i])));
    if (hovered.kind === "slab") {
      const spec = layout.slabs.find((s) => s.id === hovered.id);
      const d = data.get(hovered.id);
      if (spec && d) {
        title = slabTitle(spec);
        if (hovered.cell) {
          const [r, c] = hovered.cell;
          const v = valueAt(d, r, c);
          const rowName = spec.rowAxis === "token" ? `“${tok(r)}”` : spec.rowAxis === "one" ? "" : `row ${r}`;
          const colName = spec.colAxis === "token" ? `→ “${tok(c)}”` : spec.colAxis === "one" ? "" : `col ${c}`;
          sub = `${[rowName, colName].filter(Boolean).join("  ")}  =  ${spec.kind === "probs" && Number.isFinite(v) ? pct(v) : fmt(v)}`;
        }
      }
    } else if (hovered.kind === "op") {
      const op = layout.ops.find((o) => o.id === hovered.id);
      if (op) {
        title = OP_INFO[op.kind].title;
        sub = OP_INFO[op.kind].body;
      }
    } else if (hovered.kind === "module") {
      const m = layout.modules.find((x) => x.id === hovered.id);
      if (m) {
        title = m.title;
        sub = m.subtitle;
      }
    } else if (hovered.kind === "token") {
      title = `Token ${hovered.index + 1}: “${tok(hovered.index)}”`;
      sub = `id #${tokens[hovered.index]}`;
    } else if (hovered.kind === "vocab") {
      title = `“${showTokenPlain(tokenizer.isSpecial(hovered.id) ? "" : tokenizer.tokenString(hovered.id))}”  #${hovered.id}`;
      sub = hovered.where === "output" && probs ? `next-token probability ${pct(probs[hovered.id], 2)}` : "row of the embedding table";
    } else if (hovered.kind === "skip" && hovered.id === "loop") {
      title = "Autoregressive loop";
      sub = "the sampled token is appended and the model runs again";
    } else if (hovered.kind === "skip") {
      title = hovered.id.includes("return") ? "Residual stream → next block" : "Residual (skip) connection";
      sub = "carries the vectors around the sub-layer, then adds";
    }
  }

  return (
    <div ref={ref} className="pointer-events-none fixed left-0 top-0 z-40 transition-opacity duration-75" style={{ visibility: title ? "visible" : "hidden" }}>
      <div className="hud-tip !max-w-[300px]">
        <div className="text-[12px] font-medium text-hud-text">{title}</div>
        {sub && <div className="mt-1 font-mono text-[11px] leading-snug text-hud-dim">{sub}</div>}
      </div>
    </div>
  );
}
