"""Text normalization + byte-level BPE tokenizer (GPT-2 style), dependency-free.

This module is the Python twin of lib/llm/normalize.ts and lib/llm/tokenizer.ts.
Both sides MUST stay behaviorally identical:

normalize_text(text):
  1. Unicode NFKC
  2. curly quotes U+2018 U+2019 U+201A U+2032 -> '   U+201C U+201D U+201E U+2033 -> "   en/em dash -> -   ellipsis -> ...   NBSP -> space
  3. strip control characters U+0000-U+001F (except \\n) and U+007F-U+009F, plus U+FEFF
     (BOM / zero-width no-break space: JS `\\s` matches it but Python `\\s` does not)
  4. replace lone UTF-16 surrogates with U+FFFD (cannot be UTF-8 encoded)

Pre-tokenization uses PATTERN, which only relies on regex features that behave the
same in Python `re` and JavaScript `RegExp(pattern, "g")` once text is normalized.

Vocabulary: ids 0..255 are single bytes, merge i creates id 256+i, the special token
`<|endoftext|>` is the last id (vocab_size - 1) and doubles as BOS / story separator.
"""

from __future__ import annotations

import heapq
import json
import re
import unicodedata
from collections import Counter, defaultdict
from typing import Iterable

PATTERN = r"""'(?:s|t|re|ve|m|ll|d)| ?[A-Za-z]+| ?[0-9]+| ?[^\sA-Za-z0-9]+|\s+(?!\S)|\s+"""
PRETOKEN_RE = re.compile(PATTERN)

EOT = "<|endoftext|>"
VOCAB_SIZE = 2048
N_MERGES = VOCAB_SIZE - 256 - 1  # 1791
EOT_ID = VOCAB_SIZE - 1  # 2047

_CHAR_MAP = {
    "\N{LEFT SINGLE QUOTATION MARK}": "'",  # U+2018
    "\N{RIGHT SINGLE QUOTATION MARK}": "'",  # U+2019
    "\N{SINGLE LOW-9 QUOTATION MARK}": "'",  # U+201A
    "\N{PRIME}": "'",  # U+2032
    "\N{LEFT DOUBLE QUOTATION MARK}": '"',  # U+201C
    "\N{RIGHT DOUBLE QUOTATION MARK}": '"',  # U+201D
    "\N{DOUBLE LOW-9 QUOTATION MARK}": '"',  # U+201E
    "\N{DOUBLE PRIME}": '"',  # U+2033
    "\N{EN DASH}": "-",  # U+2013
    "\N{EM DASH}": "-",  # U+2014
    "\N{HORIZONTAL ELLIPSIS}": "...",  # U+2026
    "\N{NO-BREAK SPACE}": " ",  # U+00A0
}
_TRANSLATE = str.maketrans(_CHAR_MAP)
_STRIP_RE = re.compile("[\x00-\x09\x0b-\x1f\x7f-\x9f\N{ZERO WIDTH NO-BREAK SPACE}]")
_SURROGATE_RE = re.compile("[\ud800-\udfff]")


def normalize_text(text: str) -> str:
    text = unicodedata.normalize("NFKC", text)
    text = text.translate(_TRANSLATE)
    text = _STRIP_RE.sub("", text)
    text = _SURROGATE_RE.sub("\N{REPLACEMENT CHARACTER}", text)
    return text


def pretokenize(text: str) -> list[str]:
    return PRETOKEN_RE.findall(text)


def iter_stories(raw: str) -> Iterable[str]:
    """Split a TinyStories file on `<|endoftext|>`; yields normalized, stripped stories."""
    for part in raw.split(EOT):
        story = normalize_text(part).strip()
        if story:
            yield story


# --------------------------------------------------------------------------------------
# Training
# --------------------------------------------------------------------------------------


def count_words(stories: Iterable[str]) -> Counter:
    c: Counter = Counter()
    for s in stories:
        c.update(PRETOKEN_RE.findall(s))
    return c


def train_bpe(word_counts: dict[str, int], n_merges: int = N_MERGES, verbose: bool = True):
    """Learn `n_merges` merges from pre-token frequencies.

    Incremental pair counts + a lazy max-heap. Ties are broken by the smallest
    (left id, right id) so training is deterministic. Returns list[(a, b)].
    """
    words: list[list[int]] = []
    freqs: list[int] = []
    for w, f in word_counts.items():
        b = list(w.encode("utf-8"))
        if len(b) >= 2:
            words.append(b)
            freqs.append(f)

    pair_counts: dict[tuple[int, int], int] = defaultdict(int)
    where: dict[tuple[int, int], set[int]] = defaultdict(set)
    for wi, (w, f) in enumerate(zip(words, freqs)):
        for p in zip(w, w[1:]):
            pair_counts[p] += f
            where[p].add(wi)

    heap = [(-c, a, b) for (a, b), c in pair_counts.items()]
    heapq.heapify(heap)

    merges: list[tuple[int, int]] = []
    while len(merges) < n_merges and heap:
        negc, a, b = heapq.heappop(heap)
        cur = pair_counts.get((a, b), 0)
        if cur <= 0:
            continue
        if -negc != cur:  # stale entry; the current count was pushed separately
            continue
        new_id = 256 + len(merges)
        merges.append((a, b))
        if verbose and (len(merges) <= 10 or len(merges) % 200 == 0):
            print(f"merge {len(merges):5d}: ({a},{b}) -> {new_id}  count={cur}", flush=True)

        changed: set[tuple[int, int]] = set()
        for wi in list(where[(a, b)]):
            w = words[wi]
            f = freqs[wi]
            # merge all non-overlapping occurrences left to right
            out = []
            i = 0
            n = len(w)
            hit = False
            while i < n:
                if i < n - 1 and w[i] == a and w[i + 1] == b:
                    out.append(new_id)
                    i += 2
                    hit = True
                else:
                    out.append(w[i])
                    i += 1
            if not hit:
                continue
            for p in zip(w, w[1:]):
                pair_counts[p] -= f
                changed.add(p)
            for p in zip(out, out[1:]):
                pair_counts[p] += f
                where[p].add(wi)
                changed.add(p)
            words[wi] = out
        pair_counts.pop((a, b), None)
        where.pop((a, b), None)
        changed.discard((a, b))
        for p in changed:
            c = pair_counts.get(p, 0)
            if c > 0:
                heapq.heappush(heap, (-c, p[0], p[1]))
            else:
                pair_counts.pop(p, None)
    if len(merges) != n_merges:
        raise RuntimeError(f"only learned {len(merges)} merges")
    return merges


