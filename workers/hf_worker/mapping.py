"""Field-mapping suggestions for arbitrary HF dataset schemas."""

from __future__ import annotations

import re

QUESTION_HINTS = ("question", "prompt", "instruction", "query", "input")
ANSWER_HINTS = ("answer", "response", "output", "solution", "target", "label")
IMAGE_HINTS = ("image", "img", "images", "picture")
ID_HINTS = ("qid", "id", "uid", "sample_id")

# Our canonical image token and the variants other datasets use.
CANONICAL_IMAGE_TOKEN = "<|image|>"
IMAGE_TOKEN_VARIANTS = ("<image>", "<img>", "[IMG]", "<image_placeholder>")


def _first_match(columns: list[str], hints: tuple[str, ...]) -> str | None:
    lowered = {c.lower(): c for c in columns}
    for hint in hints:
        if hint in lowered:
            return lowered[hint]
    for hint in hints:
        for low, original in lowered.items():
            if hint in low:
                return original
    return None


def suggest_mapping(columns: list[str]) -> dict[str, str | None]:
    """Guess which columns hold the question, answer, image and id."""
    return {
        "question": _first_match(columns, QUESTION_HINTS),
        "answer": _first_match(columns, ANSWER_HINTS),
        "image": _first_match(columns, IMAGE_HINTS),
        "id": _first_match(columns, ID_HINTS),
    }


def normalize_image_tokens(text: str, n_images: int = 1) -> str:
    """Replace known image-token variants with the canonical token.

    If the text contains no token at all and the sample has images, prepend one
    canonical token per image on its own line (LLaVA convention).
    """
    pattern = "|".join(re.escape(t) for t in IMAGE_TOKEN_VARIANTS)
    normalized = re.sub(pattern, CANONICAL_IMAGE_TOKEN, text)
    if n_images > 0 and CANONICAL_IMAGE_TOKEN not in normalized:
        prefix = "\n".join([CANONICAL_IMAGE_TOKEN] * n_images)
        normalized = f"{prefix}\n{normalized}"
    return normalized
