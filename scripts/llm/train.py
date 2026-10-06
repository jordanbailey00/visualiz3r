"""Train the tiny Llama-style model on pre-tokenized TinyStories.

Usage (the defaults reproduce the shipped model, ~9 min on an RTX 5070 Ti):
  python3 scripts/llm/train.py --preset d64 --steps 60000 --lr 1e-2 --run d64_60k
Writes scripts/llm/checkpoints/<run>.pt and appends to scripts/llm/checkpoints/train_log.txt.
Runs are not bit-reproducible (GPU atomics / compile autotuning) but land at the same loss.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time

from paths import CKPT_DIR, TRAIN_TOKENS, VALID_TOKENS, keep_caches_in_repo

keep_caches_in_repo()

import numpy as np  # noqa: E402
import torch  # noqa: E402
import torch.nn.functional as F  # noqa: E402

from model import PRESETS, ModelConfig, TinyLlama  # noqa: E402


def get_args():
    ap = argparse.ArgumentParser()
    ap.add_argument("--preset", default="d64", choices=sorted(PRESETS))
    ap.add_argument("--run", default=None, help="run name (default: preset)")
    ap.add_argument("--steps", type=int, default=60000)
    ap.add_argument("--batch", type=int, default=256)
    ap.add_argument("--lr", type=float, default=1e-2, help="peak LR (sweep: 1e-2..2e-2 best for d64)")
    ap.add_argument("--min-lr-frac", type=float, default=0.05)
    ap.add_argument("--warmup", type=int, default=1000)
    ap.add_argument("--wd", type=float, default=0.1)
    ap.add_argument("--clip", type=float, default=1.0)
    ap.add_argument("--eval-every", type=int, default=2000)
    ap.add_argument("--eval-batches", type=int, default=24)
    ap.add_argument("--seed", type=int, default=1337)
    ap.add_argument("--no-compile", action="store_true")
    ap.add_argument("--log", default="train_log.txt", help="log file name inside checkpoints/")
    ap.add_argument("--no-save", action="store_true", help="skip checkpoint + samples (sweeps)")
    return ap.parse_args()


def lr_at(step: int, args) -> float:
    if step < args.warmup:
        return args.lr * (step + 1) / args.warmup
    t = (step - args.warmup) / max(1, args.steps - args.warmup)
    t = min(1.0, t)
    lo = args.lr * args.min_lr_frac
    return lo + 0.5 * (args.lr - lo) * (1 + math.cos(math.pi * t))


def main():
    args = get_args()
    run = args.run or args.preset
    torch.manual_seed(args.seed)
    np.random.seed(args.seed)
    dev = torch.device("cuda")
    torch.backends.cuda.matmul.allow_tf32 = True
    torch.backends.cudnn.allow_tf32 = True

    cfg: ModelConfig = PRESETS[args.preset]
    T = cfg.max_seq_len
    train = torch.from_numpy(np.load(TRAIN_TOKENS).astype(np.int32)).to(dev)
    valid = torch.from_numpy(np.load(VALID_TOKENS).astype(np.int32)).to(dev)
    n_val_win = (len(valid) - 1) // T
    val_x = valid[: n_val_win * T].view(n_val_win, T)
    val_y = valid[1 : n_val_win * T + 1].view(n_val_win, T)
    g = torch.Generator(device=dev)
    g.manual_seed(args.seed)
    ar = torch.arange(T + 1, device=dev)

    def batch():
        ix = torch.randint(0, len(train) - T - 1, (args.batch,), device=dev, generator=g)
        seq = train[ix[:, None] + ar].long()
        return seq[:, :-1], seq[:, 1:]

    model = TinyLlama(cfg).to(dev)
    n_total, n_nonemb = model.num_params()
    decay = [p for p in model.parameters() if p.dim() >= 2]
    no_decay = [p for p in model.parameters() if p.dim() < 2]
    opt = torch.optim.AdamW(
        [{"params": decay, "weight_decay": args.wd}, {"params": no_decay, "weight_decay": 0.0}],
        lr=args.lr, betas=(0.9, 0.95), eps=1e-8, fused=True,
    )
    fmodel = model if args.no_compile else torch.compile(model)

    def loss_fn(x, y):
        with torch.autocast("cuda", dtype=torch.bfloat16):
            logits = fmodel(x)
        return F.cross_entropy(logits.float().view(-1, cfg.vocab_size), y.reshape(-1))

    @torch.no_grad()
    def evaluate(n_batches: int | None, split: str = "val") -> float:
        model.eval()
        losses = []
        if split == "val":
            n = n_val_win if n_batches is None else min(n_val_win, n_batches * args.batch)
            for i in range(0, n, args.batch):
                xb, yb = val_x[i : min(i + args.batch, n)].long(), val_y[i : min(i + args.batch, n)].long()
                losses.append(loss_fn(xb, yb).item() * len(xb))
            model.train()
            return sum(losses) / n
        eg = torch.Generator(device=dev)
        eg.manual_seed(999)
        tot = 0
        for _ in range(n_batches or 64):
            ix = torch.randint(0, len(train) - T - 1, (args.batch,), device=dev, generator=eg)
            seq = train[ix[:, None] + ar].long()
            losses.append(loss_fn(seq[:, :-1], seq[:, 1:]).item() * args.batch)
            tot += args.batch
        model.train()
        return sum(losses) / tot

    os.makedirs(CKPT_DIR, exist_ok=True)
    log_path = os.path.join(CKPT_DIR, args.log)
    logf = open(log_path, "a")

    def log(msg: str):
        print(msg, flush=True)
        logf.write(msg + "\n")
        logf.flush()

    log(f"=== run {run} | {time.strftime('%Y-%m-%d %H:%M:%S')} | {json.dumps(cfg.to_json())}")
    log(f"args: {vars(args)}")
    log(f"params total {n_total:,} | non-embedding {n_nonemb:,} | train tokens {len(train):,} | val tokens {len(valid):,}")

    t0 = time.time()
    run_loss, run_n = 0.0, 0
    tokens_per_step = args.batch * T
    for step in range(args.steps):
        lr = lr_at(step, args)
        for gp in opt.param_groups:
            gp["lr"] = lr
        x, y = batch()
        loss = loss_fn(x, y)
        opt.zero_grad(set_to_none=True)
        loss.backward()
        gn = torch.nn.utils.clip_grad_norm_(model.parameters(), args.clip)
        opt.step()
        run_loss += loss.detach()
        run_n += 1
        if (step + 1) % args.eval_every == 0 or step == 0 or step + 1 == args.steps:
            tl = (run_loss / run_n).item()
            run_loss, run_n = 0.0, 0
            vl = evaluate(args.eval_batches)
            el = time.time() - t0
            log(f"step {step + 1:6d} | train {tl:.4f} | val {vl:.4f} | lr {lr:.2e} | gnorm {gn.item():.3f} "
                f"| tokens {(step + 1) * tokens_per_step / 1e6:.1f}M | {el:.0f}s ({el / (step + 1) * 1000:.1f} ms/step)")
            if not math.isfinite(tl):
                sys.exit("loss diverged")

    final_val = evaluate(None)
    final_train = evaluate(64, "train")
    elapsed = time.time() - t0
    log(f"FINAL run {run}: train {final_train:.4f} | val {final_val:.4f} (full val set, {n_val_win * T:,} tokens) | {elapsed / 60:.1f} min")
    if args.no_save:
        return
    ckpt = {
        "config": cfg.to_json(),
        "preset": args.preset,
        "model": {k: v.detach().cpu() for k, v in model.state_dict().items()},
        "steps": args.steps,
        "tokens_seen": args.steps * tokens_per_step,
        "final_train_loss": final_train,
        "final_val_loss": final_val,
        "train_tokens": int(len(train)),
        "args": vars(args),
        "elapsed_s": elapsed,
        "params_total": n_total,
        "params_non_embedding": n_nonemb,
    }
    path = os.path.join(CKPT_DIR, f"{run}.pt")
    torch.save(ckpt, path)
    log(f"saved {path}")

    # quick qualitative check
    from sample import show_samples

    model.eval()
    show_samples(model.float(), dev, log)


if __name__ == "__main__":
    main()
