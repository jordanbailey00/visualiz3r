"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  ShaderMaterial,
  TubeGeometry,
} from "three";
import { bentPath } from "@/components/hardware/kit/Thermal";
import type { SlabSpec, VizLayout } from "@/lib/llm/viz/layout";
import { useLlm } from "@/lib/llm/viz/store";
import { Label } from "./Label";

/** Pairs of slabs whose token lanes are joined by wires, in compute order. */
export function connectionPairs(layout: VizLayout, nLayers: number, nHeads: number): [string, string][] {
  const pairs: [string, string][] = [];
  for (let l = 0; l < nLayers; l++) {
    const P = `L${l}`;
    pairs.push([`${P}.x`, `${P}.attn.rms`], [`${P}.attn.rms`, `${P}.attn.normed`], [`${P}.attn.normed`, `${P}.attn.q`]);
    for (let h = 0; h < nHeads; h++) {
      pairs.push([`${P}.attn.v`, `${P}.h${h}.q`], [`${P}.h${h}.q`, `${P}.h${h}.scores`], [`${P}.h${h}.scores`, `${P}.h${h}.probs`]);
      pairs.push([`${P}.h${h}.probs`, `${P}.h${h}.out`], [`${P}.h${h}.out`, `${P}.attn.concat`]);
    }
    pairs.push([`${P}.attn.concat`, `${P}.attn.out`], [`${P}.attn.out`, `${P}.resid1`]);
    pairs.push([`${P}.resid1`, `${P}.mlp.rms`], [`${P}.mlp.rms`, `${P}.mlp.normed`]);
    pairs.push([`${P}.mlp.normed`, `${P}.mlp.gate`], [`${P}.mlp.normed`, `${P}.mlp.up`]);
    pairs.push([`${P}.mlp.gate`, `${P}.mlp.act`], [`${P}.mlp.act`, `${P}.mlp.hidden`], [`${P}.mlp.up`, `${P}.mlp.hidden`]);
    pairs.push([`${P}.mlp.hidden`, `${P}.mlp.out`], [`${P}.mlp.out`, `${P}.out`]);
  }
  pairs.push([`L${nLayers - 1}.out`, "final.rms"], ["final.rms", "final.normed"]);
  return pairs.filter(([a, b]) => layout.slabs.some((s) => s.id === a) && layout.slabs.some((s) => s.id === b));
}

const wireVertex = /* glsl */ `
  attribute float aDist;
  attribute float aLane;
  varying float vDist;
  varying float vLane;
  void main() {
    vDist = aDist;
    vLane = aLane;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const wireFragment = /* glsl */ `
  uniform float time;
  uniform vec3 color;
  uniform float lane;
  uniform float dimAll;
  varying float vDist;
  varying float vLane;
  void main() {
    float dash = smoothstep(0.75, 1.0, fract(vDist * 0.06 - time * 0.45));
    float hl = lane >= 0.0 ? (abs(vLane - lane) < 0.5 ? 1.0 : 0.25) : 1.0;
    vec3 c = color * (0.35 + 1.4 * dash) * hl;
    gl_FragColor = vec4(c * mix(1.0, 0.25, dimAll), 1.0);
  }
