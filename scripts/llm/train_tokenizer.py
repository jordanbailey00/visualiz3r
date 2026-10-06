"""Learn the 2048-token byte-level BPE vocabulary on the TinyStories training prefix.

Usage:  python3 scripts/llm/train_tokenizer.py
Output: public/llm/tokenizer.json
"""

from __future__ import annotations

import json
import os
import time
from collections import Counter
from multiprocessing import Pool

from bpe import EOT, N_MERGES, VOCAB_SIZE, BPETokenizer, count_words, iter_stories, train_bpe
from paths import PUBLIC_DIR, TOKENIZER_JSON
from prepare_data import TRAIN_TXT, VALID_TXT


def read_parts(path: str, n_chunks: int) -> list[str]:
    with open(path, encoding="utf-8") as f:
        parts = f.read().split(EOT)
    size = (len(parts) + n_chunks - 1) // n_chunks
    return [EOT.join(parts[i : i + size]) for i in range(0, len(parts), size)]


def _count_chunk(raw: str) -> Counter:
    return count_words(iter_stories(raw))


def main() -> None:
    t0 = time.time()
    chunks = read_parts(TRAIN_TXT, 256)
    with Pool(os.cpu_count()) as pool:
        counts: Counter = Counter()
        for c in pool.imap_unordered(_count_chunk, chunks):
            counts.update(c)
    print(f"counted {sum(counts.values()):,} pre-tokens, {len(counts):,} unique in {time.time() - t0:.1f}s")
    for w, c in counts.most_common(15):
        print(f"  {w!r}: {c:,}")

    t1 = time.time()
    merges = train_bpe(counts, N_MERGES)
    print(f"learned {len(merges)} merges in {time.time() - t1:.1f}s")

    tok = BPETokenizer(merges, {EOT: VOCAB_SIZE - 1}, VOCAB_SIZE)
    os.makedirs(PUBLIC_DIR, exist_ok=True)
    with open(TOKENIZER_JSON, "w") as f:
        json.dump(tok.to_json(), f, separators=(",", ":"))
    print(f"wrote {TOKENIZER_JSON} ({os.path.getsize(TOKENIZER_JSON):,} bytes)")

    # quick stats on the validation set
    with open(VALID_TXT, encoding="utf-8") as f:
        stories = list(iter_stories(f.read()))[:2000]
    n_chars = sum(len(s) for s in stories)
    n_tok = sum(len(tok.encode_story(s)) - 1 for s in stories)
    print(f"valid sample: {n_chars / n_tok:.2f} chars/token")
    print("last merges:", [tok.token_str(256 + i) for i in range(N_MERGES - 20, N_MERGES)])
    print("example:", [tok.token_str(i) for i in tok.encode(stories[0][:200])])


if __name__ == "__main__":
    main()