# --------------------------------------------------------------------------------------
# Encoding / decoding
# --------------------------------------------------------------------------------------


class BPETokenizer:
    def __init__(self, merges: list[tuple[int, int]], special_tokens: dict[str, int] | None = None,
                 vocab_size: int = VOCAB_SIZE):
        self.merges = [tuple(m) for m in merges]
        self.ranks = {tuple(m): i for i, m in enumerate(self.merges)}
        self.vocab_size = vocab_size
        self.special_tokens = dict(special_tokens or {EOT: vocab_size - 1})
        self.bos_id = self.special_tokens[EOT]
        tb: list[bytes] = [bytes([i]) for i in range(256)]
        for a, b in self.merges:
            tb.append(tb[a] + tb[b])
        n_regular = 256 + len(self.merges)
        tb.extend(b"" for _ in range(vocab_size - n_regular))
        for s, i in self.special_tokens.items():
            if i < n_regular:
                raise ValueError("special token id collides with a regular token")
            tb[i] = s.encode("utf-8")
        if any(len(x) == 0 for x in tb):
            raise ValueError("vocab has unassigned ids")
        self.token_bytes = tb
        self._special_re = re.compile("(" + "|".join(re.escape(s) for s in self.special_tokens) + ")")
        self._cache: dict[str, list[int]] = {}

    # ---- serialization ----
    def to_json(self) -> dict:
        return {
            "type": "byte-bpe",
            "pattern": PATTERN,
            "vocab_size": self.vocab_size,
            "merges": [list(m) for m in self.merges],
            "special_tokens": self.special_tokens,
            "token_bytes": [list(b) for b in self.token_bytes],
            "bos_id": self.bos_id,
        }

    @classmethod
    def load(cls, path: str) -> "BPETokenizer":
        with open(path) as f:
            j = json.load(f)
        assert j["type"] == "byte-bpe" and j["pattern"] == PATTERN
        tok = cls([tuple(m) for m in j["merges"]], j["special_tokens"], j["vocab_size"])
        assert tok.bos_id == j["bos_id"]
        assert [list(b) for b in tok.token_bytes] == j["token_bytes"]
        return tok

    # ---- encoding ----
    def _bpe(self, word: str) -> list[int]:
        cached = self._cache.get(word)
        if cached is not None:
            return cached
        ids = list(word.encode("utf-8"))
        ranks = self.ranks
        while len(ids) >= 2:
            best = None
            best_rank = 1 << 30
            for p in zip(ids, ids[1:]):
                r = ranks.get(p)
                if r is not None and r < best_rank:
                    best_rank = r
                    best = p
            if best is None:
                break
            a, b = best
            new_id = 256 + best_rank
            out = []
            i = 0
            n = len(ids)
            while i < n:
                if i < n - 1 and ids[i] == a and ids[i + 1] == b:
                    out.append(new_id)
                    i += 2
                else:
                    out.append(ids[i])
                    i += 1
            ids = out
        if len(self._cache) < 1_000_000:
            self._cache[word] = ids
        return ids

    def encode_normalized(self, text: str) -> list[int]:
        """Encode text that is ALREADY normalized (special tokens recognized)."""
        out: list[int] = []
        for i, seg in enumerate(self._special_re.split(text)):
            if i % 2 == 1:
                out.append(self.special_tokens[seg])
            elif seg:
                for w in PRETOKEN_RE.findall(seg):
                    out.extend(self._bpe(w))
        return out

    def encode(self, text: str, add_bos: bool = False) -> list[int]:
        ids = self.encode_normalized(normalize_text(text))
        return [self.bos_id] + ids if add_bos else ids

    def encode_story(self, story: str) -> list[int]:
        """Training-stream encoding: story is already normalized/stripped; BOS prefix."""
        out = [self.bos_id]
        for w in PRETOKEN_RE.findall(story):
            out.extend(self._bpe(w))
        return out

    def decode(self, ids: Iterable[int]) -> str:
        return b"".join(self.token_bytes[i] for i in ids).decode("utf-8", errors="replace")

    def token_str(self, i: int) -> str:
        return self.token_bytes[i].decode("utf-8", errors="replace")
