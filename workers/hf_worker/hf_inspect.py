"""Inspect a HuggingFace dataset: files, configs, splits, features, preview rows.

Usage: python -m hf_worker.hf_inspect --repo TIGER-Lab/ViRL39K [--config C] [--split S] [--rows 5]
Prints a single JSON object to stdout. Reads HF_TOKEN from the environment.
"""

from __future__ import annotations

import argparse
import json
import sys
from itertools import islice
from typing import Any

from PIL import Image

from . import source
from .convert import json_safe
from .images import is_url
from .mapping import suggest_mapping

PREVIEW_MAX_STR = 500


def feature_type(f: Any) -> str:
    """Render a `datasets` feature (or plain python type spec) as a short string."""
    if isinstance(f, dict):
        return "struct<" + ", ".join(f"{k}: {feature_type(v)}" for k, v in f.items()) + ">"
    if isinstance(f, (list, tuple)):
        return f"list<{feature_type(f[0]) if f else '?'}>"
    name = type(f).__name__
    if name == "Value":
        return str(f.dtype)
    if name == "Image":
        return "image"
    if name in ("Sequence", "List", "LargeList"):
        return f"list<{feature_type(f.feature)}>"
    if name == "ClassLabel":
        return "class_label"
    return name.lower()


def value_type(v: Any) -> str:
    """Infer a feature string from a decoded python value (when the builder has no features)."""
    if isinstance(v, bool):
        return "bool"
    if isinstance(v, int):
        return "int64"
    if isinstance(v, float):
        return "float64"
    if isinstance(v, str):
        return "string"
    if isinstance(v, (bytes, bytearray)):
        return "binary"
    if isinstance(v, Image.Image) or (isinstance(v, dict) and set(v) == {"bytes", "path"}):
        return "image"
    if isinstance(v, (list, tuple)):
        return f"list<{value_type(v[0]) if v else '?'}>"
    if isinstance(v, dict):
        return "struct<" + ", ".join(f"{k}: {value_type(x)}" for k, x in v.items()) + ">"
    return "null" if v is None else type(v).__name__


def arrow_type(t: Any) -> str:
    import pyarrow as pa

    if pa.types.is_list(t) or pa.types.is_large_list(t):
        return f"list<{arrow_type(t.value_type)}>"
    if pa.types.is_struct(t):
        names = {t.field(i).name for i in range(t.num_fields)}
        if names == {"bytes", "path"}:
            return "image"
        return "struct<" + ", ".join(f"{t.field(i).name}: {arrow_type(t.field(i).type)}" for i in range(t.num_fields)) + ">"
    if pa.types.is_large_string(t):
        return "string"
    return str(t)


def detect_image_source(feature: str | None, values: list[Any]) -> str:
    if feature == "image" or (feature and "binary" in feature):
        return "bytes"
    flat: list[Any] = []
    for v in values:
        flat.extend(v if isinstance(v, (list, tuple)) else [v])
    flat = [v for v in flat if v is not None]
    if not flat:
        return "none"
    v = flat[0]
    if isinstance(v, (bytes, bytearray, Image.Image)) or (isinstance(v, dict) and v.get("bytes")):
        return "bytes"
    if isinstance(v, dict):
        v = v.get("path")
    if is_url(v):
        return "url"
    if isinstance(v, str):
        return "relative_path"
    return "none"


def _from_builder(repo: str, config: str | None) -> tuple[list[str], dict[str, int | None], dict[str, str]]:
    from datasets import get_dataset_config_names, load_dataset_builder

    tok = source.token()
    try:
        configs = list(get_dataset_config_names(repo, token=tok))
    except Exception:  # noqa: BLE001
        configs = []
    builder = load_dataset_builder(repo, config, token=tok)
    splits: dict[str, int | None] = {}
    if builder.info.splits:
        splits = {str(name): (s.num_examples or None) for name, s in builder.info.splits.items()}
    elif getattr(builder.config, "data_files", None):
        splits = {str(name): None for name in builder.config.data_files}
    features = {k: feature_type(v) for k, v in (builder.info.features or {}).items()}
    return configs or [builder.config.name], splits, features


def _from_parquet(repo: str, files: list[dict[str, Any]], config: str | None, split: str | None, rows: int):
    import pyarrow.parquet as pq

    paths = source.parquet_files_for_split(files, config, split or "train")
    if not paths:
        raise RuntimeError("could not load dataset and no parquet files found")
    pf = pq.ParquetFile(source.download(repo, paths[0]))
    features = {f.name: arrow_type(f.type) for f in pf.schema_arrow}
    preview: list[dict[str, Any]] = []
    for batch in pf.iter_batches(batch_size=max(rows, 1)):
        preview = batch.to_pylist()[:rows]
        break
    return features, preview


def inspect(repo: str, config: str | None, split: str | None, rows: int) -> dict[str, Any]:
    repo = source.parse_repo(repo)
    files = source.list_files(repo)
    try:
        configs, splits, features = _from_builder(repo, config)
        split = split or ("train" if "train" in splits else next(iter(splits), "train"))
        preview = list(islice(source.iter_rows(repo, config, split, files=files), rows))
        if not features and preview:
            features = {k: value_type(v) for k, v in preview[0].items()}
    except Exception:  # noqa: BLE001 - builder unavailable -> read the first parquet directly
        split = split or "train"
        features, preview = _from_parquet(repo, files, config, split, rows)
        configs, splits = [config or "default"], {split: None}
    for name, n in list(splits.items()):
        if n is None:
            splits[name] = source.count_rows(repo, config, name, files)

    columns = list(features) or (list(preview[0]) if preview else [])
    suggested = suggest_mapping(columns)
    img_col = suggested.get("image")
    image_source = (
        detect_image_source(features.get(img_col), [r.get(img_col) for r in preview]) if img_col else "none"
    )
    used = {v for v in suggested.values() if v}
    return {
        "event": "inspect",
        "repo": repo,
        "files": files,
        "archives": source.archives(files),
        "configs": configs,
        "splits": splits,
        "features": features,
        "preview": [json_safe(r, PREVIEW_MAX_STR) for r in preview],
        "image_source": image_source,
        "suggested_mapping": suggested,
        "meta_candidates": [c for c in columns if c not in used],
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", required=True, help="org/name or full huggingface.co URL")
    parser.add_argument("--config", default=None)
    parser.add_argument("--split", default=None)
    parser.add_argument("--rows", type=int, default=5)
    args = parser.parse_args(argv)
    try:
        line = json.dumps(inspect(args.repo, args.config, args.split, args.rows), ensure_ascii=False)
    except Exception as e:  # noqa: BLE001
        error = {"event": "error", "message": f"{type(e).__name__}: {e}", "repo": args.repo}
        sys.stdout.write(json.dumps(error, ensure_ascii=False) + "\n")
        return 1
    sys.stdout.write(line + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
