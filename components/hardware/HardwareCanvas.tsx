"use client";

import {
  Bvh,
  CameraControls,
  Environment,
  Grid,
  Lightformer,
} from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Bloom,
  EffectComposer,
  N8AO,
  Outline,
  SMAA,
  ToneMapping,
  Vignette,
} from "@react-three/postprocessing";
import { KernelSize, ToneMappingMode } from "postprocessing";
import { Suspense, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { Box3, CanvasTexture, PCFShadowMap, PerspectiveCamera, Sphere, Vector3, type Object3D } from "three";
import type CameraControlsImpl from "camera-controls";
import { useUiHidden } from "@/components/site/PresentationMode";
import { useExplorer } from "@/lib/hardware/store";
import { fitView, visibleCorners } from "@/lib/three/fit";
import "@/lib/three/hdrClamp";
import { useViewShift } from "@/lib/three/viewShift";
import { visibleOnlyEvents } from "@/lib/three/visibleHits";
import type { DeviceInfo } from "@/lib/hardware/types";
import { DeviceRoot } from "./DeviceRoot";
import { PartLabels } from "./PartLabels";
import { explodeProgress } from "./explode";
import { meshesOf, modelRoot, partObjects } from "./sceneState";

export interface HardwareCanvasProps {
  device: DeviceInfo;
  Model: ComponentType;
}

export default function HardwareCanvas({ device, Model }: HardwareCanvasProps) {
  const quality = useExplorer((s) => s.quality);
  const high = quality === "high";
  return (
    <Canvas
      events={visibleOnlyEvents}
      shadows={high ? { type: PCFShadowMap } : false}
      dpr={[1, 2]}
      gl={{ antialias: false, powerPreference: "high-performance", stencil: false }}
      camera={{ fov: 30, near: 0.5, far: device.size * 60, position: device.camera.position }}
      onPointerMissed={() => useExplorer.getState().select(null)}
      onPointerLeave={() => useExplorer.getState().hover(null)}
    >
      <color attach="background" args={["#07090d"]} />
      <SceneLights size={device.size} shadows={high} />
      <StudioEnvironment />
      <Suspense fallback={null}>
        <Bvh firstHitOnly>
          <DeviceRoot>
            <Model />
          </DeviceRoot>
        </Bvh>
      </Suspense>
      <PartLabels device={device} />
      <Floor size={device.size} />
      <CameraRig device={device} />
      <ExplodeDriver />
      <Effects size={device.size} high={high} />
      <DevHook />
    </Canvas>
  );
}

/** Exposes renderer state for automated visual checks in development. */
function DevHook() {
  const state = useThree();
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") (window as unknown as { __three: typeof state }).__three = state;
  }, [state]);
  return null;
}

function SceneLights({ size, shadows }: { size: number; shadows: boolean }) {
  const s = size;
  return (
    <>
      <hemisphereLight args={["#dfe8ff", "#1b1612", 0.45]} />
      <directionalLight
        castShadow={shadows}
        position={[s * 0.55, s * 1.3, s * 0.75]}
        intensity={1.9}
        shadow-mapSize={[4096, 4096]}
        shadow-bias={-0.00015}
        shadow-normalBias={s * 0.0004}
        shadow-radius={3}
      >
        <orthographicCamera
          attach="shadow-camera"
          args={[-s * 0.8, s * 0.8, s * 0.8, -s * 0.8, s * 0.1, s * 4]}
        />
      </directionalLight>
      <directionalLight position={[-s, s * 0.5, -s * 0.9]} intensity={0.7} color="#b9d3ff" />
      <directionalLight position={[-s * 0.4, s * 0.2, s]} intensity={0.35} color="#fff1dc" />
    </>
  );
}

/** Procedural studio lighting for reflections: softboxes and strip lights. */
function StudioEnvironment() {
  return (
    <Environment resolution={512} environmentIntensity={0.62}>
      <color attach="background" args={["#0b0d12"]} />
      <Lightformer form="rect" intensity={1.3} position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[9, 9, 1]} />
      <Lightformer form="rect" intensity={3.5} position={[-6, 2.5, 2]} rotation-y={Math.PI / 2} scale={[2.2, 9, 1]} />
      <Lightformer form="rect" intensity={1.6} position={[6, 2, -1.5]} rotation-y={-Math.PI / 2} scale={[2, 9, 1]} />
      <Lightformer form="rect" intensity={2.4} position={[0, 3, -8]} scale={[12, 1.6, 1]} />
      <Lightformer form="rect" intensity={0.8} position={[0, -1.5, 7]} rotation-y={Math.PI} scale={[12, 1.2, 1]} />
      <Lightformer form="ring" color="#a8c8ff" intensity={1.2} position={[3, 4, 6]} scale={2.5} />
    </Environment>
  );
}

