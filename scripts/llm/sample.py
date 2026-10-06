"""Qualitative check: sample stories and show top-10 next-token probabilities.

Usage:  python3 scripts/llm/sample.py --ckpt scripts/llm/checkpoints/d64.pt [--n 3]
"""

from __future__ import annotations

import argparse

from paths import TOKENIZER_JSON, keep_caches_in_repo

keep_caches_in_repo()

import torch  # noqa: E402

from bpe import BPETokenizer  # noqa: E402
from model import ModelConfig, TinyLlama  # noqa: E402

PROMPTS = [
    "Once upon a time, there was a little",
    "Tom and his dog went to the",
    "Lily wanted to",
    "One day, a big red ball",
    "The sun was shining and",
]
TOPK_PROMPTS = [
    "Once upon a time, there was a little",
    "Tom and his dog went to the",
    "She was very",
    'Lily said, "',
]


@torch.no_grad()
def generate(model, tok: BPETokenizer, prompt: str, dev, max_new=120, temperature=0.8, top_k=40, seed=0):
    g = torch.Generator(device=dev)
    g.manual_seed(seed)
    ids = tok.encode(prompt, add_bos=True)
    T = model.cfg.max_seq_len
    out = []
    for _ in range(max_new):
        x = torch.tensor([ids[-T:]], device=dev)
        logits = model(x)[0, -1].float() / temperature
        v, ix = torch.topk(logits, top_k)
        p = torch.softmax(v, -1)
        nxt = int(ix[torch.multinomial(p, 1, generator=g)].item())
        if nxt == tok.bos_id:
            break
        ids.append(nxt)
        out.append(nxt)
    return tok.decode(out)


@torch.no_grad()
def topk_next(model, tok: BPETokenizer, prompt: str, dev, k=10):
    ids = tok.encode(prompt, add_bos=True)
    logits = model(torch.tensor([ids], device=dev))[0, -1].float()
    p = torch.softmax(logits, -1)
    v, ix = torch.topk(p, k)
    return [(tok.token_str(int(i)), float(pv)) for pv, i in zip(v, ix)]


def show_samples(model, dev, log=print, n_seeds: int = 1):
    tok = BPETokenizer.load(TOKENIZER_JSON)
    log("--- samples (temperature 0.8, top-k 40) ---")
    for prompt in PROMPTS:
        for s in range(n_seeds):
            log(f"[{prompt}]{generate(model, tok, prompt, dev, seed=s)}")
            log("")
    log("--- top-10 next tokens ---")
    for prompt in TOPK_PROMPTS:
        log(f"{prompt!r}: " + ", ".join(f"{t!r} {p:.3f}" for t, p in topk_next(model, tok, prompt, dev)))


def load_ckpt(path: str, dev) -> TinyLlama:
    ck = torch.load(path, map_location="cpu")
    model = TinyLlama(ModelConfig.from_json(ck["config"]))
    model.load_state_dict(ck["model"])
    return model.to(dev).eval()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--ckpt", required=True)
    ap.add_argument("--n", type=int, default=2)
    a = ap.parse_args()
    dev = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    show_samples(load_ckpt(a.ckpt, dev), dev, n_seeds=a.n)
