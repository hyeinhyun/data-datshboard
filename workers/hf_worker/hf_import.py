"""Convert a HuggingFace dataset into LLaVA-format JSON plus an image folder.

Usage: python -m hf_worker.hf_import --repo ORG/NAME --mapping mapping.json --out OUT.json --image-root DIR
Streams progress as JSON lines on stdout. Reads HF_TOKEN from the environment.
(Phase 6 fills in the implementation; this is the CLI skeleton.)
"""

from __future__ import annotations

import argparse

from .progress import emit


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", required=True)
    parser.add_argument("--mapping", required=True, help="path to mapping JSON")
    parser.add_argument("--out", required=True, help="output JSON path")
    parser.add_argument("--image-root", required=True, help="directory to write images into")
    parser.add_argument("--split", default="train")
    parser.add_argument("--max-samples", type=int, default=None)
    args = parser.parse_args(argv)
    emit("start", repo=args.repo, split=args.split)
    emit("error", message="not implemented yet (Phase 6)")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
