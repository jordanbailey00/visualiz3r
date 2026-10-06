import { Box3, Vector3, type InstancedMesh, type Material, type Mesh, type Object3D } from "three";

const meshBox = new Box3();
const corners: Vector3[] = [];

function shown(material: Material | Material[] | undefined) {
  if (!material) return true;
  return Array.isArray(material) ? material.some((m) => m.visible) : material.visible;
}

/**
 * World-space bounding-box corners of every visible mesh under `root`. Fitting
 * to these rather than to one box around everything keeps sparse layouts (an
 * exploded view, a deep dive floating above the board) snug, and ignores
 * hidden or collapsed pieces. The returned array is reused between calls.
 */
export function visibleCorners(root: Object3D) {
  corners.length = 0;
  root.updateWorldMatrix(true, true);
  root.traverseVisible((o) => {
    const m = o as Mesh;
    if (!m.geometry || !(m.isMesh || (o as { isLine?: boolean }).isLine)) return;
    if (!shown(m.material)) return;
    const im = m as unknown as InstancedMesh;
    if (im.isInstancedMesh) {
      if (im.count === 0) return;
      im.computeBoundingBox();
      meshBox.copy(im.boundingBox!);
    } else {
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      meshBox.copy(m.geometry.boundingBox!);
    }
    if (meshBox.isEmpty()) return;
    for (let i = 0; i < 8; i++) {
      corners.push(
        new Vector3(
          i & 1 ? meshBox.max.x : meshBox.min.x,
          i & 2 ? meshBox.max.y : meshBox.min.y,
          i & 4 ? meshBox.max.z : meshBox.min.z,
        ).applyMatrix4(m.matrixWorld),
      );
    }
  });
  return corners;
}

export interface FitOptions {
  /** Vertical field of view in degrees. */
  fov: number;
  /** Viewport size in pixels. */
  width: number;
  height: number;
  /** Fraction of the viewport width the content may use (side panels). */
  freeWidth?: number;
  /** Fraction of the viewport height the content may use. */
  freeHeight?: number;
  /** Breathing room: 1.15 leaves the content at 87% of the free area. */
  margin?: number;
}

/**
 * Target and camera distance that frame `points` when looking along `dir`
 * (unit vector from target to camera). Exact for a perspective camera: each
 * point is tested at its own depth, so near corners of a deep scene are not
 * clipped and far ones do not inflate the distance.
 */
export function fitView(points: readonly Vector3[], dir: Vector3, opts: FitOptions) {
  const n = points.length;
  if (n === 0) return null;
  const { fov, width, height, freeWidth = 1, freeHeight = 1, margin = 1.15 } = opts;
  const tanHalf = Math.tan((fov * Math.PI) / 360);
  const tanV = (tanHalf * freeHeight) / margin;
  const tanH = (tanHalf * (width / height) * freeWidth) / margin;
  const right = new Vector3().crossVectors(new Vector3(0, 1, 0), dir);
  if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
  right.normalize();
  const up = new Vector3().crossVectors(dir, right).normalize();

  // Every point in the view basis: across, up, and towards the camera.
  const a = new Float64Array(n);
  const b = new Float64Array(n);
  const d = new Float64Array(n);
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) {
    a[i] = points[i].dot(right);
    b[i] = points[i].dot(up);
    d[i] = points[i].dot(dir);
    lo[0] = Math.min(lo[0], a[i]);
    hi[0] = Math.max(hi[0], a[i]);
    lo[1] = Math.min(lo[1], b[i]);
    hi[1] = Math.max(hi[1], b[i]);
    lo[2] = Math.min(lo[2], d[i]);
    hi[2] = Math.max(hi[2], d[i]);
  }

  let ca = (lo[0] + hi[0]) / 2;
  let cb = (lo[1] + hi[1]) / 2;
  const cd = (lo[2] + hi[2]) / 2;
  let distance = 0;
  // Fit, re-centre on the perspective-projected extent, then fit again.
  for (let pass = 0; pass < 2; pass++) {
    distance = 0;
    for (let i = 0; i < n; i++) {
      const z = d[i] - cd;
      distance = Math.max(distance, Math.abs(a[i] - ca) / tanH + z, Math.abs(b[i] - cb) / tanV + z);
    }
    if (pass === 1) break;
    let xLo = Infinity;
    let xHi = -Infinity;
    let yLo = Infinity;
    let yHi = -Infinity;
    for (let i = 0; i < n; i++) {
      const depth = distance - (d[i] - cd);
      xLo = Math.min(xLo, (a[i] - ca) / depth);
      xHi = Math.max(xHi, (a[i] - ca) / depth);
      yLo = Math.min(yLo, (b[i] - cb) / depth);
      yHi = Math.max(yHi, (b[i] - cb) / depth);
    }
    ca += ((xLo + xHi) / 2) * distance;
    cb += ((yLo + yHi) / 2) * distance;
  }
  const center = new Vector3().addScaledVector(right, ca).addScaledVector(up, cb).addScaledVector(dir, cd);
  return { center, distance };
}
