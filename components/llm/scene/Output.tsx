"use client";

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
  type MeshBasicMaterial,
} from "three";
import { roundedBox } from "@/components/hardware/kit/geometry";
import type { ForwardTrace, LoadedModel } from "@/lib/llm/model";
import type { BpeTokenizer } from "@/lib/llm/tokenizer";
import { sequential } from "@/lib/llm/viz/colormap";
import type { VizLayout } from "@/lib/llm/viz/layout";
import { useLlm } from "@/lib/llm/viz/store";
import { Label } from "./Label";
import { showToken, useMosaicTexture } from "./Vocab";

const MAX_BAR = 46;
export const barHeight = (p: number) => 0.25 + MAX_BAR * Math.sqrt(p);

/** Top-1 prediction (temperature 1) at every position. */
function perPositionTop(trace: ForwardTrace) {
  const [T, V] = trace.logits.shape;
  const out: { id: number; prob: number }[] = [];
  for (let t = 0; t < T; t++) {
    const row = trace.logits.data.subarray(t * V, (t + 1) * V);
    let best = 0;
    let max = -Infinity;
    for (let i = 0; i < V; i++) if (row[i] > max) ((max = row[i]), (best = i));
    let sum = 0;
    for (let i = 0; i < V; i++) sum += Math.exp(row[i] - max);
    out.push({ id: best, prob: 1 / sum });
  }
  return out;
}

const dummy = new Object3D();
const barGeo = (() => {
  const g = new BoxGeometry(1, 1, 1);
  g.translate(0, 0.5, 0);
  return g;
})();

