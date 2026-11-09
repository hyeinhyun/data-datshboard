"""HuggingFace -> LLaVA JSON conversion worker.

Invoked by the Next.js server as a child process. Every line written to stdout
is a JSON object (see `progress.py`), so the caller can stream progress.
"""

__version__ = "0.1.0"
