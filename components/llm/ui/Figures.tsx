"use client";

import { useEffect, useState } from "react";
import type { Ctx } from "@/lib/llm/viz/explain";
import { pct, showTokenPlain } from "@/lib/llm/viz/format";
import { softmaxWithTemperature } from "@/lib/llm/model";

/**
 * RoPE as clock hands: for a few rotation speeds (pairs of dimensions), the
 * hand for token position p is turned by p·θ. Slow pairs encode long-range
 * position, fast pairs fine position.
 */
export function RopeFigure({ positions }: { positions: number }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = () => {
      setT(((performance.now() - start) / 1000) % 6);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const D = 16;
  const pairs = [0, 2, 5];
  const n = Math.max(2, Math.min(positions, 8));
  const shown = Math.min(n, Math.floor(t / 0.6) + 1);
  return (
    <figure className="mt-4 border border-hud-line bg-black/25 p-3">
      <div className="grid grid-cols-3 gap-2">
        {pairs.map((i) => {
          const theta = Math.pow(10000, (-2 * i) / D);
          return (
            <div key={i} className="flex flex-col items-center">
              <svg viewBox="-50 -50 100 100" className="h-24 w-24">
                <circle r="40" fill="none" stroke="rgba(255,255,255,0.12)" />
                {Array.from({ length: shown }, (_, p) => {
                  const a = p * theta * (i === 0 ? 1 : 1) - Math.PI / 2;
                  const last = p === shown - 1;
                  return (
                    <g key={p}>
                      <line x1="0" y1="0" x2={36 * Math.cos(a)} y2={36 * Math.sin(a)} stroke={last ? "#c4b5fd" : "rgba(196,181,253,0.35)"} strokeWidth={last ? 3 : 1.5} strokeLinecap="round" />
                      {last && (
                        <text x={44 * Math.cos(a)} y={44 * Math.sin(a) + 3} fontSize="9" fill="#e9d5ff" textAnchor="middle">
                          {p}
                        </text>
                      )}
                    </g>
                  );
                })}
                <circle r="3" fill="#c4b5fd" />
              </svg>
              <span className="mt-1 text-[10.5px] text-hud-faint">pair {i + 1} · {theta >= 0.1 ? theta.toFixed(2) : theta.toExponential(0)} rad/token</span>
            </div>
          );
        })}
      </div>
      <figcaption className="mt-2 text-[11.5px] leading-snug text-hud-dim">
        Each pair of numbers in a query or key is rotated by its position (0, 1, 2…) times a fixed speed. Fast pairs (left) spin a lot per token;
        slow pairs barely move — together they encode position at every scale.
      </figcaption>
    </figure>
  );
}

/** The SiLU activation z · sigmoid(z), drawn next to ReLU for comparison. */
export function SiluFigure() {
  const pts: string[] = [];
  const relu: string[] = [];
  for (let i = 0; i <= 80; i++) {
    const z = -6 + (12 * i) / 80;
    const y = z / (1 + Math.exp(-z));
    pts.push(`${(i / 80) * 220 + 10},${90 - y * 12}`);
    relu.push(`${(i / 80) * 220 + 10},${90 - Math.max(0, z) * 12}`);
  }
  return (
    <figure className="mt-4 border border-hud-line bg-black/25 p-3">
      <svg viewBox="0 0 240 110" className="w-full">
        <line x1="10" y1="90" x2="230" y2="90" stroke="rgba(255,255,255,0.15)" />
        <line x1="120" y1="10" x2="120" y2="105" stroke="rgba(255,255,255,0.15)" />
        <polyline points={relu.join(" ")} fill="none" stroke="rgba(148,163,184,0.5)" strokeDasharray="3 3" strokeWidth="1.5" />
        <polyline points={pts.join(" ")} fill="none" stroke="#fb923c" strokeWidth="2.5" />
        <text x="196" y="22" fontSize="10" fill="#fdba74">SiLU</text>
        <text x="196" y="36" fontSize="10" fill="#94a3b8">ReLU</text>
        <text x="12" y="104" fontSize="9" fill="#64748b">−6</text>
        <text x="220" y="104" fontSize="9" fill="#64748b">+6</text>
      </svg>
      <figcaption className="mt-1 text-[11.5px] leading-snug text-hud-dim">
        Negative inputs are squashed toward 0, positive ones pass through — a smooth version of ReLU. In SwiGLU it acts as a gate on each of the
        256 features.
      </figcaption>
    </figure>
  );
}

/** How temperature reshapes the real next-token distribution. */
export function TemperatureFigure({ ctx }: { ctx: Ctx }) {
  const [T, V] = ctx.trace.logits.shape;
  const logits = ctx.trace.logits.data.subarray((T - 1) * V, T * V);
  const temps = [0.5, 1, 1.5];
  const base = softmaxWithTemperature(logits, 1);
  const top = Array.from(base.keys())
    .sort((a, b) => base[b] - base[a])
    .slice(0, 5);
  const dists = temps.map((t) => softmaxWithTemperature(logits, t));
  return (
    <figure className="mt-4 border border-hud-line bg-black/25 p-3">
      <div className="grid grid-cols-3 gap-3">
        {temps.map((t, k) => (
          <div key={t}>
            <p className="mb-1.5 text-center text-[11px] font-semibold text-hud-text">temperature {t}</p>
            {top.map((id) => (
              <div key={id} className="mb-1">
                <div className="flex justify-between font-mono text-[10px] text-hud-dim">
                  <span className="truncate">{showTokenPlain(ctx.tokenizer.tokenString(id))}</span>
                  <span>{pct(dists[k][id], 0)}</span>
                </div>
                <div className="h-1.5 bg-white/[0.06]">
                  <div className="h-full bg-emerald-400" style={{ width: `${dists[k][id] * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      <figcaption className="mt-2 text-[11.5px] leading-snug text-hud-dim">
        Dividing the logits by a temperature before softmax: low temperature makes the favourite even more likely (safe, repetitive), high
        temperature spreads probability to surprising choices.
      </figcaption>
    </figure>
  );
}
