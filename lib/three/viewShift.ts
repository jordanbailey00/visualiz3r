import { useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import type { PerspectiveCamera } from "three";
import type CameraControlsImpl from "camera-controls";

type Dolly = (delta: number, x: number, y: number) => void;

/**
 * Shifts the rendered picture by a fixed number of screen pixels (positive `x`
 * moves it left, positive `y` up) without moving the camera, so the orbit
 * target sits centred in the space between UI panels. Unlike a world-space
 * focal offset this is the same size at every zoom level: it stays put whether
 * the whole board is framed or the camera is 15 mm from a single chip.
 */
export function useViewShift(controls: RefObject<CameraControlsImpl | null>, x: number, y: number) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const shift = useRef({ x: 0, y: 0, width: 1, height: 1 });

  useLayoutEffect(() => {
    shift.current = { x, y, width, height };
    if (x === 0 && y === 0) camera.clearViewOffset();
    else camera.setViewOffset(width, height, x, y, width, height);
  }, [camera, x, y, width, height]);

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
