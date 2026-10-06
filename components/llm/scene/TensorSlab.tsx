"use client";

import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Color, type Mesh, type ShaderMaterial } from "three";
import { colorize } from "@/lib/llm/viz/colormap";
import { robustScale, type SlabData } from "@/lib/llm/viz/data";
import type { SlabSpec } from "@/lib/llm/viz/layout";
import { matmulOperands } from "@/lib/llm/viz/explain";
import { useLlm } from "@/lib/llm/viz/store";
import { slabPulse } from "./pulse";
import { makeCellTexture, makeSlabMaterial } from "./slabMaterial";
import { Label } from "./Label";

const KIND_ACCENT: Record<SlabSpec["kind"], string> = {
  activation: "#a78bfa",
  weight: "#38bdf8",
  vector: "#38bdf8",
  rms: "#fbbf24",
  scores: "#f472b6",
  probs: "#4ade80",
  keysT: "#a78bfa",
  values: "#a78bfa",
};

/** Dark frame behind a slab, glowing when selected. */
const FRAME_DEPTH = 0.5;

export function TensorSlab({ spec, data }: { spec: SlabSpec; data: SlabData }) {
  const mesh = useRef<Mesh>(null);
  const frame = useRef<Mesh>(null);
  const material = useMemo(() => makeSlabMaterial(), []);
  const { rows, cols } = data;

  const texture = useMemo(() => {
    const mode = spec.kind === "probs" ? "sequential" : "diverging";
    const scale = mode === "sequential" ? 1 : robustScale(data.values, spec.kind === "weight" ? 0.99 : 0.985);
    return makeCellTexture(colorize(data.values, rows, cols, mode, scale), cols, rows);
  }, [data, rows, cols, spec.kind]);

  useEffect(() => {
    material.uniforms.map.value = texture;
    material.uniforms.dims.value.set(cols, rows);
    material.uniforms.accent.value = new Color(KIND_ACCENT[spec.kind]);
    material.uniforms.gain.value = spec.kind === "weight" || spec.kind === "vector" ? 0.95 : 1.2;
    return () => texture.dispose();
  }, [texture, material, cols, rows, spec.kind]);

  useEffect(() => () => material.dispose(), [material]);

  // Per-frame uniform updates (hover, lane highlight, focus dimming, pulses)
  // avoid re-rendering hundreds of slabs through React.
  const dimRef = useRef(0);
  useFrame((_, dt) => {
    const s = useLlm.getState();
    const u = material.uniforms;
    const h = s.hovered;
    if (h?.kind === "slab" && h.id === spec.id && h.cell) u.hoverCell.value.set(h.cell[1], h.cell[0]);
    else {
      const sel = s.selected;
      if (sel?.kind === "slab" && sel.id === spec.id && sel.cell) u.hoverCell.value.set(sel.cell[1], sel.cell[0]);
      else u.hoverCell.value.set(-10, -10);
    }
    // Light up the input row and weight column behind a selected output cell.
    let selRow = -1;
    let selCol = -1;
    const sel = s.selected;
    if (sel?.kind === "slab" && sel.cell) {
      const ops = matmulOperands(sel.id);
      if (ops?.left === spec.id) selRow = sel.cell[0];
      if (ops?.right === spec.id) selCol = sel.cell[1];
    }
    u.selRow.value = selRow;
    u.selCol.value = selCol;
    const lane = s.laneHighlight;
    u.laneRow.value = lane !== null && spec.rowAxis === "token" ? lane : -1;
    u.laneCol.value = lane !== null && spec.colAxis === "token" ? lane : -1;
    const focused = !s.focus || s.focus.has(spec.id) || s.focus.has(`step:${spec.step}`) || s.focus.has(`layer:${spec.layer}`);
    const target = focused ? 0 : 1;
    dimRef.current += (target - dimRef.current) * (1 - Math.exp(-dt * 6));
    u.dimAmt.value = dimRef.current;
    u.pulse.value = slabPulse(spec.id);
    if (frame.current) {
      const selected = s.selected?.kind === "slab" && s.selected.id === spec.id;
      const hovered = h?.kind === "slab" && h.id === spec.id;
      const m = frame.current.material as ShaderMaterial & { color: Color; opacity: number };
      m.opacity = selected ? 0.95 : hovered ? 0.6 : 0.35 * (1 - dimRef.current * 0.7);
      m.color.set(selected ? "#c4b5fd" : hovered ? "#8b93a7" : "#2a3142");
    }
  });

  const cellAt = (e: ThreeEvent<PointerEvent | MouseEvent>): [number, number] | null => {
    const uv = e.uv;
    if (!uv) return null;
    const c = Math.min(cols - 1, Math.max(0, Math.floor(uv.x * cols)));
    const r = Math.min(rows - 1, Math.max(0, Math.floor((1 - uv.y) * rows)));
    return [r, c];
  };

  const w = cols * spec.cellW;
  const h = rows * spec.cellH;
  const cx = spec.x + w / 2;
  const cy = spec.y - h / 2;
  const labelBelow = spec.kind === "activation" || spec.kind === "scores" || spec.kind === "probs" || spec.kind === "rms";

  return (
    <group position={[cx, cy, spec.z]}>
      <mesh
        ref={mesh}
        material={material}
        onPointerMove={(e) => {
          e.stopPropagation();
          const cell = cellAt(e);
          if (cell) useLlm.getState().hover({ kind: "slab", id: spec.id, cell });
          if (cell && spec.rowAxis === "token") useLlm.getState().setLane(cell[0]);
          else if (cell && spec.colAxis === "token") useLlm.getState().setLane(cell[1]);
        }}
        onPointerOut={() => {
          const s = useLlm.getState();
          if (s.hovered?.kind === "slab" && s.hovered.id === spec.id) s.hover(null);
          s.setLane(null);
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (e.delta > 5) return;
          const cell = cellAt(e);
          useLlm.getState().select({ kind: "slab", id: spec.id, cell: cell ?? undefined });
        }}
      >
        <planeGeometry args={[w, h]} />
      </mesh>
      <mesh ref={frame} position-z={-FRAME_DEPTH / 2 - 0.02}>
        <boxGeometry args={[w + 0.8, h + 0.8, FRAME_DEPTH]} />
        <meshBasicMaterial color="#2a3142" transparent opacity={0.35} toneMapped={false} />
      </mesh>
      {spec.cols > 1 && (
        <Label
          text={spec.label}
          position={[-w / 2, labelBelow ? -h / 2 - 1.2 : h / 2 + 1.2, 0.05]}
          anchorX="left"
          anchorY={labelBelow ? "top" : "bottom"}
          size={spec.head !== undefined || spec.kind === "keysT" || spec.kind === "values" ? 0.95 : Math.min(2.4, Math.max(1.2, Math.min(w, 64) / 17))}
          color={KIND_ACCENT[spec.kind]}
          fadeFar={Math.min(w, 64) * 9 + 180}
        />
      )}
    </group>
  );
}
