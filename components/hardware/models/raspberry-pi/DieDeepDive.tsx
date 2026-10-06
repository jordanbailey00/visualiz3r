"use client";

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Euler,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
} from "three";
import { Part } from "../../Part";
import { explodeProgress } from "../../explode";
import { FONT_SANS } from "@/lib/three/painter";
import { cached, roundedBox } from "../../kit/geometry";
import { MAT } from "../../kit/materials";
import { DIE_H, DIE_W, FLOORPLAN, floorplanMaterial, type FloorBlock } from "./dieFloorplan";
import { SOC } from "./layout";
import { decalUp, paintedMaterial } from "./paint";

/** Magnification of the deep-dive view. */
const MAG = 5.5;
/** Thickness of the magnified base slab and the raised tiles (die mm). */
const SLAB_T = 0.22;
const TILE_T = 0.035;

/**
 * Final pose of the magnified die relative to the real die's centre: up and
 * to the right of the SoC, tilted toward the default camera.
 */
const FINAL = {
  position: new Vector3(29, 35, -31),
  rotation: new Euler(0.9, -0.38, 0, "YXZ"),
};
/** Explode range over which the view grows out of the die. */
const RANGE: [number, number] = [0.66, 0.98];

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * One floorplan tile: a raised block whose top face samples its own region of
 * the labelled die texture (side faces sample the region's border).
 */
function tileGeometry(b: FloorBlock) {
  return cached(`pi5-tile:${b.part}:${b.x}:${b.y}:${b.w}:${b.h}:${b.raise ?? 0}`, () => {
    const x0 = b.x - DIE_W / 2;
    const x1 = x0 + b.w;
    const z0 = b.y - DIE_H / 2;
    const z1 = z0 + b.h;
    const y0 = 0;
    const y1 = TILE_T + (b.raise ?? 0);
    const u = (x: number) => (x + DIE_W / 2) / DIE_W;
    const v = (z: number) => 1 - (z + DIE_H / 2) / DIE_H;
    const pos: number[] = [];
    const uv: number[] = [];
    const quad = (p: number[][], t: number[][]) => {
      // Two triangles: 0-1-2, 0-2-3.
      for (const i of [0, 1, 2, 0, 2, 3]) {
        pos.push(...p[i]);
        uv.push(...t[i]);
      }
    };
    // Top (+Y), wound counter-clockwise seen from above.
    quad(
      [
        [x0, y1, z0],
        [x0, y1, z1],
        [x1, y1, z1],
        [x1, y1, z0],
      ],
      [
        [u(x0), v(z0)],
        [u(x0), v(z1)],
        [u(x1), v(z1)],
        [u(x1), v(z0)],
      ],
    );
    // Sides: stretch the border pixels down the walls.
    const e = 0.01;
    quad(
      [
        [x0, y0, z1],
        [x1, y0, z1],
        [x1, y1, z1],
        [x0, y1, z1],
      ],
      [
        [u(x0), v(z1 - e)],
        [u(x1), v(z1 - e)],
        [u(x1), v(z1 - e)],
        [u(x0), v(z1 - e)],
      ],
    );
    quad(
      [
        [x1, y0, z0],
        [x0, y0, z0],
        [x0, y1, z0],
        [x1, y1, z0],
      ],
      [
        [u(x1), v(z0 + e)],
        [u(x0), v(z0 + e)],
        [u(x0), v(z0 + e)],
        [u(x1), v(z0 + e)],
      ],
    );
    quad(
      [
        [x1, y0, z1],
        [x1, y0, z0],
        [x1, y1, z0],
        [x1, y1, z1],
      ],
      [
        [u(x1 - e), v(z1)],
        [u(x1 - e), v(z0)],
        [u(x1 - e), v(z0)],
        [u(x1 - e), v(z1)],
      ],
    );
    quad(
      [
        [x0, y0, z0],
        [x0, y0, z1],
        [x0, y1, z1],
        [x0, y1, z0],
      ],
      [
        [u(x0 + e), v(z0)],
        [u(x0 + e), v(z1)],
        [u(x0 + e), v(z1)],
        [u(x0 + e), v(z0)],
      ],
    );
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute("uv", new BufferAttribute(new Float32Array(uv), 2));
    g.computeVertexNormals();
    return g;
  });
}

function Tiles({ part }: { part: string }) {
  const mat = floorplanMaterial();
  return (
    <>
      {FLOORPLAN.filter((b) => b.part === part).map((b, i) => (
        <mesh key={i} geometry={tileGeometry(b)} material={mat} position-y={b.raise ? TILE_T : 0} castShadow receiveShadow />
      ))}
    </>
  );
}

/** Top decal of the magnified slab: the whole labelled die (interconnect between tiles). */
function slabTop() {
  return cached("pi5-slab-top", () => {
    const g = new BufferGeometry();
    const x0 = -DIE_W / 2;
    const x1 = DIE_W / 2;
    const z0 = -DIE_H / 2;
    const z1 = DIE_H / 2;
    const pos = [x0, 0, z0, x0, 0, z1, x1, 0, z1, x0, 0, z0, x1, 0, z1, x1, 0, z0];
    const uv = [0, 1, 0, 0, 1, 0, 0, 1, 1, 0, 1, 1];
    g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute("uv", new BufferAttribute(new Float32Array(uv), 2));
    g.computeVertexNormals();
    return g;
  });
}

/** Caption strip along the front edge of the magnified die. */
const CAPTION = { d: 0.66, gap: 0.08 };

function captionMaterial() {
  const m = paintedMaterial("die-caption", DIE_W, CAPTION.d, 220, { color: "#0b1220", rough: 0.6, metal: 0, height: 0.5 }, (p) => {
    p.rect(0, 0, 0.05, CAPTION.d, { color: "#38bdf8", rough: 0.5, metal: 0 });
    p.text("BCM2712 silicon die · magnified 5.5×", 0.2, CAPTION.d * 0.36, 0.25, { color: "#f1f5f9", rough: 0.5, metal: 0 }, { baseline: "middle", font: FONT_SANS, weight: 700 });
    p.text("Simplified floorplan — real die 8.63 × 6.47 mm; click a block to learn what it does", 0.2, CAPTION.d * 0.74, 0.15, { color: "#94a3b8", rough: 0.5, metal: 0 }, { baseline: "middle", font: FONT_SANS, weight: 600 });
  }, { emissive: "#ffffff", emissiveIntensity: 0.3, bumpScale: 0 });
  // Self-lit so it stays legible in shadow (the emissive follows the painted map).
  m.emissiveMap = m.map;
  return m;
}

const lineMat = new MeshBasicMaterial({ color: "#7dd3fc", transparent: true, opacity: 0.5, depthWrite: false });
const lineGeo = (() => {
  const g = new BoxGeometry(1, 1, 1);
  g.translate(0, 0.5, 0);
  return g;
})();
const tmpA = new Vector3();
const tmpB = new Vector3();
const tmpDir = new Vector3();
const tmpQ = new Quaternion();
const tmpM = new Matrix4();
const tmpS = new Vector3();
const UP = new Vector3(0, 1, 0);
const noRaycast = () => {};

/**
 * Magnified, labelled floorplan of the BCM2712 die. It lives inside the die's
 * own Part (so the tree reads SoC › die › CPU cores…), stays hidden inside the
 * die until late in the explode, then grows out to MAG× and floats above the
 * board, joined to the real die by four leader lines.
 */
export function DieDeepDive() {
  const view = useRef<Group>(null);
  const lines = useRef<InstancedMesh>(null);
  const last = useRef(-1);

  useLayoutEffect(() => {
    if (lines.current) lines.current.raycast = noRaycast;
  }, []);

  const corners = useMemo(() => {
    const { w, t, d } = SOC.die;
    const die = [
      new Vector3(-w / 2, t / 2, -d / 2),
      new Vector3(w / 2, t / 2, -d / 2),
      new Vector3(w / 2, t / 2, d / 2),
      new Vector3(-w / 2, t / 2, d / 2),
    ];
    const slab = [
      new Vector3(-DIE_W / 2, -SLAB_T, -DIE_H / 2),
      new Vector3(DIE_W / 2, -SLAB_T, -DIE_H / 2),
      new Vector3(DIE_W / 2, -SLAB_T, DIE_H / 2),
      new Vector3(-DIE_W / 2, -SLAB_T, DIE_H / 2),
    ];
    return { die, slab };
  }, []);

  useFrame(() => {
    const g = view.current;
    const l = lines.current;
    if (!g || !l) return;
    const e = explodeProgress.value;
    if (Math.abs(e - last.current) < 1e-5) return;
    last.current = e;
    const t = smoothstep(RANGE[0], RANGE[1], e);
    const shown = t > 0.002;
    g.visible = shown;
    l.visible = t > 0.06;
    if (!shown) {
      g.position.set(0, 0, 0);
      g.scale.setScalar(0.02);
      return;
    }
    // Grow first, then settle into the tilted pose.
    const s = 0.02 + (MAG - 0.02) * Math.pow(t, 1.4);
    g.position.copy(FINAL.position).multiplyScalar(t);
    g.rotation.set(FINAL.rotation.x * t, FINAL.rotation.y * t, 0, "YXZ");
    g.scale.setScalar(s);
    g.updateMatrix();
    for (let i = 0; i < 4; i++) {
      tmpA.copy(corners.die[i]);
      tmpB.copy(corners.slab[i]).applyMatrix4(g.matrix);
      tmpDir.subVectors(tmpB, tmpA);
      const len = tmpDir.length();
      tmpQ.setFromUnitVectors(UP, tmpDir.normalize());
      tmpS.set(0.09, len, 0.09);
      tmpM.compose(tmpA, tmpQ, tmpS);
      l.setMatrixAt(i, tmpM);
    }
    l.instanceMatrix.needsUpdate = true;
    l.computeBoundingSphere();
  });

  return (
    <Part id="die-floorplan">
      <group ref={view} visible={false} scale={0.02}>
        {/* Silicon slab with the full labelled floorplan on top. */}
        <mesh geometry={roundedBox(DIE_W, SLAB_T, DIE_H, 0.02)} material={MAT.silicon} position-y={-SLAB_T / 2} castShadow receiveShadow />
        <mesh geometry={slabTop()} material={floorplanMaterial()} position-y={0.001} />
        {/* Caption strip on the front edge */}
        <mesh geometry={roundedBox(DIE_W, 0.06, CAPTION.d, 0.02)} material={MAT.plasticSatin} position={[0, -0.03, DIE_H / 2 + CAPTION.gap + CAPTION.d / 2]} />
        <mesh geometry={decalUp(DIE_W - 0.02, CAPTION.d - 0.02)} material={captionMaterial()} position={[0, 0.002, DIE_H / 2 + CAPTION.gap + CAPTION.d / 2]} />
        <Part id="die-cpu">
          <Part id="die-cpu-cores">
            <Tiles part="die-cpu-cores" />
            <Part id="die-l1">
              <Tiles part="die-l1" />
            </Part>
          </Part>
          <Part id="die-l2">
            <Tiles part="die-l2" />
          </Part>
          <Part id="die-l3">
            <Tiles part="die-l3" />
          </Part>
        </Part>
        <Part id="die-gpu">
          <Tiles part="die-gpu" />
        </Part>
        <Part id="die-hevc">
          <Tiles part="die-hevc" />
        </Part>
        <Part id="die-isp">
          <Tiles part="die-isp" />
        </Part>
        <Part id="die-memory">
          <Tiles part="die-memory" />
        </Part>
        <Part id="die-pcie">
          <Tiles part="die-pcie" />
        </Part>
        <Part id="die-display">
          <Tiles part="die-display" />
        </Part>
        <Part id="die-io">
          <Tiles part="die-io" />
        </Part>
        <Part id="die-system">
          <Tiles part="die-system" />
        </Part>
        <Part id="die-dark-silicon">
          <Tiles part="die-dark-silicon" />
        </Part>
      </group>
      <instancedMesh ref={lines} args={[lineGeo, lineMat, 4]} visible={false} frustumCulled={false} />
    </Part>
  );
}