`;

const flowVertex = /* glsl */ `
  attribute float aDist;
  varying float vDist;
  void main() {
    vDist = aDist;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const flowFragment = /* glsl */ `
  uniform float time;
  uniform vec3 color;
  uniform float opacity;
  varying float vDist;
  void main() {
    float dash = smoothstep(0.7, 1.0, fract(vDist * 0.05 - time * 0.6));
    gl_FragColor = vec4(color * (0.35 + 1.3 * dash) * opacity, 1.0);
  }
`;

/** Additive line material whose dashes flow along an `aDist` attribute. */
export function makeFlowLineMaterial(color: string) {
  return new ShaderMaterial({
    vertexShader: flowVertex,
    fragmentShader: flowFragment,
    uniforms: { time: { value: 0 }, color: { value: new Color(color) }, opacity: { value: 1 } },
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
}

/** Every lane wire in the scene as one line-segment draw call. */
export function Wires({ layout, pairs }: { layout: VizLayout; pairs: [string, string][] }) {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: wireVertex,
        fragmentShader: wireFragment,
        uniforms: { time: { value: 0 }, color: { value: new Color("#7c6cf0") }, lane: { value: -1 }, dimAll: { value: 0 } },
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );
  const geometry = useMemo(() => {
    const byId = new Map<string, SlabSpec>(layout.slabs.map((s) => [s.id, s]));
    const pos: number[] = [];
    const dist: number[] = [];
    const lanes: number[] = [];
    for (const [a, b] of pairs) {
      const A = byId.get(a);
      const B = byId.get(b);
      if (!A || !B) continue;
      const x0 = A.x + A.cols * A.cellW + 0.5;
      const x1 = B.x - 0.5;
      if (x1 <= x0) continue;
      for (let t = 0; t < layout.T; t++) {
        const y = A.y - t - 0.5;
        pos.push(x0, y, A.z, x1, y, B.z);
        const len = Math.hypot(x1 - x0, B.z - A.z);
        dist.push(x0, x0 + len);
        lanes.push(t, t);
      }
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute("aDist", new BufferAttribute(new Float32Array(dist), 1));
    g.setAttribute("aLane", new BufferAttribute(new Float32Array(lanes), 1));
    g.computeBoundingSphere();
    return g;
  }, [layout, pairs]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(({ clock }) => {
    material.uniforms.time.value = clock.elapsedTime;
    const s = useLlm.getState();
    material.uniforms.lane.value = s.laneHighlight ?? -1;
    material.uniforms.dimAll.value = s.focus ? 1 : 0;
  });
  return <lineSegments geometry={geometry} material={material} renderOrder={2} />;
}

const tubeVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const tubeFragment = /* glsl */ `
  uniform float time;
  uniform vec3 color;
  uniform float length;
  uniform float dimAmt;
  uniform float hover;
  varying vec2 vUv;
  void main() {
    float s = vUv.x * length;
    float flow = smoothstep(0.55, 1.0, fract(s * 0.05 - time * 0.5));
    float rim = 0.55 + 0.45 * abs(sin(vUv.y * 3.14159));
    vec3 c = color * (0.45 + 1.2 * flow) * rim * (1.0 + hover * 0.8);
    gl_FragColor = vec4(c * mix(1.0, 0.2, dimAmt), 0.85);
  }
`;

function FlowTube({
  id,
  points,
  radius,
  color,
  bend,
  label,
  labelAt,
  focusKey,
}: {
  id: string;
  points: [number, number, number][];
  radius: number;
  color: string;
  bend: number;
  label?: string;
  labelAt?: [number, number, number];
  focusKey: string[];
}) {
  const { geometry, length } = useMemo(() => {
    const path = bentPath(points, bend);
    const len = path.getLength();
    return { geometry: new TubeGeometry(path, Math.max(32, Math.round(len / 2)), radius, 10, false), length: len };
  }, [points, radius, bend]);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: tubeVertex,
        fragmentShader: tubeFragment,
        uniforms: {
          time: { value: 0 },
          color: { value: new Color(color) },
          length: { value: length },
          dimAmt: { value: 0 },
          hover: { value: 0 },
        },
        transparent: true,
        toneMapped: false,
      }),
    [color, length],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(({ clock }) => {
    const s = useLlm.getState();
    material.uniforms.time.value = clock.elapsedTime;
    const focused = !s.focus || focusKey.some((k) => s.focus!.has(k));
    material.uniforms.dimAmt.value = focused ? 0 : 1;
    material.uniforms.hover.value = s.hovered?.kind === "skip" && s.hovered.id === id ? 1 : 0;
  });
  return (
    <group>
      <mesh
        geometry={geometry}
        material={material}
        onPointerOver={(e) => {
          e.stopPropagation();
          useLlm.getState().hover({ kind: "skip", id });
        }}
        onPointerOut={() => useLlm.getState().hover(null)}
        onClick={(e) => {
          e.stopPropagation();
          if (e.delta > 5) return;
          useLlm.getState().select({ kind: "skip", id });
        }}
      />
      {label && labelAt && <Label text={label} position={labelAt} size={1.6} color="#c4b5fd" anchorX="left" fadeFar={420} />}
    </group>
  );
}

/** The autoregressive loop: the chosen token goes back to the end of the input. */
export function LoopPath({ layout }: { layout: VizLayout }) {
  const lastTop = layout.rowTop[layout.rowTop.length - 1];
  const sx = layout.output.sampleX;
  const topY = layout.bounds.max[1] + 8;
  const tx = layout.embed.tokensX + 10;
  const endY = -layout.T - 2.5;
  const rightX = sx + 30;
  return (
    <FlowTube
      id="loop"
      points={[
        [sx + 15, lastTop + 8, 10],
        [rightX, lastTop + 8, 10],
        [rightX, topY, 10],
        [tx - 70, topY, 10],
        [tx - 70, endY, 4],
        [tx - 2, endY, 2],
      ]}
      radius={1.6}
      bend={24}
      color="#4ade80"
      label="next token is appended to the input — then the whole model runs again"
      labelAt={[tx + 60, topY + 3.5, 10]}
      focusKey={["step:sample", "loop"]}
    />
  );
}

/** Residual skip connections and the "carriage returns" between block rows. */
export function ResidualPaths({ layout }: { layout: VizLayout }) {
  const T = layout.T;
  return (
    <group>
      {layout.skips.map((s) => {
        const yTop = s.top - T - 0.8;
        const addY = s.top - T / 2 - 3;
        return (
          <FlowTube
            key={s.id}
            id={s.id}
            points={[
              [s.x0, yTop, 0],
              [s.x0, s.bottom, 0],
              [s.x1, s.bottom, 0],
              [s.x1, addY, 0],
            ]}
            radius={0.7}
            bend={3}
            color="#a78bfa"
            label="residual connection (skip)"
            labelAt={[s.x0 + 4, s.bottom - 2.6, 0]}
            focusKey={[`step:${s.id.endsWith("skip1") ? "attn-add" : "mlp-add"}`, `layer:${s.layer}`, s.id]}
          />
        );
      })}
      {layout.returns.map((r) => {
        const midY = r.y0 - T - 30;
        const ys = r.y0 - T / 2;
        const ye = r.y1 - T / 2;
        return (
          <FlowTube
            key={r.id}
            id={r.id}
            points={[
              [r.x0 + 0.5, ys, 0],
              [r.x0 + 16, ys, 0],
              [r.x0 + 16, midY, 0],
              [r.x1 - 22, midY, 0],
              [r.x1 - 22, ye, 0],
              [r.x1 - 0.5, ye, 0],
            ]}
            radius={1.1}
            bend={9}
            color="#8b7cf6"
            label={`residual stream → block ${r.layer + 2}`}
            labelAt={[r.x0 - 120, midY + 2.6, 0]}
            focusKey={["step:resid", `layer:${r.layer}`, `layer:${r.layer + 1}`, r.id]}
          />
        );
      })}
    </group>
  );
}
