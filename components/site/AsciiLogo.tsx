import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Size of one character cell in SVG units (terminal proportions, 1:2). */
const CELL_W = 10;
const CELL_H = 20;

/**
 * The block-character logo from `logo.txt`, drawn as exact vector cells: █ is
 * a solid cell, ░ a light-shade stipple. Rendering the cells (rather than the
 * text) keeps every column aligned whatever fonts the visitor has. The file is
 * read when the page is built.
 */
export function AsciiLogo({ className }: { className?: string }) {
  const lines = readFileSync(join(process.cwd(), "logo.txt"), "utf8")
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ""));
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  while (lines.length && lines[0] === "") lines.shift();

  const solid: string[] = [];
  const shade: string[] = [];
  let cols = 0;
  lines.forEach((line, y) => {
    const chars = [...line];
    cols = Math.max(cols, chars.length);
    for (let x = 0; x < chars.length; ) {
      const ch = chars[x];
      let end = x + 1;
      while (end < chars.length && chars[end] === ch) end++;
      const run = `M${x * CELL_W} ${y * CELL_H}h${(end - x) * CELL_W}v${CELL_H}h${-(end - x) * CELL_W}z`;
      if (ch === "█") solid.push(run);
      else if (ch === "░") shade.push(run);
      x = end;
    }
  });

  return (
    <svg
      viewBox={`0 0 ${cols * CELL_W} ${lines.length * CELL_H}`}
      className={className}
      role="img"
      aria-label="visualiz3r"
      shapeRendering="crispEdges"
    >
      <defs>
        {/* ░ light shade: a quarter of each 2×2 block is lit, as in a terminal. */}
        <pattern id="ascii-shade" width="5" height="5" patternUnits="userSpaceOnUse">
          <rect width="2.5" height="2.5" fill="currentColor" />
        </pattern>
      </defs>
      <path d={shade.join("")} fill="url(#ascii-shade)" />
      <path d={solid.join("")} fill="currentColor" />
    </svg>
  );
}
