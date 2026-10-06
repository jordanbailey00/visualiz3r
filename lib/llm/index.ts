/**
 * Public API of the in-browser tiny-LLM engine.
 *
 *   const { model, tokenizer } = await loadLlmAssets();          // fetches /llm/*
 *   const ids = tokenizer.encode("Once upon a time", { addBos: true });
 *   const trace = forward(model, ids);                            // every intermediate tensor
 *   const next = sampleToken(trace.probs.data, { temperature: 0.8, topK: 40, rng: mulberry32(1) });
 *
 * Everything here is dependency-free and runs in browsers and Node (no Node-only APIs).
 */

import { loadModel, type LoadedModel, type ModelJson } from "./model";
import { BpeTokenizer, type TokenizerJson } from "./tokenizer";

export { normalizeText } from "./normalize";
export { BpeTokenizer } from "./tokenizer";
export type { EncodeOptions, TokenPiece, TokenizerJson } from "./tokenizer";
export {
  forward,
  generate,
  lastLogits,
  loadModel,
  mulberry32,
  sampleToken,
  softmaxWithTemperature,
  tensorRow,
} from "./model";
export type {
  ForwardTrace,
  GenerateOptions,
  GenerateResult,
  GenerateStep,
  LayerTrace,
  LayerWeights,
  LoadedModel,
  ModelConfig,
  ModelConfigJson,
  ModelJson,
  ModelWeights,
  SampleJson,
  SampleOptions,
  SampleResult,
  Tensor,
  TensorInfoJson,
  TrainingInfo,
  TrainingInfoJson,
} from "./model";

export interface LlmAssets {
  model: LoadedModel;
  tokenizer: BpeTokenizer;
}

const assetCache = new Map<string, Promise<LlmAssets>>();

async function fetchOk(url: string): Promise<Response> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to fetch ${url}: ${res.status} ${res.statusText}`);
  return res;
}

/**
 * Fetch model.json, model.bin and tokenizer.json from `baseUrl` (default "/llm", i.e.
 * public/llm/) and build the model + tokenizer. Memoized per baseUrl; a failed load is
 * evicted so it can be retried.
 */
export function loadLlmAssets(baseUrl = "/llm"): Promise<LlmAssets> {
  const base = baseUrl.replace(/\/+$/, "");
  let p = assetCache.get(base);
  if (!p) {
    p = (async () => {
      const [modelJson, bin, tokJson] = await Promise.all([
        fetchOk(`${base}/model.json`).then((r) => r.json() as Promise<ModelJson>),
        fetchOk(`${base}/model.bin`).then((r) => r.arrayBuffer()),
        fetchOk(`${base}/tokenizer.json`).then((r) => r.json() as Promise<TokenizerJson>),
      ]);
      return { model: loadModel(modelJson, bin), tokenizer: BpeTokenizer.fromJSON(tokJson) };
    })();
    assetCache.set(base, p);
    p.catch(() => assetCache.delete(base));
  }
  return p;
}
