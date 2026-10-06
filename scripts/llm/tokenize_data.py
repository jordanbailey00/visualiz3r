"""Pre-tokenize the TinyStories train prefix + validation set into uint16 token streams.

Each story is normalized, stripped, prefixed with <|endoftext|> (id 2047, also BOS) and
all stories are concatenated.

Usage:  python3 scripts/llm/tokenize_data.py
Output: scripts/llm/data/train_tokens.npy, scripts/llm/data/valid_tokens.npy
"""

from __future__ import annotations

import os
import time
from multiprocessing import Pool

import numpy as np

from bpe import BPETokenizer, iter_stories
from paths import TOKENIZER_JSON, TRAIN_TOKENS, VALID_TOKENS
from prepare_data import TRAIN_TXT, VALID_TXT
from train_tokenizer import read_parts

_tok: BPETokenizer | None = None


def _init() -> None:
    global _tok
    _tok = BPETokenizer.load(TOKENIZER_JSON)


def _encode_chunk(raw: str) -> tuple[np.ndarray, int]:
    out: list[int] = []
    n = 0
    for story in iter_stories(raw):
        out.extend(_tok.encode_story(story))
        n += 1
    return np.asarray(out, dtype=np.uint16), n


def encode_file(src: str, dst: str, pool: Pool) -> None:
    t0 = time.time()
    chunks = read_parts(src, 512)
    arrays, n_stories = [], 0
    for arr, n in pool.imap(_encode_chunk, chunks):  # ordered
        arrays.append(arr)
        n_stories += n
    tokens = np.concatenate(arrays)
    np.save(dst, tokens)
    n_chars = os.path.getsize(src)
    print(f"{os.path.basename(src)}: {n_stories:,} stories -> {len(tokens):,} tokens "
          f"({n_chars / len(tokens):.2f} bytes/token) in {time.time() - t0:.1f}s -> {dst}")


def main() -> None:
    with Pool(os.cpu_count(), initializer=_init) as pool:
        encode_file(VALID_TXT, VALID_TOKENS, pool)
        encode_file(TRAIN_TXT, TRAIN_TOKENS, pool)


if __name__ == "__main__":
    main()
