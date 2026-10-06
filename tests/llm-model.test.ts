import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  BpeTokenizer,
  forward,
  generate,
  lastLogits,
  loadLlmAssets,
  loadModel,
  mulberry32,
  sampleToken,
  softmaxWithTemperature,
  tensorRow,
  type ForwardTrace,
  type LayerTrace,
  type ModelJson,
  type Tensor,
  type TokenizerJson,
} from "../lib/llm/index";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p));
const modelJson = JSON.parse(read("public/llm/model.json").toString("utf8")) as ModelJson;
const binBuf = read("public/llm/model.bin");
const bin = binBuf.buffer.slice(binBuf.byteOffset, binBuf.byteOffset + binBuf.byteLength) as ArrayBuffer;
const tok = BpeTokenizer.fromJSON(JSON.parse(read("public/llm/tokenizer.json").toString("utf8")) as TokenizerJson);
const model = loadModel(modelJson, bin);

type Rows = Record<string, number[]>;
interface LayerFx {
  attnNormRms: number[];
  mlpNormRms: number[];
  lastRow: Rows;
  firstRow: Rows;
  scoresLastRow: number[][];
  probsLastRow: number[][];
  headOutLast: number[][];
}
interface PromptFx {
  text: string;
  normalized: string;
  ids: number[];
  pieces: string[];
  T: number;
  embeddingsLast: number[];
  finalNormRms: number[];
  finalNormedLast: number[];
  logitsLast: number[];
  logitsFirst: number[];
  probsTop10: [number, number][];
  layer0Probs: number[][][];
  layer0QRotLast: number[];
  lastLayerOutputLast: number[];
  layers: LayerFx[];
  greedy: { ids: number[]; margins: number[]; text: string };
}
const fx = JSON.parse(read("tests/fixtures/llm-reference.json").toString("utf8")) as {
  model_bin_sha256: string;
  tolerance: number;
  mulberry32: { seed: number; values: number[] };
  mulberry32_negative_seed: { seed: number; values: number[] };
  prompts: PromptFx[];
};
const TOL = fx.tolerance; // 1e-4 absolute, or relative for |x| > 1

function assertClose(actual: ArrayLike<number>, expected: ArrayLike<number>, label: string, tol = TOL) {
  assert.equal(actual.length, expected.length, `${label}: length`);
  let worst = 0;
  let worstI = -1;
  for (let i = 0; i < expected.length; i++) {
    const err = Math.abs(actual[i] - expected[i]) / Math.max(1, Math.abs(expected[i]));
    if (!(err <= worst)) {
      worst = err;
      worstI = i;
    }
  }
  assert.ok(
    worst <= tol,
    `${label}: max err ${worst} at ${worstI} (got ${actual[worstI]}, want ${expected[worstI]})`,
  );
}

const row = (t: Tensor, ...i: number[]) => tensorRow(t, ...i);
const T_FIELDS_C = ["input", "attnNormed", "q", "k", "v", "qRot", "kRot", "concat", "attnOut", "resid1", "mlpNormed", "mlpOut", "output"] as const; // prettier-ignore
const T_FIELDS_F = ["gate", "up", "act", "hidden"] as const;

test("fixture was generated from the current model.bin", () => {
  assert.equal(createHash("sha256").update(binBuf).digest("hex"), fx.model_bin_sha256);
});

test("model.json / model.bin layout", () => {
  const c = model.config;
  assert.equal(c.vocabSize, 2048);
  assert.equal(c.nHeads * c.dHead, c.dModel);
  assert.equal(c.tiedEmbeddings, true);
  let off = 0;
  for (const t of modelJson.tensors) {
    assert.equal(t.offset, off, t.name);
    assert.equal(t.dtype, "float32");
    off += 4 * t.length;
  }
  assert.equal(off, bin.byteLength);
  const { dModel: C, dFF: F, vocabSize: V } = c;
  assert.deepEqual(model.weights.tokEmb.shape, [V, C]);
  assert.equal(model.weights.layers.length, c.nLayers);
  for (const l of model.weights.layers) {
    assert.deepEqual(l.wq.shape, [C, C]);
    assert.deepEqual(l.wGate.shape, [C, F]);
    assert.deepEqual(l.wDown.shape, [F, C]);
    assert.deepEqual(l.attnNorm.shape, [C]);
  }
  assert.equal(model.tensors["layers.0.wq"], model.weights.layers[0].wq);
  assert.ok(model.training.finalValLoss > 0 && model.training.paramsTotal > 0);
  assert.ok(model.samples.length >= 3);
});

