#!/usr/bin/env node
/**
 * End-to-end smoke test: loads every route in headless Chromium, exercises the
 * main interactions, and fails on page errors or console errors.
 *
 *   node scripts/smoke.mjs [--base http://localhost:4174]
 */
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0";
const { chromium } = await import("playwright");

const i = process.argv.indexOf("--base");
const base = i > 0 ? process.argv[i + 1] : process.env.SHOT_BASE ?? "http://localhost:4174";

const IGNORE = [/THREE\.Clock: This module has been deprecated/, /GPU stall due to ReadPixels/, /Download the React DevTools/];

const DEVICES = ["gpu", "cpu", "ram", "ssd", "hdd", "raspberry-pi"];

const browser = await chromium.launch({ headless: true, args: ["--use-angle=vulkan", "--enable-features=Vulkan", "--ignore-gpu-blocklist"] });
let failures = 0;

async function check(path, exercise) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (!IGNORE.some((r) => r.test(t))) errors.push(`console: ${t}`);
  });
  const t0 = Date.now();
  try {
    const res = await page.goto(base + path, { waitUntil: "load", timeout: 120000 });
    if (!res || !res.ok()) errors.push(`HTTP ${res?.status()}`);
    await page.waitForTimeout(6000);
    if (exercise) await exercise(page, errors);
  } catch (e) {
    errors.push(`exception: ${e.message}`);
  }
  const ms = Date.now() - t0;
  if (errors.length) {
    failures++;
    console.log(`✗ ${path} (${ms} ms)\n  ${errors.slice(0, 8).join("\n  ")}`);
  } else console.log(`✓ ${path} (${ms} ms)`);
  await page.close();
}

await check("/", async (page, errors) => {
  const r = await page.evaluate(() => ({
    logo: !!document.querySelector('svg[aria-label="visualiz3r"]'),
    options: document.querySelectorAll('nav[aria-label="Explore"] a').length,
    stars: document.querySelectorAll("canvas.supernova-background").length,
  }));
  if (!r.logo) errors.push("logo missing");
  if (r.options !== 7) errors.push(`${r.options} options on the home page`);
  if (r.stars !== 1) errors.push(`${r.stars} star backgrounds`);
});
for (const d of DEVICES) {
  await check(`/hardware/${d}`, async (page, errors) => {
    const r = await page.evaluate(async () => {
      const s = window.__explorer.getState();
      const parts = Object.keys(s.nodes).length;
      s.setExplode(1);
      await new Promise((ok) => setTimeout(ok, 2500));
      const ids = Object.keys(window.__explorer.getState().nodes);
      window.__explorer.getState().select(ids[ids.length - 1], "focus");
      await new Promise((ok) => setTimeout(ok, 1500));
      s.toggleXray();
      s.toggleLabels();
      await new Promise((ok) => setTimeout(ok, 800));
      s.setExplode(0);
      await new Promise((ok) => setTimeout(ok, 1500));

      // Zoom to the smallest visible part: it must land between the side
      // panels, big enough to see (this once flew small parts off-screen).
      const { scene, camera } = window.__three;
      const objs = {};
      scene.traverse((o) => {
        if (o.userData?.partId) objs[o.userData.partId] = o;
      });
      const shown = (o) => {
        for (let p = o; p; p = p.parent) if (!p.visible) return false;
        return true;
      };
      const boxOf = (o) => {
        let box = null;
        o.updateMatrixWorld(true);
        o.traverseVisible((m) => {
          if (!m.isMesh || !m.geometry) return;
          if (m.isInstancedMesh) m.computeBoundingBox();
          else if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
          const b = (m.isInstancedMesh ? m.boundingBox : m.geometry.boundingBox).clone().applyMatrix4(m.matrixWorld);
          box = box ? box.union(b) : b;
        });
        return box;
      };
      let small = null;
      for (const [id, o] of Object.entries(objs)) {
        const b = shown(o) ? boxOf(o) : null;
        if (!b || b.isEmpty()) continue;
        const size = b.getSize(camera.position.clone()).length();
        if (size > 0.5 && (!small || size < small.size)) small = { id, size };
      }
      window.__explorer.getState().select(small.id, "focus");
      await new Promise((ok) => setTimeout(ok, 2500));
      const b = boxOf(objs[small.id]);
      const xs = [];
      const ys = [];
      for (let i = 0; i < 8; i++) {
        const p = camera.position.clone().set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).project(camera);
        xs.push(((p.x + 1) / 2) * innerWidth);
        ys.push(((1 - p.y) / 2) * innerHeight);
      }
      const focus = {
        id: small.id,
        x: (Math.min(...xs) + Math.max(...xs)) / 2,
        y: (Math.min(...ys) + Math.max(...ys)) / 2,
        span: Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)),
      };
      return { parts, canvases: document.querySelectorAll("canvas").length, focus, width: innerWidth, height: innerHeight };
    });
    if (r.parts < 5) errors.push(`only ${r.parts} parts discovered`);
    if (r.canvases !== 1) errors.push(`${r.canvases} canvases`);
    const f = r.focus;
    const inGap = f.x > 312 && f.x < r.width - 412 && f.y > 60 && f.y < r.height - 90;
    if (!inGap || f.span < 80) {
      errors.push(`zoom to "${f.id}" put it at (${f.x.toFixed(0)}, ${f.y.toFixed(0)}), ${f.span.toFixed(0)} px across`);
    }
  });
}
await check("/llm", async (page, errors) => {
  const r = await page.evaluate(async () => {
    const s = window.__llm.getState();
    const before = s.tokens.length;
    for (let k = 0; k < 18; k++) {
      window.__llm.getState().setTour(k);
      await new Promise((ok) => setTimeout(ok, 150));
    }
    window.__llm.getState().setTour(null);
    window.__llm.getState().generateNext();
    await new Promise((ok) => setTimeout(ok, 1500));
    window.__llm.getState().select({ kind: "slab", id: "L2.attn.q", cell: [1, 3] });
    await new Promise((ok) => setTimeout(ok, 500));
    return { status: s.status, before, after: window.__llm.getState().tokens.length };
  });
  if (r.status !== "ready") errors.push(`status ${r.status}`);
  if (r.after !== r.before + 1) errors.push(`generation did not add a token (${r.before} → ${r.after})`);
});

await browser.close();
console.log(failures ? `\n${failures} route(s) failed` : "\nall routes passed");
process.exit(failures ? 1 : 0);
