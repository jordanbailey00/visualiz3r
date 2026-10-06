/** Token text for the DOM UI: leading space as ␣, newline as ⏎, BOS as [start]. */
export function showTokenPlain(s: string) {
  if (s === "") return "[start]";
  return s.replace(/^ /, "␣").replace(/\n/g, "⏎");
}

export function fmt(v: number, digits = 3) {
  if (!Number.isFinite(v)) return "masked";
  const a = Math.abs(v);
  if (a !== 0 && (a < 0.001 || a >= 1e4)) return v.toExponential(2);
  return v.toFixed(digits);
}

export function pct(p: number, digits = 1) {
  return `${(p * 100).toFixed(digits)}%`;
}
