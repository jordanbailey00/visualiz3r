/**
 * Byte-level BPE tokenizer (GPT-2 style), the TypeScript twin of scripts/llm/bpe.py.
 *
 * Vocabulary layout (tokenizer.json):
 *   ids 0..255          single bytes
 *   ids 256..256+M-1    merges in rank order: merges[i] = [a, b] creates id 256 + i
 *   id  vocabSize - 1   "<|endoftext|>" (special; also used as BOS / story separator)
 *
 * Encoding: normalizeText(text) -> split on special tokens -> pre-tokenize with the
 * shared regex -> per pre-token UTF-8 bytes -> repeatedly merge the lowest-rank
 * adjacent pair (all its occurrences, left to right) until no merge applies.
 * Merges never cross pre-token boundaries.
 *
 * Offsets (`start`/`end` in TokenPiece) are JS string indices (UTF-16 code units)
 * into the NORMALIZED text. When a multi-byte character is split across several byte
 * tokens, the character is attributed to the token holding its first byte and the
 * following tokens get zero-width ranges, so pieces always tile the text contiguously.
 */

import { normalizeText } from "./normalize";

export interface TokenizerJson {
  type: "byte-bpe";
  /** pre-tokenization regex source; used as `new RegExp(pattern, "g")` */
  pattern: string;
  vocab_size: number;
  /** [left id, right id] in rank order; merge i produces id 256 + i */
  merges: [number, number][];
  special_tokens: Record<string, number>;
  /** raw bytes of every token id 0..vocab_size-1 (special tokens: their literal UTF-8) */
  token_bytes: number[][];
  bos_id: number;
}

export interface TokenPiece {
  id: number;
  /** decoded bytes of this token (tokenString(id)); may contain U+FFFD for partial UTF-8 */
  text: string;
  /** start offset (UTF-16 code units) into normalizeText(input) */
  start: number;
  /** end offset (exclusive) into normalizeText(input) */
  end: number;
}

export interface EncodeOptions {
  /** prepend the BOS token (<|endoftext|>, a zero-width piece at offset 0) */
  addBos?: boolean;
}

const MAX_CACHE = 50_000;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Number of UTF-8 bytes of the code point starting at text[i] and its UTF-16 length. */
function codePointInfo(text: string, i: number): [bytes: number, units: number] {
  const c = text.charCodeAt(i);
  if (c < 0x80) return [1, 1];
  if (c < 0x800) return [2, 1];
  if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) {
    const d = text.charCodeAt(i + 1);
    if (d >= 0xdc00 && d <= 0xdfff) return [4, 2];
  }
  return [3, 1]; // BMP char, or a lone surrogate (TextEncoder emits U+FFFD = 3 bytes)
}

/**
 * Strict-ish UTF-8 walk used by displayToken: valid sequences are decoded, every
 * invalid/incomplete byte is rendered as "<0xNN>".
 */
function bytesToDisplay(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  const n = bytes.length;
  while (i < n) {
    const b0 = bytes[i];
    let len = 0;
    let lo = 0x80;
    let hi = 0xbf;
    if (b0 < 0x80) len = 1;
    else if (b0 >= 0xc2 && b0 <= 0xdf) len = 2;
    else if (b0 >= 0xe0 && b0 <= 0xef) {
      len = 3;
      if (b0 === 0xe0) lo = 0xa0;
      if (b0 === 0xed) hi = 0x9f;
    } else if (b0 >= 0xf0 && b0 <= 0xf4) {
      len = 4;
      if (b0 === 0xf0) lo = 0x90;
      if (b0 === 0xf4) hi = 0x8f;
    }
    let ok = len > 0 && i + len <= n;
    for (let k = 1; ok && k < len; k++) {
      const b = bytes[i + k];
      const l = k === 1 ? lo : 0x80;
      const h = k === 1 ? hi : 0xbf;
      if (b < l || b > h) ok = false;
    }
    if (!ok) {
      out += `<0x${b0.toString(16).toUpperCase().padStart(2, "0")}>`;
      i += 1;
      continue;
    }
    let cp = len === 1 ? b0 : len === 2 ? b0 & 0x1f : len === 3 ? b0 & 0x0f : b0 & 0x07;
    for (let k = 1; k < len; k++) cp = (cp << 6) | (bytes[i + k] & 0x3f);
    out += String.fromCodePoint(cp);
    i += len;
  }
  return out;
}