test("mulberry32 matches the Python port", () => {
  const r = mulberry32(fx.mulberry32.seed);
  assertClose(Array.from({ length: fx.mulberry32.values.length }, r), fx.mulberry32.values, "mulberry32", 0);
  const r2 = mulberry32(fx.mulberry32_negative_seed.seed);
  assertClose(Array.from({ length: 5 }, r2), fx.mulberry32_negative_seed.values, "mulberry32(-7)", 0);
});

function checkShapes(tr: ForwardTrace, T: number) {
  const { dModel: C, nHeads: H, dHead: D, dFF: F, vocabSize: V } = model.config;
  assert.deepEqual(tr.embeddings.shape, [T, C]);
  assert.deepEqual(tr.finalNormRms.shape, [T]);
  assert.deepEqual(tr.finalNormed.shape, [T, C]);
  assert.deepEqual(tr.logits.shape, [T, V]);
  assert.deepEqual(tr.probs.shape, [V]);
  const expect: Record<keyof LayerTrace, number[]> = {
    input: [T, C], attnNormRms: [T], attnNormed: [T, C], q: [T, C], k: [T, C], v: [T, C], qRot: [T, C],
    kRot: [T, C], scores: [H, T, T], probs: [H, T, T], headOut: [H, T, D], concat: [T, C], attnOut: [T, C],
    resid1: [T, C], mlpNormRms: [T], mlpNormed: [T, C], gate: [T, F], up: [T, F], act: [T, F], hidden: [T, F],
    mlpOut: [T, C], output: [T, C],
  }; // prettier-ignore
  for (const L of tr.layers)
    for (const [k, shape] of Object.entries(expect)) {
      const t = L[k as keyof LayerTrace];
      assert.deepEqual(t.shape, shape, k);
      assert.equal(t.data.length, shape.reduce((a, b) => a * b, 1), k);
    }
}

function checkInvariants(tr: ForwardTrace) {
  const { dModel: C, nHeads: H, dHead: D, normEps: eps } = model.config;
  const T = tr.tokens.length;
  // final probs
  let s = 0;
  for (const p of tr.probs.data) s += p;
  assert.ok(Math.abs(s - 1) < 1e-5, `probs sum ${s}`);
  const checkNorm = (x: Tensor, rms: Tensor, normed: Tensor, w: Float32Array, label: string) => {
    for (let t = 0; t < T; t++) {
      let ss = 0;
      for (let c = 0; c < C; c++) ss += x.data[t * C + c] ** 2;
      const r = Math.sqrt(ss / C + eps);
      assert.ok(Math.abs(rms.data[t] - r) <= 1e-6 * r, `${label} rms[${t}]`);
      for (let c = 0; c < C; c++) {
        const want = (x.data[t * C + c] / r) * w[c];
        assert.ok(Math.abs(normed.data[t * C + c] - want) <= 1e-5 * Math.max(1, Math.abs(want)), `${label} normed`);
      }
    }
  };
  tr.layers.forEach((L, l) => {
    const w = model.weights.layers[l];
    checkNorm(L.input, L.attnNormRms, L.attnNormed, w.attnNorm.data, `layer ${l} attn norm`);
    checkNorm(L.resid1, L.mlpNormRms, L.mlpNormed, w.mlpNorm.data, `layer ${l} mlp norm`);
    for (let h = 0; h < H; h++)
      for (let i = 0; i < T; i++) {
        let rowSum = 0;
        for (let j = 0; j < T; j++) {
          const p = L.probs.data[(h * T + i) * T + j];
          const sc = L.scores.data[(h * T + i) * T + j];
          if (j > i) {
            assert.equal(p, 0, "masked prob must be exactly 0");
            assert.equal(sc, -Infinity, "masked score must be -Infinity");
          } else {
            assert.ok(Number.isFinite(sc) && p >= 0 && p <= 1);
          }
          rowSum += p;
        }
        assert.ok(Math.abs(rowSum - 1) < 1e-5, `attention row sum ${rowSum}`);
        // concat is the head outputs laid side by side
        for (let d = 0; d < D; d++)
          assert.equal(L.concat.data[i * C + h * D + d], L.headOut.data[(h * T + i) * D + d]);
      }
    for (let i = 0; i < L.gate.data.length; i++) {
      const g = L.gate.data[i];
      assert.ok(Math.abs(L.act.data[i] - g / (1 + Math.exp(-g))) <= 1e-6 * Math.max(1, Math.abs(g)));
      assert.ok(Math.abs(L.hidden.data[i] - L.act.data[i] * L.up.data[i]) <= 1e-6 * Math.max(1, Math.abs(L.hidden.data[i])));
    }
    for (let i = 0; i < L.output.data.length; i++) {
      assert.equal(L.resid1.data[i], Math.fround(L.input.data[i] + L.attnOut.data[i]));
      assert.equal(L.output.data[i], Math.fround(L.resid1.data[i] + L.mlpOut.data[i]));
    }
    if (l + 1 < tr.layers.length) assert.deepEqual(tr.layers[l + 1].input.data, L.output.data);
  });
  checkNorm(tr.layers[tr.layers.length - 1].output, tr.finalNormRms, tr.finalNormed, model.weights.finalNorm.data, "final norm");
}