export function Output({
  layout,
  model,
  tokenizer,
  trace,
  probs,
}: {
  layout: VizLayout;
  model: LoadedModel;
  tokenizer: BpeTokenizer;
  trace: ForwardTrace;
  probs: Float32Array;
}) {
  const T = layout.T;
  const top = layout.rowTop[layout.rowTop.length - 1];
  const px = layout.output.predictionsX;
  const city = layout.output.city;
  const tex = useMosaicTexture(model, city.cols);
  const bars = useRef<InstancedMesh>(null);
  const beamMat = useRef<MeshBasicMaterial>(null);
  const V = model.config.vocabSize;

  const preds = useMemo(() => perPositionTop(trace), [trace]);
  const ranked = useMemo(() => Array.from(probs.keys()).sort((a, b) => probs[b] - probs[a]).slice(0, 8), [probs]);

  const barMat = useMemo(() => new MeshStandardMaterial({ roughness: 0.35, metalness: 0.1, toneMapped: false }), []);

  useLayoutEffect(() => {
    const m = bars.current;
    if (!m) return;
    const c = new Color();
    for (let k = 0; k < V; k++) {
      const col = k % city.cols;
      const row = Math.floor(k / city.cols);
      const p = probs[k];
      dummy.position.set(city.x + col * city.tile + city.tile / 2, city.y, city.z + row * city.tile + city.tile / 2);
      dummy.scale.set(city.tile * 0.78, barHeight(p), city.tile * 0.78);
      dummy.updateMatrix();
      m.setMatrixAt(k, dummy.matrix);
      // Low bars stay dim teal; likely tokens glow green-yellow.
      const t = Math.min(1, Math.sqrt(p) * 1.6);
      const [r, g, b] = sequential(t);
      c.setRGB(r * 0.85, g, b * 0.8);
      if (p > 0.01) c.multiplyScalar(1 + t * 1.4);
      m.setColorAt(k, c);
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
    m.computeBoundingBox();
  }, [probs, city, V]);

  // Beam from the last token's final vector into the vocabulary.
  const beam = useMemo(() => {
    const g = new BufferGeometry();
    const y0 = top - T + 0.5;
    const x0 = px - 12;
    const pos: number[] = [];
    for (let i = 0; i <= 8; i++) {
      const fx = city.x + (city.w * i) / 8;
      pos.push(x0, y0, 0, fx, city.y + 0.2, city.z);
      pos.push(x0, y0, 0, fx, city.y + 0.2, city.z + city.d);
    }
    g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
    return g;
  }, [top, T, px, city]);

  useFrame(() => {
    const s = useLlm.getState();
    const focused = !s.focus || s.focus.has("step:unembed") || s.focus.has("step:sample");
    if (beamMat.current) beamMat.current.opacity = focused ? 0.18 : 0.03;
  });

  const best = ranked[0];
  return (
    <group>
      {/* Per-position predictions */}
      <Label text="Prediction at each position" position={[px, top + 3, 0]} size={2.2} color="#4ade80" anchorX="left" anchorY="bottom" fadeFar={420} />
      {preds.map((p, t) => (
        <Label
          key={t}
          text={`— ${showToken(tokenizer.tokenString(p.id))}  ${(p.prob * 100).toFixed(0)}%`}
          position={[px, top - t - 0.5, 0.2]}
          size={0.72}
          color={t === T - 1 ? "#bbf7d0" : "#94a3b8"}
          anchorX="left"
          mono
          fadeFar={320}
        />
      ))}

      {/* Vocabulary skyline: one bar per token, height ∝ √probability */}
      <group>
        <mesh position={[city.x + city.w / 2, city.y - 0.05, city.z + city.d / 2]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[city.w, city.d]} />
          <meshBasicMaterial map={tex} toneMapped={false} color="#6b7280" />
        </mesh>
        <instancedMesh
          ref={bars}
          args={[barGeo, barMat, V]}
          onPointerMove={(e) => {
            e.stopPropagation();
            if (e.instanceId !== undefined) useLlm.getState().hover({ kind: "vocab", id: e.instanceId, where: "output" });
          }}
          onPointerOut={() => useLlm.getState().hover(null)}
          onClick={(e) => {
            e.stopPropagation();
            if (e.delta > 5 || e.instanceId === undefined) return;
            useLlm.getState().select({ kind: "vocab", id: e.instanceId, where: "output" });
          }}
        />
        {ranked.map((id, i) => {
          const col = id % city.cols;
          const row = Math.floor(id / city.cols);
          const x = city.x + col * city.tile + city.tile / 2;
          const z = city.z + row * city.tile + city.tile / 2;
          const h = barHeight(probs[id]);
          return (
            <Label
              key={id}
              text={`${showToken(tokenizer.tokenString(id))} ${(probs[id] * 100).toFixed(1)}%`}
              position={[x, city.y + h + 1.6 + (i % 2) * 1.8, z]}
              size={i === 0 ? 3.4 : i < 3 ? 2.4 : 1.7}
              color={i === 0 ? "#f0fdf4" : "#bbf7d0"}
              bold={i === 0}
            />
          );
        })}
        <Label
          text="Next-token probabilities over the whole vocabulary"
          position={[city.x, city.y + 1, city.z + city.d + 3]}
          size={3}
          color="#4ade80"
          anchorX="left"
          rotation={[-Math.PI / 2, 0, 0]}
        />
      </group>

      <lineSegments geometry={beam}>
        <lineBasicMaterial ref={beamMat} color="#4ade80" transparent opacity={0.18} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </lineSegments>

      {/* The chosen next token */}
      <group position={[layout.output.sampleX, top + 8, 10]}>
        <mesh geometry={roundedBox(30, 9, 1.4, 1.2)}>
          <meshStandardMaterial color="#14532d" emissive="#22c55e" emissiveIntensity={0.35} roughness={0.4} toneMapped={false} />
        </mesh>
        <Label text="most likely next token" position={[0, 6.4, 0.8]} size={1.7} color="#86efac" />
        <Label text={showToken(tokenizer.tokenString(best))} position={[0, 0.6, 0.9]} size={4.2} color="#f0fdf4" bold />
        <Label text={`${(probs[best] * 100).toFixed(1)}% probability`} position={[0, -2.9, 0.9]} size={1.6} color="#bbf7d0" />
      </group>
    </group>
  );
}