export class BpeTokenizer {
  readonly vocabSize: number;
  /** id of <|endoftext|>, prepended to every training story (BOS) */
  readonly bosId: number;
  /** same id as bosId: the model emits it to end a story */
  readonly eosId: number;
  readonly pattern: string;
  readonly merges: ReadonlyArray<readonly [number, number]>;
  readonly specialTokens: ReadonlyMap<string, number>;

  private readonly re: RegExp;
  private readonly specialRe: RegExp | null;
  private readonly ranks: Map<number, number>;
  private readonly bytesById: Uint8Array[];
  private readonly strById: string[];
  private readonly displayById: string[];
  private readonly cache = new Map<string, number[]>();
  private readonly utf8 = new TextEncoder();
  // ignoreBOM: keep a leading U+FEFF instead of silently dropping it (matches Python's decode)
  private readonly decoder = new TextDecoder("utf-8", { fatal: false, ignoreBOM: true });

  private constructor(json: TokenizerJson) {
    if (json.type !== "byte-bpe") throw new Error(`unsupported tokenizer type ${json.type}`);
    this.vocabSize = json.vocab_size;
    this.bosId = json.bos_id;
    this.eosId = json.bos_id;
    this.pattern = json.pattern;
    this.re = new RegExp(json.pattern, "g");
    this.merges = json.merges.map(([a, b]) => [a, b] as const);
    this.ranks = new Map();
    json.merges.forEach(([a, b], i) => this.ranks.set(a * this.vocabSize + b, i));
    this.specialTokens = new Map(Object.entries(json.special_tokens));
    const specials = [...this.specialTokens.keys()].sort((a, b) => b.length - a.length);
    this.specialRe = specials.length ? new RegExp(specials.map(escapeRegExp).join("|"), "g") : null;
    if (json.token_bytes.length !== this.vocabSize) throw new Error("token_bytes length != vocab_size");
    this.bytesById = json.token_bytes.map((b) => Uint8Array.from(b));
    this.strById = this.bytesById.map((b) => this.decoder.decode(b));
    this.displayById = this.bytesById.map((b) => bytesToDisplay(b));
  }

  static fromJSON(json: TokenizerJson | string): BpeTokenizer {
    return new BpeTokenizer(typeof json === "string" ? (JSON.parse(json) as TokenizerJson) : json);
  }

  /** The normalization applied by encode()/encodeWithPieces(). */
  normalize(text: string): string {
    return normalizeText(text);
  }

  /** Token ids for `text` (normalized first). No BOS unless `opts.addBos`. */
  encode(text: string, opts: EncodeOptions = {}): number[] {
    const ids: number[] = opts.addBos ? [this.bosId] : [];
    this.forEachSegment(normalizeText(text), (seg, _start, specialId) => {
      if (specialId !== undefined) {
        ids.push(specialId);
        return;
      }
      for (const m of seg.matchAll(this.re)) {
        const t = this.bpe(m[0]);
        for (let i = 0; i < t.length; i++) ids.push(t[i]);
      }
    });
    return ids;
  }

  /**
   * Like encode() but returns each token with its decoded text and its [start, end)
   * range in the normalized text (normalizeText(text)). Pieces tile the text
   * contiguously: pieces[0].start === 0, pieces[i].end === pieces[i+1].start,
   * last.end === normalized.length.
   */
  encodeWithPieces(text: string, opts: EncodeOptions = {}): TokenPiece[] {
    const pieces: TokenPiece[] = [];
    if (opts.addBos) pieces.push({ id: this.bosId, text: this.strById[this.bosId], start: 0, end: 0 });
    this.forEachSegment(normalizeText(text), (seg, segStart, specialId) => {
      if (specialId !== undefined) {
        pieces.push({ id: specialId, text: seg, start: segStart, end: segStart + seg.length });
        return;
      }
      for (const m of seg.matchAll(this.re)) {
        const word = m[0];
        const wordStart = segStart + (m.index ?? 0);
        const ids = this.bpe(word);
        // byte offset -> UTF-16 offset (ceil: a split character belongs to its first byte's token)
        const nBytes = this.utf8.encode(word).length;
        const b2u = new Int32Array(nBytes + 1);
        let b = 0;
        for (let u = 0; u < word.length; ) {
          const [nb, nu] = codePointInfo(word, u);
          b2u[b] = u;
          for (let k = 1; k < nb; k++) b2u[b + k] = u + nu;
          b += nb;
          u += nu;
        }
        b2u[nBytes] = word.length;
        let pos = 0;
        for (const id of ids) {
          const len = this.bytesById[id].length;
          pieces.push({
            id,
            text: this.strById[id],
            start: wordStart + b2u[pos],
            end: wordStart + b2u[pos + len],
          });
          pos += len;
        }
      }
    });
    return pieces;
  }

