/**
 * Benchmark forward() of the TypeScript engine (Node's V8 ~ Chrome's).
 * Uses public/llm/model.{json,bin} when present, otherwise random weights.
 *
 * Usage (from the repo root): node --import tsx scripts/llm/bench_forward.ts [T=128]
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { forward, loadModel, type ModelJson } from "../../lib/llm/model";

const root = process.cwd();
const T = Number(process.argv[2] ?? 128);

function randomModel(): { json: ModelJson; bin: ArrayBuffer } {
  const C = 64, F = 256, V = 2048, L = 4;
  const specs: [string, number[]][] = [["tok_emb", [V, C]]];
  for (let i = 0; i < L; i++) {
    specs.push([`layers.${i}.attn_norm`, [C]], [`layers.${i}.wq`, [C, C]], [`layers.${i}.wk`, [C, C]],
      [`layers.${i}.wv`, [C, C]], [`layers.${i}.wo`, [C, C]], [`layers.${i}.mlp_norm`, [C]],
      [`layers.${i}.w_gate`, [C, F]], [`layers.${i}.w_up`, [C, F]], [`layers.${i}.w_down`, [F, C]]);
  }
  specs.push(["final_norm", [C]]);
  let off = 0;
  const tensors = specs.map(([name, shape]) => {
    const length = shape.reduce((a, b) => a * b, 1);
    const t = { name, shape, dtype: "float32" as const, offset: off, length };
    off += 4 * length;
    return t;
  });
  const data = new Float32Array(off / 4);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() - 0.5) * 0.2;
  const json: ModelJson = {
    config: { vocab_size: V, d_model: C, n_layers: L, n_heads: 4, d_head: 16, d_ff: F, max_seq_len: 128,
      rope_theta: 10000, norm_eps: 1e-5, tied_embeddings: true },
    tensors,
    training: { dataset: "random", train_tokens_seen: 0, steps: 0, final_train_loss: 0, final_val_loss: 0,
      params_total: 0, params_non_embedding: 0, notes: "" },
    samples: [],
  };
  return { json, bin: data.buffer };
}

const mj = join(root, "public/llm/model.json");
const mb = join(root, "public/llm/model.bin");
let model;
if (existsSync(mj) && existsSync(mb)) {
  const b = readFileSync(mb);
  model = loadModel(JSON.parse(readFileSync(mj, "utf8")), b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  console.log("using public/llm model");
} else {
  const r = randomModel();
  model = loadModel(r.json, r.bin);
  console.log("using random weights");
}
const ids = Array.from({ length: T }, (_, i) => (i * 37) % model.config.vocabSize);
for (let i = 0; i < 5; i++) forward(model, ids); // warm up the JIT
const N = 30;
const times: number[] = [];
for (let i = 0; i < N; i++) {
  const t0 = performance.now();
  forward(model, ids);
  times.push(performance.now() - t0);
}
times.sort((a, b) => a - b);
console.log(`T=${T}: median ${times[N >> 1].toFixed(2)} ms, min ${times[0].toFixed(2)} ms, max ${times[N - 1].toFixed(2)} ms`);
