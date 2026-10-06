import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { BpeTokenizer, forward, loadModel, type ModelJson, type TokenizerJson } from "../lib/llm/index";
import { computeAllSlabData, valueAt } from "../lib/llm/viz/data";
import { dotTerms, matmulOperands } from "../lib/llm/viz/explain";
import { computeLayout } from "../lib/llm/viz/layout";
import { TOUR, slabBox } from "../lib/llm/viz/tour";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p));
const binBuf = read("public/llm/model.bin");
const model = loadModel(
  JSON.parse(read("public/llm/model.json").toString("utf8")) as ModelJson,
  binBuf.buffer.slice(binBuf.byteOffset, binBuf.byteOffset + binBuf.byteLength) as ArrayBuffer,
);
const tok = BpeTokenizer.fromJSON(JSON.parse(read("public/llm/tokenizer.json").toString("utf8")) as TokenizerJson);

function setup(prompt: string) {
  const tokens = tok.encode(prompt, { addBos: true });
  const trace = forward(model, tokens);
  const layout = computeLayout(model.config, tokens.length);
  const data = computeAllSlabData(layout.slabs, model, trace);
  return { tokens, trace, layout, data };
}

test("every slab has unique id and data of the declared shape", () => {
  const { layout, data } = setup("Once upon a time, there was a little");
  const ids = new Set<string>();
  for (const s of layout.slabs) {
    assert.ok(!ids.has(s.id), `duplicate slab id ${s.id}`);
    ids.add(s.id);
    const d = data.get(s.id)!;
    assert.equal(d.rows, s.rows, `${s.id} rows`);
    assert.equal(d.cols, s.cols, `${s.id} cols`);
    assert.equal(d.values.length, s.rows * s.cols, `${s.id} length`);
  }
});

test("no two slabs overlap in the same depth plane", () => {
  for (const prompt of ["Hi", "Once upon a time, there was a little", "Tom and his dog went to the park. They played all day and then went home to eat"]) {
    const { layout } = setup(prompt);
    const rects = layout.slabs.map((s) => ({
      id: s.id,
      z: s.z,
      x0: s.x,
      x1: s.x + s.cols * s.cellW,
      y0: s.y - s.rows * s.cellH,
      y1: s.y,
    }));
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        if (Math.abs(a.z - b.z) > 0.5) continue;
        const overlap = a.x0 < b.x1 - 0.01 && b.x0 < a.x1 - 0.01 && a.y0 < b.y1 - 0.01 && b.y0 < a.y1 - 0.01;
        assert.ok(!overlap, `${a.id} overlaps ${b.id} (T=${layout.T})`);
      }
  }
});

test("dot-product breakdowns sum to the displayed value", () => {
  const { layout, data } = setup("Lily wanted to play with her red ball");
  const outputs = layout.slabs.filter((s) => matmulOperands(s.id));
  assert.ok(outputs.length >= 4 * (7 + 8), "expected matmul outputs in every block");
  for (const s of outputs) {
    const d = data.get(s.id)!;
    for (const [r, c] of [
      [0, 0],
      [s.rows - 1, s.cols - 1],
      [Math.floor(s.rows / 2), Math.floor(s.cols / 3)],
    ]) {
      const v = valueAt(d, r, c);
      if (!Number.isFinite(v)) continue; // masked attention entry
      const terms = dotTerms(s, data, r, c);
      assert.ok(terms, `no terms for ${s.id}`);
      const tol = 1e-3 * Math.max(1, Math.abs(v));
      assert.ok(Math.abs(terms!.sum - v) < tol, `${s.id}[${r},${c}]: sum ${terms!.sum} vs value ${v}`);
    }
  }
});

test("attention rows are causal and sum to one", () => {
  const { layout, data } = setup("The cat sat on the mat");
  for (const s of layout.slabs.filter((x) => x.kind === "probs")) {
    const d = data.get(s.id)!;
    for (let i = 0; i < d.rows; i++) {
      let sum = 0;
      for (let j = 0; j < d.cols; j++) {
        const p = valueAt(d, i, j);
        if (j > i) assert.ok(Number.isNaN(p), `${s.id} future entry visible`);
        else sum += p;
      }
      assert.ok(Math.abs(sum - 1) < 1e-4, `${s.id} row ${i} sums to ${sum}`);
    }
  }
});

test("every tour step frames a finite region and focuses existing elements", () => {
  const { layout } = setup("Once upon a time, there was a little");
  const ids = new Set([...layout.slabs.map((s) => s.id), ...layout.ops.map((o) => o.id), ...layout.skips.map((s) => s.id), ...layout.returns.map((r) => r.id), ...layout.modules.map((m) => m.id)]);
  for (const step of TOUR) {
    const box = step.frame(layout);
    for (const v of [...box.min, ...box.max]) assert.ok(Number.isFinite(v), `${step.id} frame not finite`);
    for (let k = 0; k < 3; k++) assert.ok(box.max[k] >= box.min[k], `${step.id} frame inverted`);
    const focus = step.focus(layout);
    if (!focus) continue;
    for (const f of focus) {
      if (f.startsWith("step:") || f.startsWith("layer:") || f === "tokens") continue;
      assert.ok(ids.has(f), `${step.id} focuses unknown element ${f}`);
    }
  }
  assert.ok(Number.isFinite(slabBox(layout, ["L0.x"]).min[0]));
});