  /** Concatenate token bytes and decode as UTF-8 (invalid sequences -> U+FFFD). */
  decode(ids: ArrayLike<number>, opts: { skipSpecial?: boolean } = {}): string {
    let n = 0;
    for (let i = 0; i < ids.length; i++) n += this.bytesOf(ids[i], opts.skipSpecial).length;
    const buf = new Uint8Array(n);
    let o = 0;
    for (let i = 0; i < ids.length; i++) {
      const b = this.bytesOf(ids[i], opts.skipSpecial);
      buf.set(b, o);
      o += b.length;
    }
    return this.decoder.decode(buf);
  }

  /** Raw decoded string of one token (may start with a space, may be "\n", may be U+FFFD). */
  tokenString(id: number): string {
    this.checkId(id);
    return this.strById[id];
  }

  /**
   * The raw token string for display. Identical to tokenString(id) except that bytes
   * which do not form valid UTF-8 on their own (pieces of a split multi-byte
   * character) are shown as "<0xNN>" instead of U+FFFD. Spaces/newlines are left
   * as-is: the UI decides how to visualize them.
   */
  displayToken(id: number): string {
    this.checkId(id);
    return this.displayById[id];
  }

  /** Raw bytes of a token. */
  tokenBytes(id: number): Uint8Array {
    this.checkId(id);
    return this.bytesById[id];
  }

  isSpecial(id: number): boolean {
    for (const v of this.specialTokens.values()) if (v === id) return true;
    return false;
  }

  /** For a merged token id >= 256, the pair [left, right] it was built from. */
  mergeParts(id: number): readonly [number, number] | null {
    const i = id - 256;
    return i >= 0 && i < this.merges.length ? this.merges[i] : null;
  }

  // ------------------------------------------------------------------------------

  private checkId(id: number): void {
    if (!Number.isInteger(id) || id < 0 || id >= this.vocabSize) throw new RangeError(`token id ${id} out of range`);
  }

  private bytesOf(id: number, skipSpecial?: boolean): Uint8Array {
    this.checkId(id);
    if (skipSpecial && this.isSpecial(id)) return new Uint8Array(0);
    return this.bytesById[id];
  }

  /** Split normalized text on special tokens; calls fn for plain segments and specials. */
  private forEachSegment(text: string, fn: (seg: string, start: number, specialId?: number) => void): void {
    if (!this.specialRe) {
      if (text) fn(text, 0);
      return;
    }
    let last = 0;
    for (const m of text.matchAll(this.specialRe)) {
      const idx = m.index ?? 0;
      if (idx > last) fn(text.slice(last, idx), last);
      fn(m[0], idx, this.specialTokens.get(m[0]));
      last = idx + m[0].length;
    }
    if (last < text.length) fn(text.slice(last), last);
  }

  /** GPT-2 BPE on one pre-token. Results are cached (returned arrays must not be mutated). */
  private bpe(word: string): number[] {
    const hit = this.cache.get(word);
    if (hit) return hit;
    let ids: number[] = Array.from(this.utf8.encode(word));
    const V = this.vocabSize;
    while (ids.length >= 2) {
      let bestRank = Infinity;
      let bestA = -1;
      let bestB = -1;
      for (let i = 0; i < ids.length - 1; i++) {
        const r = this.ranks.get(ids[i] * V + ids[i + 1]);
        if (r !== undefined && r < bestRank) {
          bestRank = r;
          bestA = ids[i];
          bestB = ids[i + 1];
        }
      }
      if (bestA < 0) break;
      const merged = 256 + bestRank;
      const out: number[] = [];
      for (let i = 0; i < ids.length; ) {
        if (i < ids.length - 1 && ids[i] === bestA && ids[i + 1] === bestB) {
          out.push(merged);
          i += 2;
        } else {
          out.push(ids[i]);
          i += 1;
        }
      }
      ids = out;
    }
    if (this.cache.size >= MAX_CACHE) this.cache.clear();
    this.cache.set(word, ids);
    return ids;
  }
}
