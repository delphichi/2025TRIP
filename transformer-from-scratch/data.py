"""
Stage 1 — Data pipeline for a character-level Transformer LM.

Pedagogical companion to Vaswani et al. 2017, "Attention Is All You Need".
The paper uses BPE subword tokens (WMT En-De, ~37k vocab). We use
character-level tokens instead: the model architecture stays identical,
only the vocabulary table changes. This keeps the vocab small (~65 for
Shakespeare) so a laptop CPU can train the model in reasonable time.

Everything upstream of the token embedding lives here:
    raw text  ->  int IDs  ->  torch.LongTensor  ->  (x, y) batches
Downstream (embedding, attention, ...) will be built in later stages.
"""

from __future__ import annotations

import os
import urllib.request
from dataclasses import dataclass

import torch


# ---------------------------------------------------------------------------
# 1. Corpus loading
# ---------------------------------------------------------------------------
DATA_DIR = os.path.dirname(os.path.abspath(__file__))
RAW_PATH = os.path.join(DATA_DIR, "input.txt")
DATA_URL = (
    "https://raw.githubusercontent.com/karpathy/char-rnn/"
    "master/data/tinyshakespeare/input.txt"
)


def download_corpus(url: str = DATA_URL, path: str = RAW_PATH) -> str:
    """Fetch the tiny-Shakespeare corpus (~1 MB) once, then cache locally."""
    if not os.path.exists(path):
        print(f"[data] downloading corpus -> {path}")
        urllib.request.urlretrieve(url, path)
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


# ---------------------------------------------------------------------------
# 2. Character-level tokenizer
# ---------------------------------------------------------------------------
# The paper's "Input Embedding" block (Fig. 1) expects integer token IDs.
# Our job here is to define the bijection  char <-> int  that produces them.
# stoi = string-to-int (encode), itos = int-to-string (decode).
class CharTokenizer:
    def __init__(self, text: str):
        chars = sorted(set(text))
        self.vocab_size: int = len(chars)
        self.stoi: dict[str, int] = {c: i for i, c in enumerate(chars)}
        self.itos: dict[int, str] = {i: c for i, c in enumerate(chars)}

    def encode(self, s: str) -> list[int]:
        return [self.stoi[c] for c in s]

    def decode(self, ids: list[int] | torch.Tensor) -> str:
        if isinstance(ids, torch.Tensor):
            ids = ids.tolist()
        return "".join(self.itos[i] for i in ids)


# ---------------------------------------------------------------------------
# 3. Train / validation split
# ---------------------------------------------------------------------------
@dataclass
class Splits:
    train: torch.Tensor
    val: torch.Tensor
    tokenizer: CharTokenizer


def prepare_splits(val_frac: float = 0.1) -> Splits:
    """Load the corpus, build the tokenizer, and produce train/val tensors."""
    text = download_corpus()
    tok = CharTokenizer(text)
    data = torch.tensor(tok.encode(text), dtype=torch.long)
    n_val = int(val_frac * len(data))
    n_train = len(data) - n_val
    return Splits(train=data[:n_train], val=data[n_train:], tokenizer=tok)


# ---------------------------------------------------------------------------
# 4. Batch sampler
# ---------------------------------------------------------------------------
# The Transformer processes a fixed-length context window in parallel,
# rather than one token at a time like an RNN. `block_size` = context length
# = the paper's `n` in the O(n^2) attention complexity discussion (Sec. 4).
#
# For a decoder-only LM (GPT-style), the target at position i is simply the
# input at position i+1 -- this is the "shifted right" arrangement in
# Fig. 1's caption. We generate (x, y) by taking a length-(block_size+1)
# slice and splitting it into two overlapping length-block_size windows.
def get_batch(
    data: torch.Tensor,
    block_size: int,
    batch_size: int,
    device: str | torch.device = "cpu",
    generator: torch.Generator | None = None,
) -> tuple[torch.Tensor, torch.Tensor]:
    """Return (x, y) each of shape (batch_size, block_size)."""
    # Highest legal starting index: we need block_size+1 tokens after it.
    high = len(data) - block_size - 1
    if high <= 0:
        raise ValueError(
            f"data too short ({len(data)}) for block_size={block_size}"
        )
    ix = torch.randint(high, (batch_size,), generator=generator)
    x = torch.stack([data[i : i + block_size] for i in ix])
    y = torch.stack([data[i + 1 : i + 1 + block_size] for i in ix])
    return x.to(device), y.to(device)


# ---------------------------------------------------------------------------
# 5. Sanity check: run `python data.py` to verify the pipeline end-to-end.
# ---------------------------------------------------------------------------
def _demo() -> None:
    splits = prepare_splits()
    tok = splits.tokenizer
    print(f"[data] corpus chars     : {len(splits.train) + len(splits.val):,}")
    print(f"[data] vocab size       : {tok.vocab_size}")
    print(f"[data] train tokens     : {len(splits.train):,}")
    print(f"[data] val   tokens     : {len(splits.val):,}")

    xb, yb = get_batch(splits.train, block_size=8, batch_size=4)
    print(f"[data] x shape          : {tuple(xb.shape)}")
    print(f"[data] y shape          : {tuple(yb.shape)}")

    # Show how one row of (x, y) encodes 8 next-token prediction targets:
    print("\n[data] one row unrolled (context -> next-token target):")
    for i in range(xb.shape[1]):
        ctx = tok.decode(xb[0, : i + 1])
        tgt = tok.decode([yb[0, i].item()])
        print(f"  {ctx!r:<30}  ->  {tgt!r}")


if __name__ == "__main__":
    _demo()