let floorTex: CanvasTexture | null = null;
/** Radial falloff so the lit floor fades into the background. */
function floorAlpha() {
  if (floorTex) return floorTex;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, "#fff");
  g.addColorStop(0.35, "#bbb");
  g.addColorStop(0.7, "#333");
  g.addColorStop(1, "#000");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  floorTex = new CanvasTexture(c);
  return floorTex;
}

function Floor({ size }: { size: number }) {
  const cell = niceStep(size / 30);
  return (
    <group position={[0, -0.05, 0]}>
      <mesh rotation-x={-Math.PI / 2} receiveShadow renderOrder={-2}>
        <circleGeometry args={[size * 2.6, 96]} />
        <meshStandardMaterial
          color="#171b23"
          roughness={0.92}
          metalness={0}
          alphaMap={floorAlpha()}
          transparent
          depthWrite={false}
        />
      </mesh>
      <Grid
        position-y={0.01}
        args={[size * 12, size * 12]}
        cellSize={cell}
        cellThickness={0.6}
        cellColor="#1a2130"
        sectionSize={cell * 10}
        sectionThickness={1}
        sectionColor="#253047"
        fadeDistance={size * 4}
        fadeStrength={2.5}
        infiniteGrid={false}
      />
    </group>
  );
}

function niceStep(x: number) {
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  const n = x / p;
  return (n < 2 ? 1 : n < 5 ? 2 : 5) * p;
}

function ExplodeDriver() {
  useFrame((_, dt) => {
    const target = useExplorer.getState().explode;
    const v = explodeProgress.value;
    const next = v + (target - v) * (1 - Math.exp(-dt * 7));
    explodeProgress.value = Math.abs(target - next) < 1e-4 ? target : next;
  });
  return null;
}

const tmpBox = new Box3();
const tmpSphere = new Sphere();
const tmpV = new Vector3();
const tmpT = new Vector3();

/** Side panels: 296 px on the left, 396 px on the right, plus gutters. */
const PANELS = { left: 296, right: 396, total: 720 };

