#!/usr/bin/env node
/**
 * Headless screenshot helper for checking 3D scenes.
 *
 *   node scripts/screenshot.mjs <path-or-url> [out.png] [options]
 *
 * Options:
 *   --size 1600x1000     viewport (default 1600x1000)
 *   --wait 3000          ms to wait after load before capturing (default 3500)
 *   --eval "<js>"        run JS in the page before capturing (may return a promise)
 *   --then-wait 1500     ms to wait after --eval (default 1200)
 *   --base http://localhost:4173
 *   --gl swiftshader     force software WebGL (default tries the GPU first)
 *   --mouse 800,500      move the pointer there and print what is hovered
 *
 * Prints console errors from the page. Screenshots default to .screenshots/.
 */
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

// Browsers live in node_modules (installed with PLAYWRIGHT_BROWSERS_PATH=0).
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0";
const { chromium } = await import("playwright");

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const size = opt("size", "1600x1000");
const wait = Number(opt("wait", "3500"));
const evalJs = opt("eval", null);
const thenWait = Number(opt("then-wait", "1200"));
const base = opt("base", process.env.SHOT_BASE ?? "http://localhost:4174");
const gl = opt("gl", "gpu");
const mouse = opt("mouse", null);
const [target = "/", outArg] = args;
const url = /^https?:/.test(target) ? target : base + target;
const out = resolve(outArg ?? `.screenshots/${target.replace(/[^a-z0-9]+/gi, "_") || "home"}.png`);
const [w, h] = size.split("x").map(Number);

const glArgs =
  gl === "swiftshader"
    ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
    : ["--use-angle=vulkan", "--enable-features=Vulkan", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"];

const browser = await chromium.launch({ headless: true, args: glArgs });
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
const errors = [];
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") errors.push(`[${m.type()}] ${m.text()}`);
});
page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`));

await page.goto(url, { waitUntil: "load", timeout: 120000 });
await page.waitForTimeout(wait);
const renderer = await page.evaluate(() => {
  const c = document.createElement("canvas").getContext("webgl2");
  if (!c) return "no webgl2";
  const ext = c.getExtension("WEBGL_debug_renderer_info");
  return ext ? c.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unknown";
});
if (evalJs) {
  const r = await page.evaluate(`(async () => { ${evalJs} })()`);
  if (r !== undefined) console.log("eval:", JSON.stringify(r));
  await page.waitForTimeout(thenWait);
}
if (mouse) {
  const [mx, my] = mouse.split(",").map(Number);
  await page.mouse.move(mx - 5, my - 5);
  await page.mouse.move(mx, my, { steps: 4 });
  await page.waitForTimeout(600);
  const hovered = await page.evaluate(() => {
    const w = window;
    return w.__explorer?.getState().hoveredId ?? JSON.stringify(w.__llm?.getState().hovered ?? null);
  });
  console.log("hovered:", hovered);
}
mkdirSync(dirname(out), { recursive: true });
await page.screenshot({ path: out });
console.log(`saved ${out}  (renderer: ${renderer})`);
if (errors.length) console.log(errors.slice(0, 30).join("\n"));
await browser.close();
