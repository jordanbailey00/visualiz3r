"use client";

import { CameraControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { useEffect, useMemo, useRef } from "react";
import { Box3, PerspectiveCamera, ShaderMaterial, Sphere, Vector2, Vector3 } from "three";
import type CameraControlsImpl from "camera-controls";
import { isUiHidden, useUiHidden } from "@/components/site/PresentationMode";
import { useLlm } from "@/lib/llm/viz/store";
import { useViewShift } from "@/lib/three/viewShift";
import { visibleOnlyEvents } from "@/lib/three/visibleHits";
import { LoopPath, ResidualPaths, Wires, connectionPairs } from "./Connections";
import { Embedding } from "./Embedding";
import { LaneLabels } from "./LaneLabels";
import { Output } from "./Output";
import { setPulseOrder, triggerSweep } from "./pulse";
import { ModuleBox, OpBadge } from "./Structure";
import { TensorSlab } from "./TensorSlab";

export default function LlmCanvas() {
  return (
    <Canvas
      events={visibleOnlyEvents}
      dpr={[1, 2]}
      gl={{ antialias: false, powerPreference: "high-performance", stencil: false }}
      camera={{ fov: 40, near: 0.5, far: 20000, position: [0, 0, 1200] }}
      onPointerMissed={() => useLlm.getState().select(null)}
    >
      <color attach="background" args={["#05060a"]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[300, 600, 500]} intensity={1.4} />
      <directionalLight position={[-400, 200, -300]} intensity={0.4} color="#a5b4fc" />
      <Scene />
      <CameraRig />
      <EffectComposer multisampling={4}>
        <Bloom luminanceThreshold={0.62} luminanceSmoothing={0.25} intensity={0.85} mipmapBlur />
        <ToneMapping mode={ToneMappingMode.NEUTRAL} />
        <Vignette offset={0.3} darkness={0.6} />
      </EffectComposer>
      <DevHook />
    </Canvas>
  );
}

function DevHook() {
  const state = useThree();
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") (window as unknown as { __three: typeof state }).__three = state;
  }, [state]);
  return null;
}

function Scene() {
  const layout = useLlm((s) => s.layout);
  const data = useLlm((s) => s.data);
  const model = useLlm((s) => s.model);
  const tokenizer = useLlm((s) => s.tokenizer);
  const tokens = useLlm((s) => s.tokens);
  const trace = useLlm((s) => s.trace);
  const probs = useLlm((s) => s.shownProbs);

  const pairs = useMemo(
    () => (layout && model ? connectionPairs(layout, model.config.nLayers, model.config.nHeads) : []),
    [layout, model],
  );

  // Flash every tensor in compute order whenever a new forward pass lands.
  useEffect(() => {
    if (!layout) return;
    setPulseOrder(layout.slabs.map((s) => s.id));
    triggerSweep(3.4);
  }, [layout, trace]);

  if (!layout || !model || !tokenizer || !trace || !probs) return null;
  return (
    <group>
      {layout.slabs.map((s) => {
        const d = data.get(s.id);
        return d ? <TensorSlab key={s.id} spec={s} data={d} /> : null;
      })}
      <Wires layout={layout} pairs={pairs} />
      <ResidualPaths layout={layout} />
      <LoopPath layout={layout} />
      {layout.ops.map((o) => (
        <OpBadge key={o.id} op={o} />
      ))}
      {layout.modules.map((m) => (
        <ModuleBox key={m.id} m={m} />
      ))}
      <Backdrop layout={layout} />
      <Embedding layout={layout} model={model} tokenizer={tokenizer} tokens={tokens} />
      <LaneLabels layout={layout} tokenizer={tokenizer} tokens={tokens} />
      <Output layout={layout} model={model} tokenizer={tokenizer} trace={trace} probs={probs} />
    </group>
  );
}

