"""Download / iteration layer: everything that talks to the HuggingFace Hub.

Kept separate from conversion so tests can monkeypatch these functions and run offline.
"""

from __future__ import annotations

import os
import re
from collections.abc import Iterator
from pathlib import Path
from typing import Any

ARCHIVE_SUFFIXES = (".zip",)
DEFAULT_CACHE_DIR = Path.home() / ".cache" / "sft-dashboard" / "hf"


def token() -> str | None:
    return os.environ.get("HF_TOKEN") or None


def parse_repo(repo: str) -> str:
    """Accept `org/name` or `https://huggingface.co/datasets/org/name[/tree/...]`."""
    repo = repo.strip()
    m = re.match(r"^(?:https?://)?(?:www\.)?huggingface\.co/datasets/([^/]+/[^/?#]+)", repo)
    if m:
        return m.group(1)
    if re.fullmatch(r"[^/\s]+/[^/\s]+", repo):
        return repo
    raise ValueError(f"not a HuggingFace dataset repo: {repo!r}")


def list_files(repo: str) -> list[dict[str, Any]]:
    """Repo files with sizes: [{"path": ..., "size": ...}]."""
    from huggingface_hub import HfApi

    info = HfApi(token=token()).dataset_info(repo, files_metadata=True)
    return [{"path": s.rfilename, "size": s.size} for s in (info.siblings or [])]


def archives(files: list[dict[str, Any]]) -> list[str]:
    return [f["path"] for f in files if f["path"].lower().endswith(ARCHIVE_SUFFIXES)]


def download(repo: str, filename: str, cache_dir: str | Path | None = None) -> str:
    from huggingface_hub import hf_hub_download

    return hf_hub_download(
        repo_id=repo,
        filename=filename,
        repo_type="dataset",
        cache_dir=str(cache_dir or DEFAULT_CACHE_DIR),
        token=token(),
    )


def parquet_files_for_split(files: list[dict[str, Any]], config: str | None, split: str) -> list[str]:
    """Pick the repo's parquet files that most likely belong to `split` (and `config`)."""
    paths = sorted(f["path"] for f in files if f["path"].endswith(".parquet"))
    if config and config != "default":
        scoped = [p for p in paths if f"{config}/" in p or Path(p).name.startswith(config)]
        paths = scoped or paths
    in_split = [p for p in paths if re.search(rf"(^|[/_.-]){re.escape(split)}([/_.-]|$)", p)]
    if in_split:
        return in_split
    # Single-split repos (e.g. ViRL39K's `39Krelease.parquet`) name files freely.
    return paths if split == "train" else []


def iter_parquet(path: str, batch_size: int = 256) -> Iterator[dict[str, Any]]:
    import pyarrow.parquet as pq

    pf = pq.ParquetFile(path)
    for batch in pf.iter_batches(batch_size=batch_size):
        yield from batch.to_pylist()


def iter_rows(
    repo: str,
    config: str | None,
    split: str,
    cache_dir: str | Path | None = None,
    files: list[dict[str, Any]] | None = None,
) -> Iterator[dict[str, Any]]:
    """Stream rows: `datasets` streaming first, parquet download as fallback."""
    try:
        from datasets import load_dataset

        ds = load_dataset(repo, config, split=split, streaming=True, token=token())
        it = iter(ds)
        first = next(it)  # streaming errors surface on the first read
    except StopIteration:
        return
    except Exception:  # noqa: BLE001 - any loader failure -> parquet fallback
        yield from _iter_parquet_fallback(repo, config, split, cache_dir, files)
        return
    yield first
    yield from it


def _iter_parquet_fallback(repo, config, split, cache_dir, files) -> Iterator[dict[str, Any]]:
    files = files if files is not None else list_files(repo)
    paths = parquet_files_for_split(files, config, split)
    if not paths:
        raise RuntimeError(f"no parquet files found for split {split!r} in {repo}")
    for p in paths:
        yield from iter_parquet(download(repo, p, cache_dir))


def count_rows(repo: str, config: str | None, split: str, files: list[dict[str, Any]] | None = None) -> int | None:
    """Best-effort row count from parquet footers (range requests, no full download)."""
    try:
        import pyarrow.parquet as pq
        from huggingface_hub import HfFileSystem

        files = files if files is not None else list_files(repo)
        paths = parquet_files_for_split(files, config, split)
        if not paths:
            return None
        fs = HfFileSystem(token=token())
        total = 0
        for p in paths:
            with fs.open(f"datasets/{repo}/{p}", "rb") as fh:
                total += pq.ParquetFile(fh).metadata.num_rows
        return total
    except Exception:  # noqa: BLE001
        return None
