import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, type RefObject } from "react";
import type { PerspectiveCamera } from "three";
import type CameraControlsImpl from "camera-controls";

type Dolly = (delta: number, x: number, y: number) => void;

/**
 * Shifts the rendered picture by a number of screen pixels (positive `x`
 * moves it left, positive `y` up) without moving the camera, so the orbit
 * target sits centred in the space left free by UI panels. Unlike a
 * world-space focal offset this is the same size at every zoom level. Changes
 * glide over a few hundred milliseconds, so the scene eases aside when a panel
 * opens. Scroll-to-cursor zoom is corrected to match.
 */
export function useViewShift(controls: RefObject<CameraControlsImpl | null>, x: number, y: number) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const target = useRef({ x, y });
  const shift = useRef({ x: 0, y: 0, width: 1, height: 1, applied: false });
  target.current = { x, y };

  const apply = () => {
    const s = shift.current;
    if (Math.abs(s.x) < 0.25 && Math.abs(s.y) < 0.25) camera.clearViewOffset();
    else camera.setViewOffset(s.width, s.height, s.x, s.y, s.width, s.height);
  };

  // Start at the requested shift; afterwards glide towards it.
  useEffect(() => {
    const s = shift.current;
    s.width = width;
    s.height = height;
    if (!s.applied) {
      s.x = target.current.x;
      s.y = target.current.y;
      s.applied = true;
    }
    apply();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, width, height]);

  useFrame((_, dt) => {
    const s = shift.current;
    const t = target.current;
    if (Math.abs(t.x - s.x) < 0.25 && Math.abs(t.y - s.y) < 0.25) return;
    const k = 1 - Math.exp(-Math.min(dt, 0.1) * 9);
    s.x += (t.x - s.x) * k;
    s.y += (t.y - s.y) * k;
    if (Math.abs(t.x - s.x) < 0.25) s.x = t.x;
    if (Math.abs(t.y - s.y) < 0.25) s.y = t.y;
    apply();
  });

  useEffect(() => () => camera.clearViewOffset(), [camera]);

  // camera-controls zooms towards the cursor assuming the target projects to
  // the middle of the canvas; with the picture shifted it is x, y px away.
  useEffect(() => {
    const c = controls.current as unknown as { _dollyInternal?: Dolly } | null;
    if (!c || typeof c._dollyInternal !== "function") return;
    const inner = c._dollyInternal;
    c._dollyInternal = (delta, nx, ny) => {
      const s = shift.current;
      inner(delta, nx + (2 * s.x) / s.width, ny - (2 * s.y) / s.height);
    };
    return () => {
      c._dollyInternal = inner;
    };
  }, [controls]);
}
