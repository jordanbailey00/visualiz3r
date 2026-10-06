"use client";

import { useMemo } from "react";
import {
  DataTexture,
  LinearMipmapLinearFilter,
  NearestFilter,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
} from "three";
import type { LoadedModel } from "@/lib/llm/model";
import { diverging } from "@/lib/llm/viz/colormap";
import { robustScale } from "@/lib/llm/viz/data";

/** Pixels per token tile in the mosaic texture: 8×8 values + 1 px gutter. */
export const MOSAIC_TILE_PX = 9;

let cached: { key: LoadedModel; tex: DataTexture } | null = null;

/**
 * The token-embedding matrix (V × C) as a mosaic: token k is drawn as an 8×8
 * patch of its C = 64 numbers, tokens laid out 64 per row (k = row·64 + col).
 */
export function useMosaicTexture(model: LoadedModel, cols: number) {
  return useMemo(() => {
    if (cached?.key === model) return cached.tex;
    const { vocabSize: V, dModel: C } = model.config;
    const side = Math.ceil(Math.sqrt(C));
    const rows = Math.ceil(V / cols);
    const W = cols * MOSAIC_TILE_PX;
    const H = rows * MOSAIC_TILE_PX;
    const px = new Uint8Array(W * H * 4);
    const emb = model.weights.tokEmb.data;
    const scale = robustScale(emb, 0.99);
    for (let i = 0; i < W * H; i++) {
      px[i * 4] = 8;
      px[i * 4 + 1] = 9;
      px[i * 4 + 2] = 13;
      px[i * 4 + 3] = 255;
    }
    for (let k = 0; k < V; k++) {
      const tc = k % cols;
      const tr = Math.floor(k / cols);
      for (let c = 0; c < C; c++) {
        const [r, g, b] = diverging(emb[k * C + c] / scale);
        const x = tc * MOSAIC_TILE_PX + (c % side);
        // Texture row 0 is the bottom; flip so token row 0 is at the top.
        const y = H - 1 - (tr * MOSAIC_TILE_PX + Math.floor(c / side));
        const o = (y * W + x) * 4;
        px[o] = Math.round(r * 255);
        px[o + 1] = Math.round(g * 255);
        px[o + 2] = Math.round(b * 255);
      }
    }
    const tex = new DataTexture(px, W, H, RGBAFormat, UnsignedByteType);
    tex.colorSpace = SRGBColorSpace;
    tex.magFilter = NearestFilter;
    tex.minFilter = LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    cached = { key: model, tex };
    return tex;
  }, [model, cols]);
}

/** Token-tile index → centre of that tile in mosaic-local units (origin top-left, y down). */
export function tileCenter(id: number, cols: number, tile: number): [number, number] {
  return [(id % cols) * tile + tile / 2, Math.floor(id / cols) * tile + tile / 2];
}

/**
 * Display form of a token for 3D labels: a leading space is shown as "·" and
 * newlines as "¶" (the 3D font only covers Latin-1).
 */
export function showToken(s: string) {
  if (s === "") return "[start]";
  return s.replace(/^ /, "·").replace(/\n/g, "¶");
}