function CameraRig({ device }: { device: DeviceInfo }) {
  const controls = useRef<CameraControlsImpl>(null);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  const command = useExplorer((s) => s.cameraCommand);
  const autoRotate = useExplorer((s) => s.autoRotate);
  const nodes = useExplorer((s) => s.nodes);
  const uiHidden = useUiHidden();
  const home = useRef<{ pos: Vector3; target: Vector3 } | null>(null);
  const panels = size.width > 1100 && !uiHidden;

  // Keep whatever the camera looks at centred in the gap between the panels.
  useViewShift(controls, panels ? (PANELS.right - PANELS.left) / 2 : 0, 0);

  /** Target and distance that frame what is visible under `obj` along `dir`. */
  const frame = (obj: Object3D, dir: Vector3, margin?: number) =>
    fitView(visibleCorners(obj), dir, {
      fov: camera.fov,
      width: size.width,
      height: size.height,
      freeWidth: panels ? (size.width - PANELS.total) / size.width : 0.95,
      freeHeight: uiHidden ? 1 : 0.9,
      margin,
    });

  // Frame the assembled model on mount, and when presentation mode toggles.
  useEffect(() => {
    const c = controls.current;
    const root = modelRoot.current;
    if (!c || !root || Object.keys(nodes).length === 0) return;
    const dir = new Vector3(...device.camera.position).sub(new Vector3(...device.camera.target)).normalize();
    const fit = frame(root, dir);
    if (!fit) return;
    const pos = fit.center.clone().addScaledVector(dir, fit.distance);
    home.current = { pos, target: fit.center };
    c.setFocalOffset(0, 0, 0, false);
    c.setLookAt(pos.x, pos.y, pos.z, fit.center.x, fit.center.y, fit.center.z, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, device, uiHidden]);

  useEffect(() => {
    const c = controls.current;
    if (!c || !command) return;
    if (command.type === "reset") {
      const h = home.current;
      if (h) c.setLookAt(h.pos.x, h.pos.y, h.pos.z, h.target.x, h.target.y, h.target.z, true);
      return;
    }
    const obj = partObjects.get(command.id);
    if (!obj) return;
    c.getPosition(tmpV);
    c.getTarget(tmpT);
    const dir = tmpV.clone().sub(tmpT).normalize();
    let center: Vector3;
    let dist: number;
    const fit = frame(obj, dir, 1.6);
    if (fit) {
      center = fit.center;
      dist = fit.distance;
    } else {
      // Nothing of it is visible (hidden by the user): fall back to its bounds.
      tmpBox.setFromObject(obj);
      if (tmpBox.isEmpty()) return;
      tmpBox.getBoundingSphere(tmpSphere);
      center = tmpSphere.center.clone();
      dist = (tmpSphere.radius / Math.sin((camera.fov * Math.PI) / 360)) * 1.25;
    }
    dist = Math.max(dist, device.size * 0.05);
    c.setLookAt(center.x + dir.x * dist, center.y + dir.y * dist, center.z + dir.z * dist, center.x, center.y, center.z, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command, camera, device]);

  // After the exploded view settles, pull back if parts left the frame; when
  // closing again, return to the home view if we were the ones who moved.
  const explodeFit = useRef({ target: 0, changedAt: 0, done: true, auto: false });
  useEffect(
    () =>
      useExplorer.subscribe((s, prev) => {
        if (s.explode !== prev.explode) {
          explodeFit.current.target = s.explode;
          explodeFit.current.changedAt = performance.now();
          explodeFit.current.done = false;
        }
      }),
    [],
  );

  useFrame((_, dt) => {
    const c = controls.current;
    if (!c) return;
    const ef = explodeFit.current;
    if (!ef.done && performance.now() - ef.changedAt > 250 && Math.abs(explodeProgress.value - ef.target) < 0.003) {
      ef.done = true;
      const root = modelRoot.current;
      if (root && ef.target > 0.05) {
        c.getPosition(tmpV);
        c.getTarget(tmpT);
        const dir = tmpV.clone().sub(tmpT).normalize();
        const fit = frame(root, dir);
        if (fit && (c.distance < fit.distance * 0.95 || tmpT.distanceTo(fit.center) > fit.distance * 0.2)) {
          const { center, distance } = fit;
          c.setLookAt(center.x + dir.x * distance, center.y + dir.y * distance, center.z + dir.z * distance, center.x, center.y, center.z, true);
          ef.auto = true;
        }
      } else if (ef.auto && home.current) {
        const h = home.current;
        c.setLookAt(h.pos.x, h.pos.y, h.pos.z, h.target.x, h.target.y, h.target.z, true);
        ef.auto = false;
      }
    }
    if (autoRotate) c.rotate(dt * 0.18, 0, false);
    // Keep depth precision good from 2 mm to 2 m away.
    const d = c.distance;
    const near = Math.min(Math.max(d / 400, 0.02), 20);
    const far = d * 20 + device.size * 10;
    if (Math.abs(camera.near - near) / near > 0.15 || Math.abs(camera.far - far) / far > 0.15) {
      camera.near = near;
      camera.far = far;
      camera.updateProjectionMatrix();
    }
  });

  return (
    <CameraControls
      ref={controls}
      makeDefault
      minDistance={device.size * 0.012}
      maxDistance={device.size * 6}
      smoothTime={0.35}
      draggingSmoothTime={0.08}
      dollyToCursor
      maxPolarAngle={Math.PI * 0.97}
    />
  );
}

function Effects({ size, high }: { size: number; high: boolean }) {
  const hoveredId = useExplorer((s) => s.hoveredId);
  const selectedId = useExplorer((s) => s.selectedId);
  const nodes = useExplorer((s) => s.nodes);
  const [hoverMeshes, setHoverMeshes] = useState<ReturnType<typeof meshesOf>>([]);
  const selectedMeshes = useMemo(
    () => meshesOf(selectedId),
    // nodes: re-resolve after the model (re)mounts
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedId, nodes],
  );
  useEffect(() => {
    setHoverMeshes(hoveredId && hoveredId !== selectedId ? meshesOf(hoveredId) : []);
  }, [hoveredId, selectedId, nodes]);

  return (
    // Conditional effects are wrapped in fragments: EffectComposer's children
    // type only accepts elements, not `false`.
    <EffectComposer autoClear={false} multisampling={high ? 4 : 0}>
      <>{high ? <N8AO aoRadius={size * 0.018} distanceFalloff={1} intensity={2.2} quality="high" /> : null}</>
      <Outline
        selection={hoverMeshes}
        selectionLayer={10}
        visibleEdgeColor={0xe2e8f0}
        hiddenEdgeColor={0x1e293b}
        edgeStrength={2.2}
        kernelSize={KernelSize.VERY_SMALL}
        blur
        xRay={false}
      />
      <Outline
        selection={selectedMeshes}
        selectionLayer={11}
        visibleEdgeColor={0x38bdf8}
        hiddenEdgeColor={0x0e5a85}
        edgeStrength={4}
        kernelSize={KernelSize.SMALL}
        blur
        xRay
      />
      <Bloom luminanceThreshold={1.1} luminanceSmoothing={0.2} mipmapBlur intensity={0.55} />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      <>{high ? null : <SMAA />}</>
      <Vignette offset={0.32} darkness={0.55} />
    </EffectComposer>
  );
}
