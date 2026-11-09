# workers

Python worker that converts HuggingFace datasets into the LLaVA JSON format used by the dashboard.
The Next.js server runs it as a child process and parses the JSON lines it prints on **stdout**
(library logs / progress bars go to stderr).

```bash
cd workers
uv sync                       # creates .venv with Python 3.11
uv run pytest                 # unit tests (offline)
HF_NETWORK_TESTS=1 uv run pytest tests/test_network.py   # real Hub calls (ViRL39K, downloads images.zip ~1.8 GB)
```

Layout: `source.py` (Hub download / row iteration), `images.py` (image saving, zip index),
`convert.py` (row → LLaVA sample), `mapping.py` (column suggestions, image-token normalization),
`progress.py` (JSON-line events), `hf_inspect.py` / `hf_import.py` (CLIs).

## `hf_inspect`

```bash
uv run python -m hf_worker.hf_inspect --repo TIGER-Lab/ViRL39K [--config NAME] [--split NAME] [--rows 5]
```

`--repo` accepts `org/name` or `https://huggingface.co/datasets/org/name`. Prints one JSON object:

```json
{
  "event": "inspect",
  "repo": "TIGER-Lab/ViRL39K",
  "files": [
    { "path": "39Krelease.parquet", "size": 6869454 },
    { "path": "images.zip", "size": 1774062662 }
  ],
  "archives": ["images.zip"],
  "configs": ["default"],
  "splits": { "train": 38870 },
  "features": {
    "question": "string",
    "answer": "string",
    "image": "list<string>",
    "qid": "string"
  },
  "preview": [
    { "question": "<image>\nIs the dotted line ...", "image": ["images/Processed-...jpg"] }
  ],
  "image_source": "relative_path",
  "suggested_mapping": {
    "question": "question",
    "answer": "answer",
    "image": "image",
    "id": "qid"
  },
  "meta_candidates": ["PassRate_32BTrained", "PassRate_7BBase", "category", "source"]
}
```

- `image_source`: `bytes` (HF `Image` feature / raw bytes / PIL), `url` (http strings),
  `relative_path` (other strings — resolved against the repo's zip archives or loose repo files), `none`.
- Preview rows are JSON-safe: bytes become `"<bytes N>"`, PIL images `"<image WxH>"`, strings are cut at 500 chars.
- Split sizes come from the builder info, or from parquet footers when the builder has none (`null` if unknown).
- On failure: `{"event": "error", "message": "..."}` and exit code 1.

## `hf_import`

```bash
uv run python -m hf_worker.hf_import --repo TIGER-Lab/ViRL39K --mapping mapping.json \
  --out /out/ViRL39K.json --image-dir /images/hf_imports/ViRL39K --image-rel-prefix hf_imports/ViRL39K \
  [--config C] [--split train] [--max-samples N] [--image-mode first|all] [--cache-dir DIR] [--resume]
```

| option               | meaning                                                                               |
| -------------------- | ------------------------------------------------------------------------------------- |
| `--image-dir`        | where image files are written (`<id or row index>-<k>.<ext>`)                         |
| `--image-rel-prefix` | prefix for the `image` paths in the JSON (relative to the image root)                 |
| `--image-mode`       | `all` (default) keeps every image, `first` keeps only the first one                   |
| `--cache-dir`        | HF download cache for parquet/zip files (default `~/.cache/sft-dashboard/hf`)         |
| `--resume`           | continue from `OUT.json.partial`: complete items are kept, that many rows are skipped |

Rows are streamed with `datasets.load_dataset(..., streaming=True)`; if that fails the split's parquet files
are downloaded and read batch by batch. The output is written incrementally to `OUT.json.partial`
(one sample per line) and renamed to `OUT.json` when complete.

Images: bytes/PIL are saved as JPEG (RGB), or PNG when the image has alpha; URLs are downloaded
(3 tries, 30 s timeout) and re-encoded the same way; relative paths are looked up in the repo's `.zip`
archives (downloaded lazily on first need; matched by full path, path suffix, then basename) and extracted
as-is, or downloaded when the file exists loose in the repo. Unresolvable images are counted in
`missing_images`; the sample is kept without that path.

### mapping.json

```json
{
  "question": "question",
  "answer": "answer",
  "image": "image",
  "id": "qid",
  "system": "optional system prompt text",
  "conversations": null,
  "meta": ["category", "source", "PassRate_32BTrained"],
  "normalize_tokens": true
}
```

- `question` / `answer`: columns for a single human → gpt turn (required unless `conversations` is set).
- `conversations`: column holding a list of `{from|role, value|content}` turns. Roles map
  `user|human → human`, `assistant|gpt|model → gpt`, `system → system`.
- `image` (column, single value or list), `id` (column; row index when null), `meta` (columns copied into `meta`).
- `system`: prepended as a `system` turn unless the conversation already starts with one.
- `normalize_tokens` (default true): in the first human turn, `<image>`-style tokens become `<|image|>`;
  if none present, one `<|image|>` per written image is prepended.

Output sample:

```json
{
  "id": "Processed-0430e208-...",
  "image": "hf_imports/ViRL39K/Processed-0430e208-...-0.jpg",
  "conversations": [
    { "from": "human", "value": "<|image|>\nIs the dotted line a line of symmetry?..." },
    { "from": "gpt", "value": "\\boxed{A}" }
  ],
  "meta": {
    "category": "(GradeSchool) Geometric",
    "source": "Processed",
    "PassRate_32BTrained": 0.1875
  }
}
```

`image` is a string for one image, a list for several, and omitted when the sample has none.

### Progress events (one JSON object per stdout line)

| event      | fields                                                                      |
| ---------- | --------------------------------------------------------------------------- |
| `start`    | `repo`, `split`, `total` (int or null)                                      |
| `progress` | `done`, `total`, `images`, `missing_images` (every 100 rows and at the end) |
| `log`      | `message` (e.g. `resuming after N samples`, `cancelled`)                    |
| `done`     | `n_samples`, `n_images`, `missing_images`, `out`                            |
| `error`    | `message` — process exits 1                                                 |

SIGTERM cancels: the partial file is kept (usable with `--resume`), `{"event":"log","message":"cancelled"}`
is printed, exit code 130. With `--resume`, `images`/`missing_images` count only the rows processed in that run.

## HF_TOKEN

Set `HF_TOKEN` in the environment for private or gated datasets. It is passed explicitly to
`HfApi`, `hf_hub_download`, `HfFileSystem` and `datasets`, and `huggingface_hub` / the `hf` CLI also
pick it up automatically. The token is never printed.
