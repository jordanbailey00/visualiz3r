"use client";

import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { BoxGeometry, EdgesGeometry, type LineBasicMaterial, type MeshBasicMaterial } from "three";
import { roundedBox } from "@/components/hardware/kit/geometry";
import type { ModuleSpec, OpSpec } from "@/lib/llm/viz/layout";
import { useLlm } from "@/lib/llm/viz/store";
import { Label } from "./Label";

export const OP_COLOR: Record<OpSpec["kind"], string> = {
  norm: "#fbbf24",
  matmul: "#38bdf8",
  rope: "#c084fc",
  qk: "#f472b6",
  softmax: "#4ade80",
  av: "#a78bfa",
  concat: "#94a3b8",
  add: "#c4b5fd",
  silu: "#fb923c",
  mul: "#fb923c",
  split: "#94a3b8",
};

/** Small labelled badge marking an operation between tensors. */
export function OpBadge({ op }: { op: OpSpec }) {
  const mat = useRef<MeshBasicMaterial>(null);
  const isAdd = op.kind === "add" || op.kind === "mul";
  const w = isAdd ? 2.4 : Math.max(4, op.label.length * 0.62 + 1.6);
  const color = OP_COLOR[op.kind];
  useFrame(() => {
    const s = useLlm.getState();
    const m = mat.current;
    if (!m) return;
    const focused = !s.focus || s.focus.has(op.id) || s.focus.has(`step:${op.step}`) || s.focus.has(`layer:${op.layer}`);
    const hot = (s.hovered?.kind === "op" && s.hovered.id === op.id) || (s.selected?.kind === "op" && s.selected.id === op.id);
    m.opacity = focused ? (hot ? 0.55 : 0.28) : 0.06;
  });
  return (
    <group position={[op.x, op.y, op.z + 0.4]}>
      <mesh
        geometry={roundedBox(w, 2, 0.4, isAdd ? 0.95 : 0.7, 3)}
        onPointerOver={(e) => {
          e.stopPropagation();
          useLlm.getState().hover({ kind: "op", id: op.id });
        }}
        onPointerOut={() => useLlm.getState().hover(null)}
        onClick={(e) => {
          e.stopPropagation();
          if (e.delta > 5) return;
          useLlm.getState().select({ kind: "op", id: op.id });
        }}
      >
        <meshBasicMaterial ref={mat} color={color} transparent opacity={0.28} toneMapped={false} />
      </mesh>
      <Label text={op.label} position={[0, 0.04, 0.3]} size={isAdd ? 1.8 : 0.85} color="#f8fafc" bold fadeFar={360} />
    </group>
  );
}

/** Translucent housing around a sub-layer, with a title. */
export function ModuleBox({ m }: { m: ModuleSpec }) {
  const edgeMat = useRef<LineBasicMaterial>(null);
  const fillMat = useRef<MeshBasicMaterial>(null);
  const size: [number, number, number] = [m.max[0] - m.min[0], m.max[1] - m.min[1], m.max[2] - m.min[2]];
  const center: [number, number, number] = [(m.min[0] + m.max[0]) / 2, (m.min[1] + m.max[1]) / 2, (m.min[2] + m.max[2]) / 2];
  const edges = useMemo(() => new EdgesGeometry(new BoxGeometry(...size)), [size[0], size[1], size[2]]); // eslint-disable-line react-hooks/exhaustive-deps
  const accent = m.id.endsWith("attn") ? "#f472b6" : "#fb923c";
  useFrame(() => {
    const s = useLlm.getState();
    const hot = (s.hovered?.kind === "module" && s.hovered.id === m.id) || (s.selected?.kind === "module" && s.selected.id === m.id);
    const focused = !s.focus || s.focus.has(m.id) || s.focus.has(`layer:${m.layer}`);
    if (edgeMat.current) edgeMat.current.opacity = focused ? (hot ? 0.9 : 0.32) : 0.08;
    if (fillMat.current) fillMat.current.opacity = hot ? 0.035 : 0.0;
  });
  return (
    <group>
      <group position={center}>
        <lineSegments geometry={edges}>
          <lineBasicMaterial ref={edgeMat} color={accent} transparent opacity={0.32} toneMapped={false} />
        </lineSegments>
        <mesh renderOrder={-1}>
          <boxGeometry args={size} />
          <meshBasicMaterial ref={fillMat} color={accent} transparent opacity={0} depthWrite={false} toneMapped={false} />
        </mesh>
      </group>
      <Html position={[m.min[0], m.max[1] + 2, m.max[2]]} zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
        <button
          className="pointer-events-auto -translate-y-full whitespace-nowrap rounded-md px-2 py-0.5 text-left shadow-lg transition-colors max-sm:hidden"
          style={{ background: "rgba(10,12,18,0.82)", borderColor: accent, boxShadow: `0 0 0 1px ${accent}55` }}
          onPointerEnter={() => useLlm.getState().hover({ kind: "module", id: m.id })}
          onPointerLeave={() => useLlm.getState().hover(null)}
          onClick={() => useLlm.getState().select({ kind: "module", id: m.id })}
        >
          <span className="block text-[11px] font-semibold text-white">
            <span className="text-ink-300">Block {m.layer + 1} · </span>
            {m.id.endsWith("attn") ? "Attention" : "MLP"}
          </span>
        </button>
      </Html>
    </group>
  );
}
