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
        <div className="panel max-w-[260px] px-3 py-2">
          <div className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full" style={{ background: cat.color }} />
            <span className="text-[12.5px] font-semibold text-white">{info.name}</span>
          </div>
          <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-ink-300">{info.summary}</p>
        </div>
      )}
    </div>
  );
}
