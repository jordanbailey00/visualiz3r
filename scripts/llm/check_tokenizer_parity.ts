/**
 * Full-dataset parity check: encodes the whole TinyStories validation file with the
 * TypeScript tokenizer and compares against the Python-produced token stream
 * (scripts/llm/data/valid_tokens.npy, written by tokenize_data.py).
 *
 * Usage (from the repo root): node --import tsx scripts/llm/check_tokenizer_parity.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { normalizeText } from "../../lib/llm/normalize";
import { BpeTokenizer } from "../../lib/llm/tokenizer";

const root = process.cwd();
const dataDir = join(root, "scripts/llm/data");

function readNpyUint16(path: string): Uint16Array {
  const buf = readFileSync(path);
  if (buf.toString("latin1", 1, 6) !== "NUMPY") throw new Error("not an npy file");
  const major = buf[6];
  const headerLen = major === 1 ? buf.readUInt16LE(8) : buf.readUInt32LE(8);
  const start = (major === 1 ? 10 : 12) + headerLen;
  const header = buf.toString("latin1", major === 1 ? 10 : 12, start);
  if (!header.includes("<u2")) throw new Error(`unexpected dtype in ${header}`);
  const bytes = buf.subarray(start);
  return new Uint16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

const tok = BpeTokenizer.fromJSON(readFileSync(join(root, "public/llm/tokenizer.json"), "utf8"));
const raw = readFileSync(join(dataDir, "TinyStoriesV2-GPT4-valid.txt"), "utf8");
const expected = readNpyUint16(join(dataDir, "valid_tokens.npy"));

const t0 = performance.now();
const got: number[] = [];
let stories = 0;
for (const part of raw.split("<|endoftext|>")) {
  const story = normalizeText(part).trim();
  if (!story) continue;
  stories++;
  got.push(tok.bosId);
  for (const id of tok.encode(story)) got.push(id);
}
const ms = performance.now() - t0;

let firstDiff = -1;
const n = Math.min(got.length, expected.length);
for (let i = 0; i < n; i++)
  if (got[i] !== expected[i]) {
    firstDiff = i;
    break;
  }
console.log(`stories ${stories}, TS tokens ${got.length}, Python tokens ${expected.length}, ${ms.toFixed(0)} ms`);
if (firstDiff >= 0 || got.length !== expected.length) {
  const i = Math.max(firstDiff, 0);
  console.error(`MISMATCH at ${firstDiff}: TS ${got.slice(i, i + 10)} vs PY ${Array.from(expected.slice(i, i + 10))}`);
  process.exit(1);
}
console.log("OK: TypeScript tokenizer reproduces the Python token stream exactly");
