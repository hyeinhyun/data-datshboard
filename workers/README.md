# workers

Python worker that converts HuggingFace datasets into the LLaVA JSON format used by the dashboard.
The Next.js server runs it as a child process and parses the JSON lines it prints.

```bash
cd workers
uv sync                       # creates .venv with Python 3.11
uv run pytest                 # unit tests
uv run python -m hf_worker.hf_inspect --repo TIGER-Lab/ViRL39K
```

`HF_TOKEN` in the environment is picked up automatically by `huggingface_hub` and the `hf` CLI.