for (const p of fx.prompts) {
  test(`forward() reproduces PyTorch: ${JSON.stringify(p.text)}`, () => {
    assert.equal(tok.normalize(p.text), p.normalized);
    const ids = tok.encode(p.text, { addBos: true });
    assert.deepEqual(ids, p.ids);
    assert.deepEqual(
      tok.encodeWithPieces(p.text, { addBos: true }).map((x) => x.text),
      p.pieces,
    );
    const tr = forward(model, ids);
    const T = ids.length;
    assert.equal(T, p.T);
    assert.deepEqual(tr.tokens, ids);
    checkShapes(tr, T);
    checkInvariants(tr);

    // exact float32 copies of tok_emb rows (fixture values are rounded to 8 significant digits)
    assertClose(row(tr.embeddings, T - 1), p.embeddingsLast, "embeddings[last]", 1e-7);
    tr.layers.forEach((L, l) => {
      const f = p.layers[l];
      assertClose(L.attnNormRms.data, f.attnNormRms, `L${l}.attnNormRms`);
      assertClose(L.mlpNormRms.data, f.mlpNormRms, `L${l}.mlpNormRms`);
      for (const k of [...T_FIELDS_C, ...T_FIELDS_F]) assertClose(row(L[k], T - 1), f.lastRow[k], `L${l}.${k}[last]`);
      for (const [k, v] of Object.entries(f.firstRow)) assertClose(row(L[k as keyof LayerTrace], 0), v, `L${l}.${k}[0]`);
      const H = model.config.nHeads;
      for (let h = 0; h < H; h++) {
        assertClose(row(L.scores, h, T - 1), f.scoresLastRow[h], `L${l}.scores[${h}, last]`);
        assertClose(row(L.probs, h, T - 1), f.probsLastRow[h], `L${l}.probs[${h}, last]`);
        assertClose(row(L.headOut, h, T - 1), f.headOutLast[h], `L${l}.headOut[${h}, last]`);
      }
    });
    assertClose(tr.layers[0].probs.data, p.layer0Probs.flat(2), "layer0 probs [H,T,T]");
    assertClose(row(tr.layers[0].qRot, T - 1), p.layer0QRotLast, "layer0 qRot[last]");
    assertClose(row(tr.layers[tr.layers.length - 1].output, T - 1), p.lastLayerOutputLast, "last layer output[last]");
    assertClose(tr.finalNormRms.data, p.finalNormRms, "finalNormRms");
    assertClose(row(tr.finalNormed, T - 1), p.finalNormedLast, "finalNormed[last]");
    assertClose(lastLogits(tr), p.logitsLast, "logits[last]");
    assertClose(row(tr.logits, 0), p.logitsFirst, "logits[0]");
    const top = Array.from(tr.probs.data.keys())
      .sort((a, b) => tr.probs.data[b] - tr.probs.data[a])
      .slice(0, 10);
    assert.deepEqual(
      top,
      p.probsTop10.map(([i]) => i),
    );
    assertClose(
      top.map((i) => tr.probs.data[i]),
      p.probsTop10.map(([, v]) => v),
      "top-10 probs",
    );
  });

  test(`greedy generation matches PyTorch: ${JSON.stringify(p.text)}`, () => {
    assert.ok(p.greedy.ids.length >= 5, "fixture greedy continuation too short");
    const g = generate(model, tok, p.text, {
      temperature: 0,
      maxNewTokens: p.greedy.ids.length,
      stopAtEndOfText: false,
    });
    assert.deepEqual(g.promptIds, p.ids);
    assert.deepEqual(g.generatedIds, p.greedy.ids);
    assert.equal(g.completion, p.greedy.text);
  });
}

