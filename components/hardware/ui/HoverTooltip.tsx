"use client";

import { useEffect, useRef } from "react";
import { CATEGORY_META } from "@/lib/hardware/catalog";
import { useExplorer } from "@/lib/hardware/store";
import type { DeviceInfo } from "@/lib/hardware/types";

/** Small label that follows the pointer while a part is hovered in 3D. */
export function HoverTooltip({ device, container }: { device: DeviceInfo; container: React.RefObject<HTMLElement | null> }) {
  const ref = useRef<HTMLDivElement>(null);
  const hoveredId = useExplorer((s) => s.hoveredId);
  const selectedId = useExplorer((s) => s.selectedId);
  const pointerInCanvas = useRef(false);

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const move = (e: PointerEvent) => {
      const t = ref.current;
      if (!t) return;
      pointerInCanvas.current = (e.target as HTMLElement)?.tagName === "CANVAS";
      t.style.transform = `translate(${e.clientX + 16}px, ${e.clientY + 18}px)`;
      t.style.opacity = pointerInCanvas.current ? "1" : "0";
    };
    el.addEventListener("pointermove", move);
    return () => el.removeEventListener("pointermove", move);
  }, [container]);

  const info = hoveredId ? device.parts[hoveredId] : undefined;
  const show = !!info && hoveredId !== selectedId;
  const cat = info ? CATEGORY_META[info.category] : undefined;

  return (
    <div
      ref={ref}
      className="pointer-events-none fixed left-0 top-0 z-40 transition-opacity duration-100"
      style={{ visibility: show ? "visible" : "hidden" }}
    >
      {info && cat && (
        <div className="hud-tip">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-[2px] shrink-0" style={{ background: cat.color }} />
            <span className="text-[12px] font-medium text-hud-text">{info.name}</span>
          </div>
          <p className="mt-1 line-clamp-2 pl-[10px] text-[11px] leading-snug text-hud-dim">{info.summary}</p>
        </div>
      )}
    </div>
  );
}
