"""Shared filesystem locations for the LLM pipeline (all inside the repo)."""

import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))
DATA_DIR = os.path.join(SCRIPT_DIR, "data")
CKPT_DIR = os.path.join(SCRIPT_DIR, "checkpoints")
PUBLIC_DIR = os.path.join(REPO_ROOT, "public", "llm")
FIXTURE_DIR = os.path.join(REPO_ROOT, "tests", "fixtures")

TOKENIZER_JSON = os.path.join(PUBLIC_DIR, "tokenizer.json")
MODEL_JSON = os.path.join(PUBLIC_DIR, "model.json")
MODEL_BIN = os.path.join(PUBLIC_DIR, "model.bin")

TRAIN_TOKENS = os.path.join(DATA_DIR, "train_tokens.npy")
VALID_TOKENS = os.path.join(DATA_DIR, "valid_tokens.npy")


def keep_caches_in_repo() -> None:
    """Point torch.compile / Triton / CUDA caches and temp files into checkpoints/
    so nothing is written outside the repository. Call before importing torch."""
    cache = os.path.join(CKPT_DIR, "cache")
    tmp = os.path.join(cache, "tmp")
    os.makedirs(tmp, exist_ok=True)
    os.environ.setdefault("TORCHINDUCTOR_CACHE_DIR", os.path.join(cache, "inductor"))
    os.environ.setdefault("TRITON_HOME", os.path.join(cache, "triton_home"))
    os.environ.setdefault("TRITON_CACHE_DIR", os.path.join(cache, "triton"))
    os.environ.setdefault("CUDA_CACHE_PATH", os.path.join(cache, "nv"))
    os.environ["TMPDIR"] = tmp
    import tempfile

    tempfile.tempdir = tmp
