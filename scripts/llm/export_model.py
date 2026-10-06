"""Export a trained checkpoint to public/llm/model.json + public/llm/model.bin.

model.bin  : little-endian float32 tensors concatenated in the order of model.json "tensors"
model.json : config, tensor table (name/shape/dtype/offset/length), training metadata and
             demo samples. Linear weights are stored [in, out] (y = x @ W).

The demo samples are generated with the Python twin of the TypeScript sampler
(mulberry32 seed + temperature + top-k, float64-accumulated forward), so
`generate(model, tokenizer, prompt, {seed, temperature, topK, maxNewTokens})` in
lib/llm reproduces them.

Usage:  python3 scripts/llm/export_model.py --ckpt scripts/llm/checkpoints/d64.pt
"""

from __future__ import annotations

import argparse
import json
import os
import re

from paths import MODEL_BIN, MODEL_JSON, PUBLIC_DIR, TOKENIZER_JSON, TRAIN_TOKENS, VALID_TOKENS, keep_caches_in_repo

keep_caches_in_repo()

import numpy as np  # noqa: E402
import torch  # noqa: E402
import torch.nn.functional as F  # noqa: E402

from bpe import BPETokenizer  # noqa: E402
from model import ModelConfig, Mulberry32, TinyLlama, export_tensors, load_exported, reference_forward, sample_token  # noqa: E402

SAMPLE_PROMPTS = [
    ("Once upon a time, there was a little", 1),
    ("Tom and his dog went to the", 2),
    ("Lily wanted to", 3),
    ("One day, a big red ball", 4),
    ("The sun was shining and", 5),
]
SAMPLE_TEMPERATURE = 0.8
SAMPLE_TOP_K = 40
SAMPLE_MAX_NEW = 100


def dumps_pretty(obj) -> str:
    """indent=1 JSON, but arrays of plain numbers stay on one line."""
    s = json.dumps(obj, indent=1)
    return re.sub(r"\[\s*([-0-9.,eE\s]+?)\s*\]",
                  lambda m: "[" + ",".join(x.strip() for x in m.group(1).split(",")) + "]", s)


def generate_like_ts(cfg, W, tok: BPETokenizer, prompt: str, seed: int, temperature: float, top_k: int,
                     max_new: int) -> tuple[list[int], bool]:
    """Exactly what lib/llm generate() does (BOS + sliding window + sampleToken)."""
    rng = Mulberry32(seed)
    ids = tok.encode(prompt, add_bos=True)
    out: list[int] = []
    stopped = False
    for _ in range(max_new):
        ctx = ids[-cfg.max_seq_len:]
        logits = reference_forward(cfg, W, ctx, f64_accum=True)["logits"][-1].numpy()
        nxt, _ = sample_token(logits, temperature, top_k, None, rng)
        if nxt == tok.bos_id:
            stopped = True
            break
        ids.append(nxt)
        out.append(nxt)
    return out, stopped


