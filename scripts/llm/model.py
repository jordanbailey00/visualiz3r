"""Tiny Llama-style decoder-only transformer (training module + explicit reference forward).

Architecture (must match lib/llm/model.ts exactly):
  x0 = tok_emb[ids]
  per layer (pre-norm):
    h   = x + Attn(RMSNorm_attn(x))
    out = h + MLP(RMSNorm_mlp(h))          MLP = SwiGLU: w_down(silu(w_gate x) * (w_up x))
  logits = RMSNorm_final(x) @ tok_emb^T     (tied embeddings, no biases anywhere)
  RMSNorm(x) = x / sqrt(mean(x^2) + eps) * weight
  RoPE: interleaved pairs (x[2i], x[2i+1]) per head, angle = pos * theta^(-2i/d_head)

Export layout: every linear weight is stored [in_features, out_features] (y = x @ W),
i.e. the transpose of torch nn.Linear.weight.
"""

from __future__ import annotations

import json
import math
from dataclasses import asdict, dataclass

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F


@dataclass
class ModelConfig:
    vocab_size: int = 2048
    d_model: int = 64
    n_layers: int = 4
    n_heads: int = 4
    d_ff: int = 256
    max_seq_len: int = 128
    rope_theta: float = 10000.0
    norm_eps: float = 1e-5

    @property
    def d_head(self) -> int:
        return self.d_model // self.n_heads

    def to_json(self) -> dict:
        d = asdict(self)
        return {
            "vocab_size": d["vocab_size"],
            "d_model": d["d_model"],
            "n_layers": d["n_layers"],
            "n_heads": d["n_heads"],
            "d_head": self.d_head,
            "d_ff": d["d_ff"],
            "max_seq_len": d["max_seq_len"],
            "rope_theta": d["rope_theta"],
            "norm_eps": d["norm_eps"],
            "tied_embeddings": True,
        }

    @classmethod
    def from_json(cls, j: dict) -> "ModelConfig":
        cfg = cls(
            vocab_size=j["vocab_size"],
            d_model=j["d_model"],
            n_layers=j["n_layers"],
            n_heads=j["n_heads"],
            d_ff=j["d_ff"],
            max_seq_len=j["max_seq_len"],
            rope_theta=j["rope_theta"],
            norm_eps=j["norm_eps"],
        )
        assert cfg.d_head == j["d_head"]
        return cfg


PRESETS = {
    "d64": ModelConfig(d_model=64, n_heads=4, d_ff=256),
    "d96": ModelConfig(d_model=96, n_heads=4, d_ff=384),
    "d128": ModelConfig(d_model=128, n_heads=4, d_ff=512),
}


