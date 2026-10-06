"use client";

import { useEffect } from "react";
import { mountSupernova } from "./supernova/index.js";
import "./supernova/style.css";

/** Mounts the rotating star field behind the page; removed again on navigation. */
export function SupernovaBackground() {
  useEffect(() => {
    document.body.classList.add("supernova-page");
    let background: { dispose(): void } | null = null;
    try {
      background = mountSupernova();
    } catch (error) {
      // No WebGL: the page still works on its black background.
      console.warn("Star background unavailable", error);
    }
    return () => {
      background?.dispose();
      document.body.classList.remove("supernova-page");
    };
  }, []);
  return null;
}