@torch.no_grad()
def eval_fp32(model: TinyLlama, n_train_windows: int = 16384) -> tuple[float, float]:
    """Exact float32 (no TF32/bf16) mean cross-entropy: full validation set and a fixed
    random sample of training windows (seed 999)."""
    dev = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    torch.backends.cuda.matmul.allow_tf32 = False
    torch.backends.cudnn.allow_tf32 = False
    m = TinyLlama(model.cfg).to(dev)
    m.load_state_dict(model.state_dict())
    m.eval()
    T, V = model.cfg.max_seq_len, model.cfg.vocab_size

    def mean_ce(xs: torch.Tensor, ys: torch.Tensor) -> float:
        tot = 0.0
        for i in range(0, len(xs), 512):
            logits = m(xs[i : i + 512].to(dev))
            tot += F.cross_entropy(logits.float().view(-1, V), ys[i : i + 512].to(dev).reshape(-1), reduction="sum").item()
        return tot / ys.numel()

    valid = torch.from_numpy(np.load(VALID_TOKENS).astype(np.int64))
    n = (len(valid) - 1) // T
    val = mean_ce(valid[: n * T].view(n, T), valid[1 : n * T + 1].view(n, T))
    train = np.load(TRAIN_TOKENS, mmap_mode="r")
    starts = np.random.default_rng(999).integers(0, len(train) - T - 1, n_train_windows)
    win = torch.from_numpy(np.asarray(train[starts[:, None] + np.arange(T + 1)], dtype=np.int64))
    tr = mean_ce(win[:, :-1], win[:, 1:])
    return tr, val


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ckpt", required=True)
    args = ap.parse_args()

    ck = torch.load(args.ckpt, map_location="cpu")
    cfg = ModelConfig.from_json(ck["config"])
    model = TinyLlama(cfg)
    model.load_state_dict(ck["model"])
    model.eval()
    tok = BPETokenizer.load(TOKENIZER_JSON)
    assert tok.vocab_size == cfg.vocab_size

    tensors = export_tensors(model)
    os.makedirs(PUBLIC_DIR, exist_ok=True)
    table, offset = [], 0
    with open(MODEL_BIN, "wb") as f:
        for name, arr in tensors:
            b = arr.astype("<f4").tobytes()
            f.write(b)
            table.append({"name": name, "shape": list(arr.shape), "dtype": "float32", "offset": offset,
                          "length": int(arr.size)})
            offset += len(b)

    n_total, n_nonemb = model.num_params()
    a = ck["args"]
    train_loss, val_loss = eval_fp32(model)
    print(f"float32 eval: train {train_loss:.4f} | val {val_loss:.4f} "
          f"(bf16 values at end of training: train {ck['final_train_loss']:.4f} | val {ck['final_val_loss']:.4f})")
    meta = {
        "config": cfg.to_json(),
        "tensors": table,
        "training": {
            "dataset": "TinyStoriesV2-GPT4 (roneneldan/TinyStories): first 500 MB of the train split "
                       f"({ck['train_tokens']:,} tokens), validation = full valid split",
            "train_tokens_seen": int(ck["tokens_seen"]),
            "steps": int(ck["steps"]),
            "final_train_loss": round(train_loss, 4),
            "final_val_loss": round(val_loss, 4),
            "params_total": int(n_total),
            "params_non_embedding": int(n_nonemb),
            "notes": (
                f"Llama-style decoder (pre-norm RMSNorm, RoPE interleaved, SwiGLU, no biases, tied embeddings). "
                f"AdamW(0.9, 0.95), wd {a['wd']} on 2-D weights, peak LR {a['lr']:g}, {a['warmup']} warmup steps, "
                f"cosine to {a['min_lr_frac']:g}x, batch {a['batch']}x{cfg.max_seq_len} tokens, grad clip {a['clip']}, "
                f"bf16 autocast, {ck['elapsed_s'] / 60:.1f} min on an RTX 5070 Ti. Losses: float32 mean cross-entropy "
                f"(nats/token) on the full validation split and on {16384 * cfg.max_seq_len:,} random training tokens."
            ),
            "batch_size": a["batch"],
            "context_length": cfg.max_seq_len,
            "peak_lr": a["lr"],
            "tokenizer": "byte-level BPE, 2048 tokens (256 bytes + 1791 merges + <|endoftext|>)",
        },
        "samples": [],
    }

    # sanity: reference forward on exported weights == torch module
    with open(MODEL_JSON, "w") as f:
        json.dump(meta, f)
    cfg2, W, _ = load_exported(MODEL_JSON, MODEL_BIN)
    ids = tok.encode("Once upon a time, there was a little girl named Lily.", add_bos=True)
    with torch.no_grad():
        ref_mod = model(torch.tensor([ids]))[0]
    ref = reference_forward(cfg2, W, ids)
    err = (ref["logits"] - ref_mod).abs().max().item()
    print(f"reference forward vs torch module: max |dlogits| = {err:.2e}")
    assert err < 1e-4, err

    for prompt, seed in SAMPLE_PROMPTS:
        out, stopped = generate_like_ts(cfg2, W, tok, prompt, seed, SAMPLE_TEMPERATURE, SAMPLE_TOP_K, SAMPLE_MAX_NEW)
        completion = tok.decode(out)
        meta["samples"].append({
            "prompt": prompt,
            "completion": completion,
            "seed": seed,
            "temperature": SAMPLE_TEMPERATURE,
            "top_k": SAMPLE_TOP_K,
            "max_new_tokens": SAMPLE_MAX_NEW,
            "stopped_at_end_of_text": stopped,
            "token_ids": out,
        })
        print(f"[{prompt}]{completion}\n")

    with open(MODEL_JSON, "w") as f:
        f.write(dumps_pretty(meta))
    print(f"wrote {MODEL_JSON} ({os.path.getsize(MODEL_JSON):,} B) and {MODEL_BIN} ({os.path.getsize(MODEL_BIN):,} B)")


if __name__ == "__main__":
    main()