def rope_tables(cfg: ModelConfig, device=None) -> tuple[torch.Tensor, torch.Tensor]:
    """cos/sin tables [max_seq_len, d_head/2], computed in float64 then cast to float32."""
    i = torch.arange(cfg.d_head // 2, dtype=torch.float64)
    inv_freq = cfg.rope_theta ** (-2.0 * i / cfg.d_head)
    pos = torch.arange(cfg.max_seq_len, dtype=torch.float64)
    ang = torch.outer(pos, inv_freq)
    return torch.cos(ang).float().to(device), torch.sin(ang).float().to(device)


def apply_rope(x: torch.Tensor, cos: torch.Tensor, sin: torch.Tensor) -> torch.Tensor:
    """x: [..., T, D] with interleaved pairs; cos/sin: [T, D/2]."""
    xf = x.float().reshape(*x.shape[:-1], -1, 2)
    x0, x1 = xf[..., 0], xf[..., 1]
    o0 = x0 * cos - x1 * sin
    o1 = x0 * sin + x1 * cos
    return torch.stack((o0, o1), dim=-1).flatten(-2).type_as(x)


class RMSNorm(nn.Module):
    def __init__(self, dim: int, eps: float):
        super().__init__()
        self.eps = eps
        self.weight = nn.Parameter(torch.ones(dim))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        xf = x.float()
        xf = xf * torch.rsqrt(xf.pow(2).mean(-1, keepdim=True) + self.eps)
        return xf.type_as(x) * self.weight


class Block(nn.Module):
    def __init__(self, cfg: ModelConfig):
        super().__init__()
        C, Fh = cfg.d_model, cfg.d_ff
        self.n_heads = cfg.n_heads
        self.attn_norm = RMSNorm(C, cfg.norm_eps)
        self.wq = nn.Linear(C, C, bias=False)
        self.wk = nn.Linear(C, C, bias=False)
        self.wv = nn.Linear(C, C, bias=False)
        self.wo = nn.Linear(C, C, bias=False)
        self.mlp_norm = RMSNorm(C, cfg.norm_eps)
        self.w_gate = nn.Linear(C, Fh, bias=False)
        self.w_up = nn.Linear(C, Fh, bias=False)
        self.w_down = nn.Linear(Fh, C, bias=False)

    def forward(self, x, cos, sin):
        B, T, C = x.shape
        H = self.n_heads
        D = C // H
        xn = self.attn_norm(x)
        q = self.wq(xn).view(B, T, H, D).transpose(1, 2)
        k = self.wk(xn).view(B, T, H, D).transpose(1, 2)
        v = self.wv(xn).view(B, T, H, D).transpose(1, 2)
        q = apply_rope(q, cos[:T], sin[:T])
        k = apply_rope(k, cos[:T], sin[:T])
        a = F.scaled_dot_product_attention(q, k, v, is_causal=True)
        a = a.transpose(1, 2).reshape(B, T, C)
        h = x + self.wo(a)
        hn = self.mlp_norm(h)
        return h + self.w_down(F.silu(self.w_gate(hn)) * self.w_up(hn))


class TinyLlama(nn.Module):
    def __init__(self, cfg: ModelConfig):
        super().__init__()
        self.cfg = cfg
        self.tok_emb = nn.Embedding(cfg.vocab_size, cfg.d_model)
        self.layers = nn.ModuleList(Block(cfg) for _ in range(cfg.n_layers))
        self.final_norm = RMSNorm(cfg.d_model, cfg.norm_eps)
        cos, sin = rope_tables(cfg)
        self.register_buffer("rope_cos", cos, persistent=False)
        self.register_buffer("rope_sin", sin, persistent=False)
        self.reset_parameters()

    def reset_parameters(self):
        std = 0.02
        nn.init.normal_(self.tok_emb.weight, std=std)
        for blk in self.layers:
            for lin in (blk.wq, blk.wk, blk.wv, blk.w_gate, blk.w_up):
                nn.init.normal_(lin.weight, std=std)
            for lin in (blk.wo, blk.w_down):
                nn.init.normal_(lin.weight, std=std / math.sqrt(2 * self.cfg.n_layers))

    def forward(self, ids: torch.Tensor) -> torch.Tensor:
        x = self.tok_emb(ids)
        for blk in self.layers:
            x = blk(x, self.rope_cos, self.rope_sin)
        x = self.final_norm(x)
        return F.linear(x, self.tok_emb.weight)

    def num_params(self) -> tuple[int, int]:
        total = sum(p.numel() for p in self.parameters())
        return total, total - self.tok_emb.weight.numel()


# --------------------------------------------------------------------------------------
# Export layout <-> module
# --------------------------------------------------------------------------------------


def export_tensors(model: TinyLlama) -> list[tuple[str, np.ndarray]]:
    """Tensors in the exported order/layout (linear weights transposed to [in, out])."""
    sd = {k: v.detach().float().cpu() for k, v in model.state_dict().items()}
    out: list[tuple[str, np.ndarray]] = [("tok_emb", sd["tok_emb.weight"].numpy())]
    for i in range(model.cfg.n_layers):
        p = f"layers.{i}."
        out.append((p + "attn_norm", sd[p + "attn_norm.weight"].numpy()))
        for n in ("wq", "wk", "wv", "wo"):
            out.append((p + n, sd[p + n + ".weight"].t().contiguous().numpy()))
        out.append((p + "mlp_norm", sd[p + "mlp_norm.weight"].numpy()))
        for n in ("w_gate", "w_up", "w_down"):
            out.append((p + n, sd[p + n + ".weight"].t().contiguous().numpy()))
    out.append(("final_norm", sd["final_norm.weight"].numpy()))
    return [(n, np.ascontiguousarray(a, dtype=np.float32)) for n, a in out]


def load_exported(model_json: str, model_bin: str) -> tuple[ModelConfig, dict[str, torch.Tensor], dict]:
    with open(model_json) as f:
        meta = json.load(f)
    cfg = ModelConfig.from_json(meta["config"])
    raw = np.fromfile(model_bin, dtype="<f4")
    weights = {}
    for t in meta["tensors"]:
        assert t["offset"] % 4 == 0
        start = t["offset"] // 4
        arr = raw[start : start + t["length"]].reshape(t["shape"])
        weights[t["name"]] = torch.from_numpy(arr.copy())
    return cfg, weights, meta


# --------------------------------------------------------------------------------------
# Explicit reference forward (CPU) capturing every intermediate, mirroring model.ts
# --------------------------------------------------------------------------------------


@torch.no_grad()
def reference_forward(cfg: ModelConfig, W: dict[str, torch.Tensor], ids: list[int],
                      f64_accum: bool = False) -> dict:
    """Step-by-step forward on exported weights. All outputs are float32 tensors.

    f64_accum=False: plain float32 torch ops (the "PyTorch reference").
    f64_accum=True : every op computed in float64 and rounded to float32 after each
                     step, mirroring the TypeScript engine's arithmetic as closely as
                     possible (used for reproducible sampling fixtures).
    """
    T = len(ids)
    C, H, D, Fh, eps = cfg.d_model, cfg.n_heads, cfg.d_head, cfg.d_ff, cfg.norm_eps
    assert 0 < T <= cfg.max_seq_len
    hp = torch.float64 if f64_accum else torch.float32

    def mm(a, b):
        return (a.to(hp) @ b.to(hp)).float()

    def rms_norm(x, w):
        xh = x.to(hp)
        rms = torch.sqrt(xh.pow(2).mean(-1) + eps)
        return rms.float(), (xh / rms[:, None] * w.to(hp)).float()

    i = torch.arange(D // 2, dtype=torch.float64)
    inv_freq = cfg.rope_theta ** (-2.0 * i / D)
    ang = torch.outer(torch.arange(T, dtype=torch.float64), inv_freq)  # [T, D/2]
    cos, sin = torch.cos(ang).to(hp), torch.sin(ang).to(hp)

    def rope(x):  # x [T, C] -> [T, C], per head interleaved pairs
        xh = x.to(hp).view(T, H, D // 2, 2)
        x0, x1 = xh[..., 0], xh[..., 1]
        c, s = cos[:, None, :], sin[:, None, :]
        return torch.stack((x0 * c - x1 * s, x0 * s + x1 * c), -1).reshape(T, C).float()

    ids_t = torch.tensor(ids, dtype=torch.long)
    x = W["tok_emb"][ids_t].clone()
    tr: dict = {"tokens": list(ids), "embeddings": x.clone(), "layers": []}
    mask = torch.triu(torch.ones(T, T, dtype=torch.bool), diagonal=1)
    for l in range(cfg.n_layers):
        p = f"layers.{l}."
        L: dict = {"input": x}
        L["attnNormRms"], L["attnNormed"] = rms_norm(x, W[p + "attn_norm"])
        xn = L["attnNormed"]
        L["q"], L["k"], L["v"] = mm(xn, W[p + "wq"]), mm(xn, W[p + "wk"]), mm(xn, W[p + "wv"])
        L["qRot"], L["kRot"] = rope(L["q"]), rope(L["k"])
        qh = L["qRot"].view(T, H, D).transpose(0, 1)  # [H, T, D]
        kh = L["kRot"].view(T, H, D).transpose(0, 1)
        vh = L["v"].view(T, H, D).transpose(0, 1)
        scores = ((qh.to(hp) @ kh.to(hp).transpose(1, 2)) / math.sqrt(D)).float()
        scores = scores.masked_fill(mask, float("-inf"))
        L["scores"] = scores
        sh = scores.to(hp)
        probs = torch.softmax(sh, dim=-1).float()
        L["probs"] = probs
        L["headOut"] = (probs.to(hp) @ vh.to(hp)).float()  # [H, T, D]
        L["concat"] = L["headOut"].transpose(0, 1).reshape(T, C).contiguous()
        L["attnOut"] = mm(L["concat"], W[p + "wo"])
        L["resid1"] = (x.to(hp) + L["attnOut"].to(hp)).float()
        L["mlpNormRms"], L["mlpNormed"] = rms_norm(L["resid1"], W[p + "mlp_norm"])
        L["gate"] = mm(L["mlpNormed"], W[p + "w_gate"])
        L["up"] = mm(L["mlpNormed"], W[p + "w_up"])
        g = L["gate"].to(hp)
        L["act"] = (g * torch.sigmoid(g)).float()
        L["hidden"] = (L["act"].to(hp) * L["up"].to(hp)).float()
        L["mlpOut"] = mm(L["hidden"], W[p + "w_down"])
        L["output"] = (L["resid1"].to(hp) + L["mlpOut"].to(hp)).float()
        x = L["output"]
        tr["layers"].append(L)
    tr["finalNormRms"], tr["finalNormed"] = rms_norm(x, W["final_norm"])
    tr["logits"] = mm(tr["finalNormed"], W["tok_emb"].t())
    tr["probs"] = torch.softmax(tr["logits"][-1].to(hp), -1).float()
    return tr


# --------------------------------------------------------------------------------------
# Sampling (bit-compatible with lib/llm/model.ts: mulberry32 + sampleToken)
# --------------------------------------------------------------------------------------


class Mulberry32:
    """Port of the JS mulberry32 PRNG (returns floats in [0, 1))."""

    def __init__(self, seed: int):
        self.a = seed & 0xFFFFFFFF

    def __call__(self) -> float:
        M = 0xFFFFFFFF
        self.a = (self.a + 0x6D2B79F5) & M
        a = self.a
        t = ((a ^ (a >> 15)) * (1 | a)) & M
        t = (((t + (((t ^ (t >> 7)) * (61 | t)) & M)) & M) ^ t) & M
        return ((t ^ (t >> 14)) & M) / 4294967296.0


def sample_token(logits: np.ndarray, temperature: float, top_k: int | None, top_p: float | None, rng) -> tuple[int, np.ndarray]:
    """Mirror of sampleToken() in model.ts for logits input (same summation order, same
    tie-breaking). Returns (id, probs float32 after temperature/top-k/top-p)."""
    z = [float(v) for v in logits]
    V = len(z)
    if temperature <= 0:
        i = int(np.argmax(np.asarray(logits)))  # first maximum, like the TS loop
        p = np.zeros(V, np.float32)
        p[i] = 1
        return i, p
    z = [v / temperature for v in z]
    m = max(z)
    e = [math.exp(v - m) for v in z]
    total = 0.0
    for v in e:
        total += v
    p = [v / total for v in e]
    keep = [j for j in sorted(range(V), key=lambda j: (-p[j], j)) if p[j] > 0]
    if top_k and top_k > 0:
        keep = keep[:top_k]

    def ssum(ix):
        s = 0.0
        for j in ix:
            s += p[j]
        return s

    s = ssum(keep)
    if top_p is not None and 0 < top_p < 1:
        acc = 0.0
        cut = len(keep)
        for n, j in enumerate(keep):
            acc += p[j] / s
            if acc >= top_p:
                cut = n + 1
                break
        keep = keep[:cut]
        s = ssum(keep)
    r = rng()
    acc = 0.0
    chosen = keep[-1]
    for j in keep:
        acc += p[j] / s
        if r < acc:
            chosen = j
            break
    out = np.zeros(V, np.float32)
    for j in keep:
        out[j] = p[j] / s
    return int(chosen), out
