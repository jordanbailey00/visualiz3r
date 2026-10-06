import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { normalizeText } from "../lib/llm/normalize";
import { BpeTokenizer, type TokenizerJson } from "../lib/llm/tokenizer";

const root = process.cwd();
const tokJson = JSON.parse(readFileSync(join(root, "public/llm/tokenizer.json"), "utf8")) as TokenizerJson;
const fixture = JSON.parse(readFileSync(join(root, "tests/fixtures/llm-tokenizer.json"), "utf8")) as {
  pattern: string;
  cases: { text: string; normalized: string; ids: number[] }[];
};
const tok = BpeTokenizer.fromJSON(tokJson);

test("tokenizer.json has the expected structure", () => {
  assert.equal(tokJson.type, "byte-bpe");
  assert.equal(tokJson.vocab_size, 2048);
  assert.equal(tokJson.merges.length, 1791);
  assert.equal(tokJson.token_bytes.length, 2048);
  assert.deepEqual(tokJson.special_tokens, { "<|endoftext|>": 2047 });
  assert.equal(tokJson.bos_id, 2047);
  assert.equal(tokJson.pattern, fixture.pattern);
  for (let i = 0; i < 256; i++) assert.deepEqual(tokJson.token_bytes[i], [i]);
  tokJson.merges.forEach(([a, b], i) => {
    assert.ok(a < 256 + i && b < 256 + i, `merge ${i} references a later id`);
    assert.deepEqual(tokJson.token_bytes[256 + i], [...tokJson.token_bytes[a], ...tokJson.token_bytes[b]]);
  });
  assert.equal(tok.vocabSize, 2048);
  assert.equal(tok.bosId, 2047);
  assert.equal(tok.tokenString(2047), "<|endoftext|>");
});

test("normalizeText matches the Python normalizer", () => {
  for (const c of fixture.cases) assert.equal(normalizeText(c.text), c.normalized, JSON.stringify(c.text));
  assert.equal(normalizeText("\u{201c}hi\u{201d} \u{2018}x\u{2019} \u{2013} \u{2014} \u{2026}\u{00a0}"), "\"hi\" 'x' - - ... ");
  assert.equal(normalizeText("a\r\nb\tc\u0000d\u007fe\u{feff}f"), "a\nbcdef");
});

test("encode() matches the Python encoder on every fixture case", () => {
  assert.ok(fixture.cases.length >= 200, `only ${fixture.cases.length} cases`);
  for (const c of fixture.cases) assert.deepEqual(tok.encode(c.text), c.ids, JSON.stringify(c.text));
});

test("decode(encode(x)) round-trips to the normalized text", () => {
  for (const c of fixture.cases) {
    assert.equal(tok.decode(tok.encode(c.text)), c.normalized, JSON.stringify(c.text));
  }
  assert.equal(tok.decode(tok.encode("Hi<|endoftext|>there")), "Hi<|endoftext|>there");
  assert.equal(tok.decode(tok.encode("Hi<|endoftext|>there"), { skipSpecial: true }), "Hithere");
});

test("encodeWithPieces tiles the normalized text contiguously", () => {
  for (const c of fixture.cases) {
    const pieces = tok.encodeWithPieces(c.text);
    assert.deepEqual(
      pieces.map((p) => p.id),
      c.ids,
      JSON.stringify(c.text),
    );
    const norm = c.normalized;
    let pos = 0;
    for (const p of pieces) {
      assert.equal(p.start, pos, `gap before piece ${JSON.stringify(p)} in ${JSON.stringify(c.text)}`);
      assert.ok(p.end >= p.start);
      assert.equal(p.text, tok.tokenString(p.id));
      // whole-character pieces map exactly onto their slice of the text
      if (!p.text.includes("\u{fffd}") || norm.slice(p.start, p.end).includes("\u{fffd}"))
        assert.equal(norm.slice(p.start, p.end), p.text, `piece text mismatch in ${JSON.stringify(c.text)}`);
      pos = p.end;
    }
    assert.equal(pos, norm.length, JSON.stringify(c.text));
  }
});

test("pieces of split multi-byte characters", () => {
  // a rare character is encoded as several byte tokens: the first one owns the char
  const pieces = tok.encodeWithPieces("\u{4e2d}");
  assert.ok(pieces.length >= 1);
  assert.equal(pieces[0].start, 0);
  assert.equal(pieces[0].end, 1);
  for (const p of pieces.slice(1)) assert.deepEqual([p.start, p.end], [1, 1]);
  assert.equal(tok.decode(pieces.map((p) => p.id)), "\u{4e2d}");
  if (pieces.length > 1) assert.match(tok.displayToken(pieces[0].id), /<0x[0-9A-F]{2}>/);
});

test("addBos option and special token pieces", () => {
  assert.deepEqual(tok.encode("Hi", { addBos: true }), [2047, ...tok.encode("Hi")]);
  const pieces = tok.encodeWithPieces("Hi<|endoftext|>", { addBos: true });
  assert.deepEqual(pieces[0], { id: 2047, text: "<|endoftext|>", start: 0, end: 0 });
  const last = pieces[pieces.length - 1];
  assert.deepEqual(last, { id: 2047, text: "<|endoftext|>", start: 2, end: 15 });
});

test("token strings", () => {
  const ids = tok.encode(" the");
  assert.equal(ids.length, 1);
  assert.equal(tok.tokenString(ids[0]), " the");
  assert.equal(tok.displayToken(ids[0]), " the");
  assert.equal(tok.tokenString(10), "\n");
  assert.equal(tok.displayToken(0xe2), "<0xE2>");
  assert.equal(tok.tokenString(0xe2), "\u{fffd}");
  assert.throws(() => tok.tokenString(2048));
  // invalid UTF-8 is decoded gracefully
  assert.equal(tok.decode([0xe2, 0x80]), "\u{fffd}");
});
