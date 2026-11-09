"""Real HuggingFace calls. Skipped unless HF_NETWORK_TESTS=1."""

import json
import os

import pytest

from hf_worker import hf_import, hf_inspect

pytestmark = pytest.mark.skipif(os.environ.get("HF_NETWORK_TESTS") != "1", reason="set HF_NETWORK_TESTS=1")

REPO = "TIGER-Lab/ViRL39K"


def test_inspect_virl39k():
    info = hf_inspect.inspect(REPO, None, None, 3)
    assert "images.zip" in info["archives"]
    assert info["image_source"] == "relative_path"
    assert info["suggested_mapping"]["id"] == "qid"
    assert len(info["preview"]) == 3


def test_import_virl39k_first_20(tmp_path):
    mapping = tmp_path / "m.json"
    mapping.write_text(json.dumps({
        "question": "question", "answer": "answer", "image": "image", "id": "qid",
        "meta": ["category", "source", "PassRate_32BTrained"],
    }))
    out = tmp_path / "virl.json"
    code = hf_import.main([
        "--repo", REPO, "--mapping", str(mapping), "--out", str(out),
        "--image-dir", str(tmp_path / "imgs"), "--image-rel-prefix", "hf_imports/ViRL39K", "--max-samples", "20",
    ])
    assert code == 0
    data = json.loads(out.read_text())
    assert len(data) == 20
    assert data[0]["conversations"][0]["value"].startswith("<|image|>")
