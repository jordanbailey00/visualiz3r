"use client";

import { useEffect, useState } from "react";

/** Toggles presentation mode (all `.ui-chrome` hidden) with H or `?clean`. */
export function PresentationMode() {
  useEffect(() => {
    const root = document.documentElement;
    if (new URLSearchParams(window.location.search).has("clean")) root.classList.add("ui-hidden");
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === "h" || e.key === "H") root.classList.toggle("ui-hidden");
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      root.classList.remove("ui-hidden");
    };
  }, []);
  return null;
}

/** True while presentation mode hides the UI (tracks the <html> class). */
export function useUiHidden() {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const update = () => setHidden(root.classList.contains("ui-hidden"));
    update();
    const obs = new MutationObserver(update);
    obs.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return hidden;
}

/** Non-reactive check, for use inside frame loops and callbacks. */
export function isUiHidden() {
  return typeof document !== "undefined" && document.documentElement.classList.contains("ui-hidden");
}