test("model.json demo samples are reproduced by generate() with the same seed", () => {
  for (const s of modelJson.samples) {
    const g = generate(model, tok, s.prompt, {
      seed: s.seed as number,
      temperature: s.temperature as number,
      topK: s.top_k as number,
      maxNewTokens: s.max_new_tokens as number,
    });
    assert.deepEqual(g.generatedIds, s.token_ids, s.prompt);
    assert.equal(g.completion, s.completion);
    assert.equal(g.stoppedAtEndOfText, s.stopped_at_end_of_text);
  }
});

test("sampleToken / softmaxWithTemperature", () => {
  const tr = forward(model, tok.encode("Once upon a time", { addBos: true }));
  const logits = lastLogits(tr);
  const V = logits.length;
  // greedy
  const greedy = sampleToken(logits, { temperature: 0, rng: mulberry32(1) });
  let best = 0;
  for (let i = 1; i < V; i++) if (logits[i] > logits[best]) best = i;
  assert.equal(greedy.id, best);
  assert.equal(greedy.probs[best], 1);
  // temperature 1 softmax == trace.probs
  assertClose(softmaxWithTemperature(logits, 1), tr.probs.data, "softmax T=1", 1e-6);
  // top-k support + renormalization
  const rng = mulberry32(7);
  for (let n = 0; n < 50; n++) {
    const r = sampleToken(logits, { temperature: 0.8, topK: 5, rng });
    const support = [...r.probs.keys()].filter((i) => r.probs[i] > 0);
    assert.equal(support.length, 5);
    assert.ok(support.includes(r.id));
    assert.ok(Math.abs(r.probs.reduce((a, b) => a + b, 0) - 1) < 1e-5);
  }
  // top-p keeps the smallest prefix reaching p
  const r = sampleToken(logits, { temperature: 1, topP: 0.5, rng: mulberry32(3) });
  const kept = [...r.probs.keys()].filter((i) => r.probs[i] > 0);
  const base = softmaxWithTemperature(logits, 1);
  const sorted = [...base.keys()].sort((a, b) => base[b] - base[a]);
  let cum = 0;
  let need = 0;
  while (cum < 0.5) cum += base[sorted[need++]];
  assert.equal(kept.length, need);
  // probabilities as input give the same result as logits
  const a = sampleToken(logits, { temperature: 0.8, topK: 40, rng: mulberry32(11), inputType: "logits" });
  const b = sampleToken(tr.probs.data, { temperature: 0.8, topK: 40, rng: mulberry32(11) });
  assert.equal(a.id, b.id);
  assertClose(a.probs, b.probs, "probs-vs-logits input", 1e-5);
});

test("forward() input validation and speed", () => {
  assert.throws(() => forward(model, []));
  assert.throws(() => forward(model, [2048]));
  assert.throws(() => forward(model, new Array(model.config.maxSeqLen + 1).fill(1)));
  const ids = Array.from({ length: model.config.maxSeqLen }, (_, i) => (i * 37) % 2047);
  forward(model, ids);
  forward(model, ids);
  const t0 = performance.now();
  forward(model, ids);
  const ms = performance.now() - t0;
  console.log(`forward(T=${ids.length}) took ${ms.toFixed(1)} ms`);
  assert.ok(ms < 500, `forward too slow: ${ms} ms`);
});

test("loadLlmAssets() fetches public/llm/* and builds model + tokenizer", async () => {
  const realFetch = globalThis.fetch;
  const seen: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    seen.push(url);
    return new Response(readFileSync(join(root, "public", url.replace(/^\/+/, ""))));
  }) as typeof fetch;
  try {
    const a = await loadLlmAssets("/llm/");
    const b = await loadLlmAssets("/llm");
    assert.equal(a, b, "memoized per base URL");
    assert.deepEqual(seen.sort(), ["/llm/model.bin", "/llm/model.json", "/llm/tokenizer.json"]);
    const ids = a.tokenizer.encode("Once upon a time", { addBos: true });
    assert.deepEqual(ids, tok.encode("Once upon a time", { addBos: true }));
    assert.deepEqual(forward(a.model, ids).probs.data, forward(model, ids).probs.data);
  } finally {
    globalThis.fetch = realFetch;
  }
});
