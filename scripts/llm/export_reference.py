"""Write the test fixtures used by tests/llm-*.test.ts.

tests/fixtures/llm-reference.json : PyTorch float32 CPU reference activations of the
    exported model (public/llm/model.{json,bin}) for a few prompts, greedy
    continuations, and mulberry32 reference values.
tests/fixtures/llm-tokenizer.json : ~200 diverse validation lines + synthetic edge cases
    with the Python normalizer/encoder output.

Usage:  python3 scripts/llm/export_reference.py [--only tokenizer|model]
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import random

from paths import FIXTURE_DIR, MODEL_BIN, MODEL_JSON, TOKENIZER_JSON, keep_caches_in_repo

keep_caches_in_repo()

import torch  # noqa: E402

from bpe import PATTERN, BPETokenizer, normalize_text  # noqa: E402
from model import Mulberry32, load_exported, reference_forward  # noqa: E402
from prepare_data import VALID_TXT  # noqa: E402

PROMPTS = [
    "Once upon a time, there was a little",
    "Tom and his dog went to the park. Tom",
    "Lily wanted to",
    "The 3 cats said: \N{LEFT DOUBLE QUOTATION MARK}hi!\N{RIGHT DOUBLE QUOTATION MARK} \N{EM DASH} wow\N{HORIZONTAL ELLIPSIS}",
]
GREEDY_STEPS = 20
GREEDY_MIN_MARGIN = 1e-3  # stop the stored greedy continuation before any near-tie

ROW_FIELDS_C = ["input", "attnNormed", "q", "k", "v", "qRot", "kRot", "concat", "attnOut", "resid1",
                "mlpNormed", "mlpOut", "output"]
ROW_FIELDS_F = ["gate", "up", "act", "hidden"]


def r8(x: float) -> float:
    return float(f"{x:.8g}")


def vec(t: torch.Tensor) -> list:
    return [r8(v) for v in t.reshape(-1).tolist()]


def nested(t: torch.Tensor):
    if t.dim() == 1:
        return vec(t)
    return [nested(s) for s in t]


def greedy(cfg, W, ids: list[int], steps: int) -> tuple[list[int], list[float]]:
    ids = list(ids)
    out, margins = [], []
    for _ in range(steps):
        logits = reference_forward(cfg, W, ids[-cfg.max_seq_len:])["logits"][-1]
        top2 = torch.topk(logits, 2)
        margin = float(top2.values[0] - top2.values[1])
        if margin < GREEDY_MIN_MARGIN:
            break
        nxt = int(top2.indices[0])
        ids.append(nxt)
        out.append(nxt)
        margins.append(r8(margin))
    return out, margins


def model_fixture(tok: BPETokenizer) -> dict:
    cfg, W, meta = load_exported(MODEL_JSON, MODEL_BIN)
    with open(MODEL_BIN, "rb") as f:
        sha = hashlib.sha256(f.read()).hexdigest()
    fx: dict = {
        "about": "PyTorch float32 CPU reference forward of public/llm/model.bin "
                 "(scripts/llm/model.py reference_forward). Regenerate with scripts/llm/export_reference.py.",
        "model_bin_sha256": sha,
        "config": meta["config"],
        "tolerance": 1e-4,
        "mulberry32": {"seed": 12345, "values": []},
        "prompts": [],
    }
    rng = Mulberry32(12345)
    fx["mulberry32"]["values"] = [rng() for _ in range(10)]
    rng2 = Mulberry32(-7)
    fx["mulberry32_negative_seed"] = {"seed": -7, "values": [rng2() for _ in range(5)]}

    for text in PROMPTS:
        norm = normalize_text(text)
        ids = tok.encode(text, add_bos=True)
        tr = reference_forward(cfg, W, ids)
        T = len(ids)
        layers = []
        for L in tr["layers"]:
            layers.append({
                "attnNormRms": vec(L["attnNormRms"]),
                "mlpNormRms": vec(L["mlpNormRms"]),
                "lastRow": {k: vec(L[k][-1]) for k in ROW_FIELDS_C + ROW_FIELDS_F},
                "firstRow": {k: vec(L[k][0]) for k in ("q", "qRot", "kRot", "gate", "output")},
                "scoresLastRow": nested(L["scores"][:, -1, :]),  # [H, T] (last query sees every key)
                "probsLastRow": nested(L["probs"][:, -1, :]),
                "headOutLast": nested(L["headOut"][:, -1, :]),  # [H, D]
            })
        probs = tr["probs"]
        top = torch.topk(probs, 10)
        g_ids, g_margins = greedy(cfg, W, ids, GREEDY_STEPS)
        fx["prompts"].append({
            "text": text,
            "normalized": norm,
            "ids": ids,
            "pieces": [tok.token_str(i) for i in ids],
            "T": T,
            "embeddingsLast": vec(tr["embeddings"][-1]),
            "finalNormRms": vec(tr["finalNormRms"]),
            "finalNormedLast": vec(tr["finalNormed"][-1]),
            "logitsLast": vec(tr["logits"][-1]),
            "logitsFirst": vec(tr["logits"][0]),
            "probsTop10": [[int(i), r8(float(p))] for p, i in zip(top.values, top.indices)],
            "layer0Probs": nested(tr["layers"][0]["probs"]),  # [H, T, T]
            "layer0QRotLast": vec(tr["layers"][0]["qRot"][-1]),
            "lastLayerOutputLast": vec(tr["layers"][-1]["output"][-1]),
            "layers": layers,
            "greedy": {"ids": g_ids, "margins": g_margins, "text": tok.decode(g_ids)},
        })
        print(f"{text!r}: T={T}, greedy -> {tok.decode(g_ids)!r} (min margin {min(g_margins) if g_margins else None})")
        print("   top5:", [(tok.token_str(i), p) for i, p in fx["prompts"][-1]["probsTop10"][:5]])
    return fx


EDGE_CASES = [
    "", " ", "  ", "\n", "\n\n", "Hello  world", "Hello   world  ", "a\tb", "x\r\ny", "\ttabbed\tline",
    "<|endoftext|>", "Hi<|endoftext|>there", "<|endoftext|><|endoftext|>", "end. <|endoftext|> Start",
    "<|endoftext", "caf\N{LATIN SMALL LETTER E WITH ACUTE} au lait",
    "na\N{LATIN SMALL LETTER I WITH DIAERESIS}ve r\N{LATIN SMALL LETTER E WITH ACUTE}sum\N{LATIN SMALL LETTER E WITH ACUTE}",
    "日本語のテキスト",  # Japanese
    "emoji \U0001F600\U0001F389 party",
    "\N{LATIN SMALL LIGATURE FI}ne \N{LATIN SMALL LIGATURE FL}ower",
    "ＦＵＬＬ\N{IDEOGRAPHIC SPACE}ＷＩＤＴＨ",  # full-width letters
    "\N{CIRCLED DIGIT ONE}\N{CIRCLED DIGIT TWO}\N{CIRCLED DIGIT THREE}",
    "x\N{SUPERSCRIPT TWO} + y\N{SUPERSCRIPT THREE}",
    "\N{LEFT DOUBLE QUOTATION MARK}quoted\N{RIGHT DOUBLE QUOTATION MARK} \N{LEFT SINGLE QUOTATION MARK}single"
    "\N{RIGHT SINGLE QUOTATION MARK} \N{SINGLE LOW-9 QUOTATION MARK}low\N{RIGHT SINGLE QUOTATION MARK} "
    "\N{DOUBLE LOW-9 QUOTATION MARK}low\N{RIGHT DOUBLE QUOTATION MARK}",
    "dash \N{EN DASH} and \N{EM DASH} em", "wait\N{HORIZONTAL ELLIPSIS} what\N{HORIZONTAL ELLIPSIS}",
    "nbsp\N{NO-BREAK SPACE}here", "zero\N{ZERO WIDTH SPACE}width", "bom\N{ZERO WIDTH NO-BREAK SPACE}here",
    "ctrl\x01\x07\x7f\x85\x92chars", "it's I'm we're they've he'll she'd don't", "IT'S DON'T",
    "1234567890 3.14 1,000,000", "   leading and trailing   ", "tabs\t\tand\tmore", "mixed CASE Words",
    "a" * 300, "'s 't 're 've 'm 'll 'd", "line\N{LINE SEPARATOR}sep\N{PARAGRAPH SEPARATOR}para",
    "ogham\N{OGHAM SPACE MARK}space", "prime\N{PRIME} double\N{DOUBLE PRIME}",
    "\N{LATIN CAPITAL LETTER U WITH DIAERESIS}n\N{LATIN SMALL LETTER I WITH DIAERESIS}c\N{LATIN SMALL LETTER O WITH DIAERESIS}d"
    "\N{LATIN SMALL LETTER E WITH ACUTE} \N{LATIN CAPITAL LETTER A WITH GRAVE}\N{LATIN CAPITAL LETTER E WITH ACUTE}"
    "\N{LATIN CAPITAL LETTER I WITH CIRCUMFLEX}\N{LATIN CAPITAL LETTER O WITH TILDE}\N{LATIN CAPITAL LETTER U WITH DIAERESIS}",
    "Ελληνικά кириллица",  # Greek, Cyrillic
    "!!!???...,,,", "\"Hi,\" she said. \"Bye!\"", "(parens) [brackets] {braces}",
    "#hashtag @mention $5 50% a&b", "e-mail co-op well-known", "    four spaces", "trailing newline\n",
    "two\n\nparagraphs\n", " \n \n ", "Mr. Smith's dog's bone", "1st 2nd 3rd 4th",
    "\N{VULGAR FRACTION ONE HALF} \N{VULGAR FRACTION ONE QUARTER} \N{VULGAR FRACTION THREE QUARTERS}",
    "\N{TRADE MARK SIGN} \N{COPYRIGHT SIGN} \N{REGISTERED SIGN}",
    "\U0001F600\U0001F601", "lone \ud800 surrogate", "中",
]


def tokenizer_fixture(tok: BPETokenizer) -> dict:
    with open(VALID_TXT, encoding="utf-8") as f:
        lines = [ln for ln in f.read().split("\n") if ln.strip() and ln.strip() != "<|endoftext|>"]
    rnd = random.Random(2024)
    non_ascii = [ln for ln in lines if any(ord(c) > 126 for c in ln)]
    digits = [ln for ln in lines if any(c.isdigit() for c in ln)]
    punct = [ln for ln in lines if any(c in ";:()[]-*&%$#@/" for c in ln)]
    short = [ln for ln in lines if len(ln) < 25]
    picked: list[str] = []
    for pool, n in ((non_ascii, 45), (digits, 30), (punct, 30), (short, 15), (lines, 80)):
        for ln in rnd.sample(pool, min(n, len(pool))):
            if ln not in picked:
                picked.append(ln)
    # a few multi-line chunks with the separator, exactly as stored in the file
    with open(VALID_TXT, encoding="utf-8") as f:
        raw = f.read()
    for start in (0, 5000, 123456):
        picked.append(raw[start:start + 600])
    cases = []
    for text in EDGE_CASES + picked:
        cases.append({"text": text, "normalized": normalize_text(text), "ids": tok.encode(text)})
    return {
        "about": "Python encoder output (scripts/llm/bpe.py) for diverse TinyStories validation lines and edge cases.",
        "pattern": PATTERN,
        "cases": cases,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=["tokenizer", "model"], default=None)
    args = ap.parse_args()
    tok = BPETokenizer.load(TOKENIZER_JSON)
    os.makedirs(FIXTURE_DIR, exist_ok=True)
    torch.set_num_threads(1)  # deterministic CPU float32 sums

    if args.only != "model":
        tfx = tokenizer_fixture(tok)
        p = os.path.join(FIXTURE_DIR, "llm-tokenizer.json")
        with open(p, "w", encoding="utf-8") as f:
            json.dump(tfx, f, ensure_ascii=True, separators=(",", ":"))
        print(f"wrote {p}: {len(tfx['cases'])} cases, {os.path.getsize(p):,} B")
    if args.only == "tokenizer":
        return

    mfx = model_fixture(tok)
    p = os.path.join(FIXTURE_DIR, "llm-reference.json")
    with open(p, "w", encoding="utf-8") as f:
        json.dump(mfx, f, ensure_ascii=True, separators=(",", ":"))
    print(f"wrote {p}: {os.path.getsize(p):,} B")


if __name__ == "__main__":
    main()
