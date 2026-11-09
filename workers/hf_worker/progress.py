"""Progress reporting: one JSON object per line on stdout."""

from __future__ import annotations

import json
import sys
from typing import Any


def emit(event: str, **fields: Any) -> None:
    """Write a single JSON line. `event` is one of: start, progress, log, done, error."""
    sys.stdout.write(json.dumps({"event": event, **fields}, ensure_ascii=False) + "\n")
    sys.stdout.flush()
