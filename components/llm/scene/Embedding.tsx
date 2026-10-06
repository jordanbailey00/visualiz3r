"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { BufferAttribute, BufferGeometry, type MeshBasicMaterial } from "three";
import { roundedBox } from "@/components/hardware/kit/geometry";
import type { LoadedModel } from "@/lib/llm/model";
import type { BpeTokenizer } from "@/lib/llm/tokenizer";
import type { VizLayout } from "@/lib/llm/viz/layout";
import { useLlm } from "@/lib/llm/viz/store";
import { makeFlowLineMaterial } from "./Connections";
import { Label } from "./Label";
import { showToken, tileCenter, useMosaicTexture } from "./Vocab";

const TILE_W = 22;

/**
 * Left end of the model: the prompt, its tokens (one per lane) and the
 * embedding table they are looked up in.
 */
export function Embedding({
  layout,
  model,
  tokenizer,
  tokens,
}: {
  layout: VizLayout;
  model: LoadedModel;
  tokenizer: BpeTokenizer;
  tokens: number[];
}) {
  const m = layout.embed.mosaic;
  const tex = useMosaicTexture(model, m.cols);
  const tilesX = layout.embed.tokensX;
  const mosaicMat = useRef<MeshBasicMaterial>(null);

  // Lookup lines: mosaic tile → token tile → embedding lane, with flowing dashes.
  const lines = useMemo(() => {
    const pos: number[] = [];
    const dist: number[] = [];
    tokens.forEach((id, t) => {
      const [cx, cy] = tileCenter(id, m.cols, m.tile);
      const y = -t - 0.5;
      const ax = m.x + cx;
      const ay = m.y - cy;
      const len = Math.hypot(tilesX - 0.6 - ax, y - ay);
      pos.push(ax, ay, 0.2, tilesX - 0.6, y, 0.2);
      dist.push(0, len);
      pos.push(tilesX + TILE_W + 0.6, y, 0, -0.5, y, 0);
      dist.push(len + TILE_W, len + TILE_W + Math.abs(-0.5 - tilesX - TILE_W));
    });
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute("aDist", new BufferAttribute(new Float32Array(dist), 1));
    return g;
  }, [tokens, m, tilesX]);
  const flowMat = useMemo(() => makeFlowLineMaterial("#fde68a"), []);

  const markers = useMemo(() => {
    const seen = new Set<number>();
    return tokens.filter((id) => (seen.has(id) ? false : (seen.add(id), true)));
  }, [tokens]);

  useFrame(({ clock }) => {
    const s = useLlm.getState();
    const focused = !s.focus || s.focus.has("step:embed");
    flowMat.uniforms.time.value = clock.elapsedTime;
    flowMat.uniforms.opacity.value = focused ? 0.9 : 0.12;
    if (mosaicMat.current) mosaicMat.current.color.setScalar(focused ? 1 : 0.2);
  });

  const prompt = tokenizer.decode(tokens.slice(1));

  return (
    <group>
      {/* Prompt text */}
      <Label
        text={`“${prompt}”`}
        position={[m.x, m.y + 22, 0]}
        size={6}
        color="#f8fafc"
        anchorX="left"
        anchorY="bottom"
        maxWidth={m.w + 60}
        bold
      />
      <Label text="Prompt" position={[m.x, m.y + 31 + Math.floor(prompt.length / 40) * 7, 0]} size={3.2} color="#a78bfa" anchorX="left" anchorY="bottom" />

      {/* Embedding table mosaic */}
      <group position={[m.x + m.w / 2, m.y - m.h / 2, 0]}>
        <mesh
          onPointerMove={(e) => {
            e.stopPropagation();
            if (!e.uv) return;
            const col = Math.floor(e.uv.x * m.cols);
            const row = Math.floor((1 - e.uv.y) * m.rows);
            const id = row * m.cols + col;
            if (id < model.config.vocabSize) useLlm.getState().hover({ kind: "vocab", id, where: "embed" });
          }}
          onPointerOut={() => useLlm.getState().hover(null)}
          onClick={(e) => {
            e.stopPropagation();
            if (e.delta > 5 || !e.uv) return;
            const id = Math.floor((1 - e.uv.y) * m.rows) * m.cols + Math.floor(e.uv.x * m.cols);
            useLlm.getState().select({ kind: "vocab", id, where: "embed" });
          }}
        >
          <planeGeometry args={[m.w, m.h]} />
          <meshBasicMaterial ref={mosaicMat} map={tex} toneMapped={false} />
        </mesh>
        <mesh position-z={-0.35}>
          <boxGeometry args={[m.w + 2, m.h + 2, 0.5]} />
          <meshBasicMaterial color="#2a3142" transparent opacity={0.5} />
        </mesh>
        {markers.map((id) => {
          const [cx, cy] = tileCenter(id, m.cols, m.tile);
          return (
            <mesh key={id} position={[cx - m.w / 2, m.h / 2 - cy, 0.15]}>
              <boxGeometry args={[m.tile + 0.5, m.tile + 0.5, 0.2]} />
              <meshBasicMaterial color="#fde68a" transparent opacity={0.35} toneMapped={false} />
            </mesh>
          );
        })}
      </group>
      <Label
        text={`Embedding table · ${model.config.vocabSize.toLocaleString()} tokens × ${model.config.dModel} numbers`}
        position={[m.x, m.y + 3, 0]}
        size={3.2}
        color="#fde68a"
        anchorX="left"
        anchorY="bottom"
      />
      <Label text="each 8×8 square is one token's vector" position={[m.x, m.y - m.h - 2.5, 0]} size={2.2} color="#94a3b8" anchorX="left" anchorY="top" fadeFar={600} />

      <lineSegments geometry={lines} material={flowMat} />

      {/* Token tiles, one per lane */}
      <Label text="Tokens" position={[tilesX, 4.5, 0]} size={3} color="#fde68a" anchorX="left" anchorY="bottom" />
      {tokens.map((id, t) => (
        <TokenTile key={t} index={t} id={id} text={showToken(tokenizer.isSpecial(id) ? "" : tokenizer.tokenString(id))} x={tilesX} />
      ))}
    </group>
  );
}

function TokenTile({ index, id, text, x }: { index: number; id: number; text: string; x: number }) {
  const mat = useRef<MeshBasicMaterial>(null);
  useFrame(() => {
    const s = useLlm.getState();
    const on = s.laneHighlight === index || (s.selected?.kind === "token" && s.selected.index === index);
    if (mat.current) mat.current.opacity = on ? 0.5 : 0.16;
  });
  return (
    <group position={[x, -index - 0.5, 0]}>
      <mesh
        position={[TILE_W / 2, 0, 0]}
        geometry={roundedBox(TILE_W, 0.84, 0.4, 0.2)}
        onPointerOver={(e) => {
          e.stopPropagation();
          useLlm.getState().hover({ kind: "token", index });
          useLlm.getState().setLane(index);
        }}
        onPointerOut={() => {
          useLlm.getState().hover(null);
          useLlm.getState().setLane(null);
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (e.delta > 5) return;
          useLlm.getState().select({ kind: "token", index });
        }}
      >
        <meshBasicMaterial ref={mat} color="#fde68a" transparent opacity={0.16} toneMapped={false} />
      </mesh>
      <Label text={text} position={[0.6, 0, 0.3]} size={0.62} color="#fff7d6" anchorX="left" mono fadeFar={160} />
      <Label text={`#${id}`} position={[TILE_W - 0.5, 0, 0.3]} size={0.5} color="#a3a3a3" anchorX="right" mono fadeFar={120} />
    </group>
  );
}
