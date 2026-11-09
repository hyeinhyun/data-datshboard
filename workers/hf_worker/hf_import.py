"""Convert a HuggingFace dataset into LLaVA-format JSON plus an image folder.

Usage:
  python -m hf_worker.hf_import --repo ORG/NAME --mapping mapping.json --out OUT.json \
      --image-dir DIR --image-rel-prefix hf_imports/NAME [--split train] [--max-samples N] [--resume]
Streams progress as JSON lines on stdout. Reads HF_TOKEN from the environment.
"""

from __future__ import annotations

import argparse
import json
import os
import signal
import sys
from itertools import islice
from pathlib import Path

from . import source
from .convert import convert_row, image_values, sample_id
from .images import ArchiveIndex, ImageWriter
from .progress import emit

PROGRESS_EVERY = 100


class Cancelled(Exception):
    pass


def _on_sigterm(signum, frame):  # noqa: ARG001
    raise Cancelled()


def recover_partial(partial: Path) -> int:
    """Count complete items in a partial output and truncate any torn trailing item.

    The writer puts one item per line (`[`, `{...},`, `{...}`), so this streams line by line.
    """
    count = 0
    end = 0
    with open(partial, "rb") as fh:
        first = fh.readline()
        if first.strip() != b"[":
            raise ValueError(f"unexpected partial file header in {partial}")
        end = fh.tell() - 1  # keep "[" ; the newline is re-written below
        pos = fh.tell()
        for line in iter(fh.readline, b""):
            body = line.rstrip(b"\r\n").rstrip(b",")
            try:
                json.loads(body)
            except ValueError:
                break
            count += 1
            end = pos + len(body)
            pos += len(line)
    with open(partial, "r+b") as fh:
        fh.truncate(end)
        if count == 0:
            fh.seek(0, os.SEEK_END)
            fh.write(b"\n")
    return count


def run(args: argparse.Namespace) -> int:
    repo = source.parse_repo(args.repo)
    mapping = json.loads(Path(args.mapping).read_text(encoding="utf-8"))
    if not mapping.get("conversations") and not (mapping.get("question") and mapping.get("answer")):
        raise ValueError("mapping needs `question` and `answer`, or `conversations`")

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    partial = out.with_name(out.name + ".partial")
    prefix = args.image_rel_prefix.rstrip("/")
    cache_dir = args.cache_dir

    files = source.list_files(repo)
    repo_paths = {f["path"] for f in files}
    dl = lambda p: source.download(repo, p, cache_dir)  # noqa: E731
    archive_index = ArchiveIndex(source.archives(files), dl)
    writer = ImageWriter(args.image_dir, archive_index, repo_paths, dl)

    total = source.count_rows(repo, args.config, args.split, files)
    if args.max_samples is not None:
        total = args.max_samples if total is None else min(total, args.max_samples)
    emit("start", repo=repo, split=args.split, total=total)

    skip = 0
    if args.resume and partial.exists():
        skip = recover_partial(partial)
        emit("log", message=f"resuming after {skip} samples")
        fh = open(partial, "a", encoding="utf-8", newline="\n")
    else:
        fh = open(partial, "w", encoding="utf-8", newline="\n")
        fh.write("[\n")

    done = skip
    n_images = 0
    missing = 0
    try:
        rows = source.iter_rows(repo, args.config, args.split, cache_dir, files)
        limit = None if args.max_samples is None else max(args.max_samples - skip, 0)
        rows = islice(rows, skip, None if limit is None else skip + limit)
        for index, row in enumerate(rows, start=skip):
            sid = sample_id(row, mapping, index)
            rel_paths = []
            for k, value in enumerate(image_values(row, mapping, args.image_mode)):
                name = writer.write(value, f"{sid}-{k}")
                if name is None:
                    missing += 1
                else:
                    n_images += 1
                    rel_paths.append(f"{prefix}/{name}" if prefix else name)
            sample = convert_row(row, mapping, sid, rel_paths)
            fh.write((",\n" if done else "") + json.dumps(sample, ensure_ascii=False))
            done += 1
            if done % PROGRESS_EVERY == 0:
                fh.flush()
                emit("progress", done=done, total=total, images=n_images, missing_images=missing)
    except Cancelled:
        fh.close()
        archive_index.close()
        emit("log", message="cancelled")
        return 130
    except BaseException:
        fh.close()
        archive_index.close()
        raise

    fh.write("\n]\n")
    fh.close()
    archive_index.close()
    os.replace(partial, out)
    emit("progress", done=done, total=total, images=n_images, missing_images=missing)
    emit("done", n_samples=done, n_images=n_images, missing_images=missing, out=str(out))
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--repo", required=True, help="org/name or full huggingface.co URL")
    p.add_argument("--mapping", required=True, help="path to mapping JSON")
    p.add_argument("--out", required=True, help="output JSON path")
    p.add_argument("--image-dir", required=True, help="directory to write images into")
    p.add_argument("--image-rel-prefix", default="", help="prefix for `image` paths in the JSON")
    p.add_argument("--config", default=None)
    p.add_argument("--split", default="train")
    p.add_argument("--max-samples", type=int, default=None)
    p.add_argument("--image-mode", choices=("first", "all"), default="all")
    p.add_argument("--cache-dir", default=str(source.DEFAULT_CACHE_DIR))
    p.add_argument("--resume", action="store_true")
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    signal.signal(signal.SIGTERM, _on_sigterm)
    try:
        return run(args)
    except Cancelled:
        emit("log", message="cancelled")
        return 130
    except Exception as e:  # noqa: BLE001
        emit("error", message=f"{type(e).__name__}: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
