# Tiny TinyStories LLM: training + export pipeline

This directory trains the small Llama-style language model whose real weights and
activations are visualized by the app. The browser engine lives in `lib/llm/`
(dependency-free TypeScript); this directory is the PyTorch side.

Everything runs from the repository root. Python 3.12 with torch (CUDA) and numpy, and
Node 22 with `tsx` for the TypeScript checks. Downloads, token caches and checkpoints go
to `scripts/llm/data/` and `scripts/llm/checkpoints/` (both git-ignored). The
torch.compile, Triton and temp caches are redirected into `checkpoints/cache/`.

## Pipeline

```bash
# 1. data: TinyStoriesV2-GPT4 valid (22 MB) + first 500 MB of train (HTTP Range), trailing partial story dropped
python3 scripts/llm/prepare_data.py

# 2. tokenizer: byte-level BPE, 256 bytes + 1791 merges + <|endoftext|> = 2048 ids  -> public/llm/tokenizer.json
python3 scripts/llm/train_tokenizer.py

# 3. tokenize: uint16 token streams, every story prefixed with <|endoftext|> (2047)
python3 scripts/llm/tokenize_data.py          # -> scripts/llm/data/{train,valid}_tokens.npy

# 4. train (about 9 min on an RTX 5070 Ti); logs to scripts/llm/checkpoints/train_log.txt
python3 scripts/llm/train.py --preset d64 --steps 60000 --warmup 1000 --lr 1e-2 --run d64_60k

# 5. export -> public/llm/model.json + public/llm/model.bin (+ demo samples, float32 loss eval)
python3 scripts/llm/export_model.py --ckpt scripts/llm/checkpoints/d64_60k.pt

# 6. test fixtures -> tests/fixtures/llm-reference.json, tests/fixtures/llm-tokenizer.json
python3 scripts/llm/export_reference.py

# 7. TypeScript tests
node --import tsx --test tests/llm-*.test.ts
```

Optional checks:

```bash
python3 scripts/llm/sample.py --ckpt scripts/llm/checkpoints/d64_60k.pt # samples + top-10 next tokens (GPU)
node --import tsx scripts/llm/check_tokenizer_parity.ts                # TS tokenizer == Python on the whole valid set
node --import tsx scripts/llm/bench_forward.ts 128                     # forward() latency in V8
```

Training is not bit-reproducible (GPU atomics, compile autotuning), so after re-training
always re-run steps 5-7: the model test checks that the fixture matches `model.bin` (sha256).

## Shipped model and how it was chosen

- Config `d64`: vocab 2048, d_model 64, 4 layers, 4 heads x 16, SwiGLU 256, context 128:
  393,792 parameters (262,720 non-embedding). 60k steps x 256 x 128 = 1.97B tokens (~15 passes over the
  134M-token prefix; train and val loss stay equal, so there is no overfitting at this size).
- Final float32 loss: train 1.933, val 1.932 nats/token (3.7 bytes/token).
- LR sweep (d64, 6k steps, val loss): 2e-3 2.085, 3e-3 2.051, 5e-3 2.038, 8e-3 2.027, 1.2e-2 2.015,
  2e-2 2.015, 3e-2 2.027, 5e-2 2.033, so peak LR is 1e-2.
- d64 at 30k steps reached val 1.946; doubling to 60k gave 1.932.
- `d96` (787k params, 30k steps, LR 8e-3) reaches val 1.742 and writes noticeably more coherent stories.
  d64 already writes grammatical TinyStories-style English, so the smaller model was kept for legibility.
  The d96 checkpoint can be exported with the same two commands (`--ckpt .../d96.pt`) if needed.

## Files

| file | purpose |
| --- | --- |
| `paths.py` | shared paths; keeps compiler/temp caches inside `checkpoints/cache/` |
| `prepare_data.py` | downloads the data with `curl` (range request for the train prefix) |
| `bpe.py` | `normalize_text`, the pre-tokenization regex, BPE training, `BPETokenizer` (Python twin of `lib/llm/tokenizer.ts`) |
| `train_tokenizer.py` | counts pre-tokens (multiprocessing) and learns the merges |
| `tokenize_data.py` | encodes train and valid into `uint16` `.npy` streams |
| `model.py` | `TinyLlama` training module, export layout, explicit `reference_forward` (mirrors `lib/llm/model.ts`), `Mulberry32` and `sample_token` ports |
| `train.py` | AdamW + warmup/cosine, bf16 autocast, torch.compile, random 129-token windows |
| `sample.py` | qualitative check: samples (T=0.8, top-k 40) and top-10 next-token probabilities |
| `export_model.py` | writes `public/llm/model.{json,bin}` and checks that reference forward == module |
| `export_reference.py` | writes the test fixtures (PyTorch float32 CPU reference activations, greedy continuations, tokenizer cases) |
| `check_tokenizer_parity.ts` | full-dataset tokenizer parity check (needs `data/`) |
| `bench_forward.ts` | forward-pass latency benchmark |
| `tsconfig.check.json` | scoped type check: `npx tsc --noEmit -p scripts/llm/tsconfig.check.json` |

## Conventions shared with `lib/llm`

- **Normalization** (`normalize_text` / `normalizeText`): NFKC; `‘ ’ ‚ ′` → `'`, `“ ” „ ″` → `"`, `– —` → `-`,
  `…` → `...`, NBSP → space; strip U+0000–U+001F except `\n`, U+007F–U+009F and U+FEFF; lone surrogates → U+FFFD.
- **Pre-tokenization regex** (same string in Python `re` and JS `RegExp(p, "g")`):
  `'(?:s|t|re|ve|m|ll|d)| ?[A-Za-z]+| ?[0-9]+| ?[^\sA-Za-z0-9]+|\s+(?!\S)|\s+`
- **Tokens**: ids 0–255 are bytes, merge *i* creates id 256+*i*, `<|endoftext|>` = 2047 is BOS and the story separator.
- **Weights** (`model.bin`, little-endian float32, order and offsets in `model.json`): `tok_emb [V,C]`,
  `layers.i.{attn_norm [C], wq/wk/wv/wo [C,C], mlp_norm [C], w_gate/w_up [C,F], w_down [F,C]}`, `final_norm [C]`.
  Every linear weight is stored `[in, out]` (y = x @ W), the transpose of `nn.Linear.weight`.
- **RoPE**: interleaved pairs `(x[2i], x[2i+1])` per head, angle = pos · θ^(−2i/d_head), pos = 0-based position.
