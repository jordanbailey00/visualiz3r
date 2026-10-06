"""Download TinyStories V2 (GPT-4) data into scripts/llm/data/.

- validation: full TinyStoriesV2-GPT4-valid.txt (~22 MB)
- training:   the first ~500 MB of TinyStoriesV2-GPT4-train.txt, fetched with an
              HTTP Range request (curl -r 0-500000000); the trailing partial story
              (everything after the last `<|endoftext|>` separator) is dropped.

Usage:  python3 scripts/llm/prepare_data.py [--train-bytes 500000000]
Re-running is a no-op when the files already exist.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys

from paths import DATA_DIR

BASE = "https://huggingface.co/datasets/roneneldan/TinyStories/resolve/main/"
VALID_URL = BASE + "TinyStoriesV2-GPT4-valid.txt"
TRAIN_URL = BASE + "TinyStoriesV2-GPT4-train.txt"

VALID_TXT = os.path.join(DATA_DIR, "TinyStoriesV2-GPT4-valid.txt")
TRAIN_PART = os.path.join(DATA_DIR, "TinyStoriesV2-GPT4-train.prefix.part")
TRAIN_TXT = os.path.join(DATA_DIR, "TinyStoriesV2-GPT4-train-prefix.txt")

SEP = b"<|endoftext|>"


def curl(url: str, out: str, byte_range: str | None = None) -> None:
    cmd = ["curl", "-L", "--fail", "--retry", "5", "-o", out]
    if byte_range:
        cmd += ["-r", byte_range]
    cmd.append(url)
    print("+", " ".join(cmd), flush=True)
    subprocess.run(cmd, check=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--train-bytes", type=int, default=500_000_000)
    args = ap.parse_args()
    os.makedirs(DATA_DIR, exist_ok=True)

    if not os.path.exists(VALID_TXT):
        curl(VALID_URL, VALID_TXT + ".part")
        os.replace(VALID_TXT + ".part", VALID_TXT)
    print(f"valid: {os.path.getsize(VALID_TXT):,} bytes")

    if not os.path.exists(TRAIN_TXT):
        if not os.path.exists(TRAIN_PART):
            curl(TRAIN_URL, TRAIN_PART + ".tmp", f"0-{args.train_bytes}")
            os.replace(TRAIN_PART + ".tmp", TRAIN_PART)
        with open(TRAIN_PART, "rb") as f:
            raw = f.read()
        if len(raw) > args.train_bytes + 1:
            sys.exit(f"server ignored the Range request ({len(raw):,} bytes); aborting")
        cut = raw.rfind(SEP)
        if cut < 0:
            sys.exit("no story separator found in the downloaded prefix")
        cut += len(SEP)
        with open(TRAIN_TXT + ".tmp", "wb") as f:
            f.write(raw[:cut] + b"\n")
        os.replace(TRAIN_TXT + ".tmp", TRAIN_TXT)
        os.remove(TRAIN_PART)
        print(f"dropped {len(raw) - cut:,} trailing bytes (partial story)")
    print(f"train prefix: {os.path.getsize(TRAIN_TXT):,} bytes")


if __name__ == "__main__":
    main()
