"""Row -> LLaVA sample conversion (pure, no I/O)."""

from __future__ import annotations

import datetime as _dt
import json
import math
from typing import Any

from PIL import Image

from .mapping import normalize_image_tokens

ROLE_MAP = {
    "user": "human", "human": "human",
    "assistant": "gpt", "gpt": "gpt", "model": "gpt", "bot": "gpt",
    "system": "system",
}


def json_safe(value: Any, max_str: int | None = None) -> Any:
    """Make a value JSON-serializable; optionally truncate long strings (for previews)."""
    if isinstance(value, (bytes, bytearray)):
        return f"<bytes {len(value)}>"
    if isinstance(value, Image.Image):
        return f"<image {value.width}x{value.height}>"
    if isinstance(value, str):
        if max_str is not None and len(value) > max_str:
            return value[:max_str] + "…"
        return value
    if isinstance(value, float):
        return None if math.isnan(value) or math.isinf(value) else value
    if value is None or isinstance(value, (bool, int)):
        return value
    if isinstance(value, dict):
        return {str(k): json_safe(v, max_str) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_safe(v, max_str) for v in value]
    if isinstance(value, (_dt.date, _dt.datetime, _dt.time)):
        return value.isoformat()
    if hasattr(value, "tolist"):  # numpy scalars/arrays
        return json_safe(value.tolist(), max_str)
    return str(value)


def to_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, (list, tuple)) and len(value) == 1 and isinstance(value[0], str):
        return value[0]
    return json.dumps(json_safe(value), ensure_ascii=False)


def image_values(row: dict[str, Any], mapping: dict[str, Any], image_mode: str = "all") -> list[Any]:
    col = mapping.get("image")
    if not col:
        return []
    raw = row.get(col)
    if raw is None:
        values: list[Any] = []
    elif isinstance(raw, (list, tuple)):
        values = [v for v in raw if v is not None]
    else:
        values = [raw]
    return values[:1] if image_mode == "first" else values


def sample_id(row: dict[str, Any], mapping: dict[str, Any], index: int) -> str:
    col = mapping.get("id")
    if col and row.get(col) not in (None, ""):
        return str(row[col])
    return str(index)


def convert_turns(turns: Any) -> list[dict[str, str]]:
    """Convert a list of {from/role, value/content} turns to LLaVA {from, value}."""
    if isinstance(turns, str):
        turns = json.loads(turns)
    out = []
    for t in turns or []:
        role = str(t.get("from", t.get("role", ""))).lower()
        value = t.get("value", t.get("content"))
        out.append({"from": ROLE_MAP.get(role, role), "value": to_text(value)})
    return out


def build_conversations(row: dict[str, Any], mapping: dict[str, Any], n_images: int) -> list[dict[str, str]]:
    system = mapping.get("system")
    conv_col = mapping.get("conversations")
    if conv_col:
        turns = convert_turns(row.get(conv_col))
    else:
        turns = [
            {"from": "human", "value": to_text(row.get(mapping["question"]))},
            {"from": "gpt", "value": to_text(row.get(mapping["answer"]))},
        ]
    if system and not (turns and turns[0]["from"] == "system"):
        turns.insert(0, {"from": "system", "value": system})
    if mapping.get("normalize_tokens", True):
        for t in turns:
            if t["from"] == "human":
                t["value"] = normalize_image_tokens(t["value"], n_images)
                break
    return turns


def convert_row(
    row: dict[str, Any], mapping: dict[str, Any], sid: str, image_rel_paths: list[str]
) -> dict[str, Any]:
    sample: dict[str, Any] = {"id": sid}
    if len(image_rel_paths) == 1:
        sample["image"] = image_rel_paths[0]
    elif image_rel_paths:
        sample["image"] = image_rel_paths
    sample["conversations"] = build_conversations(row, mapping, len(image_rel_paths))
    meta_cols = mapping.get("meta") or []
    if meta_cols:
        sample["meta"] = {c: json_safe(row.get(c)) for c in meta_cols}
    return sample