const backdropVertex = /* glsl */ `
  varying vec3 vPos;
  void main() {
    vPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * viewMatrix * vec4(vPos, 1.0);
  }
`;
const backdropFragment = /* glsl */ `
  varying vec3 vPos;
  uniform vec2 center;
  uniform vec2 halfSize;
  void main() {
    vec2 p = vPos.xy;
    vec2 cell = fract(p / 16.0) - 0.5;
    float dotMask = 1.0 - smoothstep(0.012, 0.03, length(cell));
    vec2 d = abs(p - center) / halfSize;
    float fade = 1.0 - smoothstep(0.55, 1.0, max(d.x, d.y));
    vec3 base = vec3(0.022, 0.026, 0.04);
    vec3 c = base + vec3(0.05, 0.055, 0.09) * dotMask;
    gl_FragColor = vec4(c, fade);
  }
`;

/** Dotted wall behind the model: gives the scene depth and scale. */
function Backdrop({ layout }: { layout: NonNullable<ReturnType<typeof useLlm.getState>["layout"]> }) {
  const { min, max } = layout.bounds;
  const cx = (min[0] + max[0]) / 2;
  const cy = (min[1] + max[1]) / 2;
  const w = (max[0] - min[0]) * 1.5;
  const h = (max[1] - min[1]) * 1.6;
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: backdropVertex,
        fragmentShader: backdropFragment,
        uniforms: { center: { value: new Vector2(cx, cy) }, halfSize: { value: new Vector2(w / 2, h / 2) } },
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    [cx, cy, w, h],
  );
  return (
    <mesh position={[cx, cy, min[2] - 30]} material={material} renderOrder={-10}>
      <planeGeometry args={[w, h]} />
    </mesh>
  );
}

const box = new Box3();
const sphere = new Sphere();
const v = new Vector3();

/** Frames the whole model initially, then follows camera goals from the tour / inspector. */
function CameraRig() {
  const controls = useRef<CameraControlsImpl>(null);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  const layout = useLlm((s) => s.layout);
  const goal = useLlm((s) => s.camera);
  const framed = useRef(false);
  const uiHidden = useUiHidden();
  // The prompt bar covers the bottom ~140 px: lift the picture a little.
  useViewShift(controls, 0, uiHidden ? 0 : 60);

  const fit = (min: [number, number, number], max: [number, number, number], dir: [number, number, number], smooth: boolean) => {
    const c = controls.current;
    if (!c) return;
    box.min.set(...min);
    box.max.set(...max);
    box.getBoundingSphere(sphere);
    const vfov = (camera.fov * Math.PI) / 180;
    const aspect = size.width / size.height;
    const free = size.width > 1100 && !isUiHidden() ? (size.width - 800) / size.width : 0.95;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect * free);
    // Camera basis for this view direction; measure the box's projected extent.
    v.set(...dir).normalize();
    const right = new Vector3().crossVectors(new Vector3(0, 1, 0), v).normalize();
    const up = new Vector3().crossVectors(v, right).normalize();
    let w = 0;
    let h = 0;
    let depth = 0;
    const center = sphere.center;
    for (let i = 0; i < 8; i++) {
      const p = new Vector3(i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]).sub(center);
      w = Math.max(w, Math.abs(p.dot(right)));
      h = Math.max(h, Math.abs(p.dot(up)));
      depth = Math.max(depth, p.dot(v));
    }
    const dist = Math.max(h / Math.tan(vfov / 2), w / Math.tan(hfov / 2)) * 1.06 + depth;
    c.setLookAt(center.x + v.x * dist, center.y + v.y * dist, center.z + v.z * dist, center.x, center.y, center.z, smooth);
  };

  useEffect(() => {
    if (!layout || framed.current) return;
    framed.current = true;
    fit(layout.bounds.min, layout.bounds.max, [0.3, 0.16, 1], false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  useEffect(() => {
    if (!goal) return;
    fit(goal.min, goal.max, goal.dir ?? [0.18, 0.12, 1], true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goal]);

  useFrame(() => {
    const c = controls.current;
    if (!c) return;
    const d = c.distance;
    const near = Math.min(Math.max(d / 500, 0.05), 20);
    if (Math.abs(camera.near - near) / near > 0.2) {
      camera.near = near;
      camera.far = Math.max(d * 30, 8000);
      camera.updateProjectionMatrix();
    }
  });

  return (
    <CameraControls
      ref={controls}
      makeDefault
      minDistance={4}
      maxDistance={6000}
      smoothTime={0.55}
      draggingSmoothTime={0.08}
      dollyToCursor
      dollySpeed={0.6}
    />
  );
}
