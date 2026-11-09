"""Inspect a HuggingFace dataset: files, configs, splits, features, preview rows.

Usage: python -m hf_worker.hf_inspect --repo TIGER-Lab/ViRL39K [--rows 5]
Prints a single JSON object to stdout. Reads HF_TOKEN from the environment.
(Phase 6 fills in the implementation; this is the CLI skeleton.)
"""

from __future__ import annotations

import argparse
import json
import sys


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", required=True, help="org/name or full huggingface.co URL")
    parser.add_argument("--rows", type=int, default=5)
    args = parser.parse_args(argv)
    json.dump(
        {"event": "error", "message": "not implemented yet (Phase 6)", "repo": args.repo},
        sys.stdout,
    )
    sys.stdout.write("\n")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
