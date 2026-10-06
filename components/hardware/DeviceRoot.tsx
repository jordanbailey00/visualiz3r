"use client";

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import type { Group } from "three";
import { useExplorer } from "@/lib/hardware/store";
import { applyVisualState, discoverParts, modelRoot } from "./sceneState";

/**
 * Wraps a device model: discovers its <Part> hierarchy once mounted and keeps
 * focus/X-ray/hidden visual modes in sync with the explorer store.
 */
export function DeviceRoot({ children }: { children: ReactNode }) {
  const ref = useRef<Group>(null);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    modelRoot.current = root;
    const { nodes, rootIds } = discoverParts(root);
    useExplorer.getState().setTree(nodes, rootIds);
    return () => {
      if (modelRoot.current === root) modelRoot.current = null;
    };
  }, []);

  useEffect(() => {
    const apply = () => {
      const root = ref.current;
      if (!root) return;
      const s = useExplorer.getState();
      applyVisualState(root, s);
    };
    apply();
    return useExplorer.subscribe((s, prev) => {
      if (
        s.selectedId !== prev.selectedId ||
        s.focusMode !== prev.focusMode ||
        s.xray !== prev.xray ||
        s.hidden !== prev.hidden ||
        s.nodes !== prev.nodes
      ) {
        apply();
      }
    });
  }, []);

  return <group ref={ref}>{children}</group>;
}
