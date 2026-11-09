from PIL import Image

from hf_worker.convert import build_conversations, convert_row, convert_turns, json_safe
from hf_worker.hf_inspect import detect_image_source
from hf_worker.source import parse_repo, parquet_files_for_split


def test_convert_turns_maps_roles():
    turns = [
        {"role": "system", "content": "Be brief."},
        {"role": "user", "content": "<image>\nWhat?"},
        {"role": "assistant", "content": "A cat."},
        {"from": "human", "value": "Sure?"},
        {"from": "gpt", "value": "Yes."},
    ]
    assert [t["from"] for t in convert_turns(turns)] == ["system", "human", "gpt", "human", "gpt"]


def test_conversations_column_normalizes_first_human_turn_only():
    row = {"conv": [
        {"role": "user", "content": "What is shown?"},
        {"role": "assistant", "content": "A dog."},
        {"role": "user", "content": "<image> again"},
    ]}
    mapping = {"conversations": "conv", "system": "SYS", "normalize_tokens": True}
    conv = build_conversations(row, mapping, n_images=1)
    assert conv[0] == {"from": "system", "value": "SYS"}
    assert conv[1]["value"] == "<|image|>\nWhat is shown?"
    assert conv[3]["value"] == "<image> again"  # later turns untouched


def test_convert_row_single_multi_and_no_image():
    mapping = {"question": "q", "answer": "a", "meta": ["cat"]}
    row = {"q": "<image>\nQ", "a": "\\boxed{A}", "cat": "geo"}
    one = convert_row(row, mapping, "x", ["p/x-0.jpg"])
    assert one["image"] == "p/x-0.jpg"
    assert one["conversations"] == [
        {"from": "human", "value": "<|image|>\nQ"},
        {"from": "gpt", "value": "\\boxed{A}"},
    ]
    assert one["meta"] == {"cat": "geo"}
    two = convert_row({"q": "Q", "a": "A"}, {"question": "q", "answer": "a"}, "y", ["a.jpg", "b.jpg"])
    assert two["image"] == ["a.jpg", "b.jpg"]
    assert two["conversations"][0]["value"] == "<|image|>\n<|image|>\nQ"
    none = convert_row({"q": "Q", "a": "A"}, {"question": "q", "answer": "a"}, "z", [])
    assert "image" not in none and "meta" not in none
    assert none["conversations"][0]["value"] == "Q"


def test_json_safe_truncates():
    out = json_safe({"b": b"12345", "s": "x" * 600, "n": float("nan"), "img": Image.new("RGB", (3, 2))}, 500)
    assert out["b"] == "<bytes 5>"
    assert len(out["s"]) == 501
    assert out["n"] is None
    assert out["img"] == "<image 3x2>"


def test_detect_image_source():
    assert detect_image_source("image", []) == "bytes"
    assert detect_image_source("list<string>", [["images/a.jpg"]]) == "relative_path"
    assert detect_image_source("string", ["https://x/y.png"]) == "url"
    assert detect_image_source("string", [None]) == "none"


def test_parse_repo_and_split_files():
    assert parse_repo("https://huggingface.co/datasets/TIGER-Lab/ViRL39K") == "TIGER-Lab/ViRL39K"
    assert parse_repo("https://huggingface.co/datasets/a/b/tree/main") == "a/b"
    assert parse_repo("a/b") == "a/b"
    files = [{"path": p} for p in ["data/train-0.parquet", "data/test-0.parquet", "README.md"]]
    assert parquet_files_for_split(files, None, "test") == ["data/test-0.parquet"]
    assert parquet_files_for_split([{"path": "39Krelease.parquet"}], None, "train") == ["39Krelease.parquet"]


def test_value_type():
    from hf_worker.hf_inspect import value_type

    assert value_type(["a"]) == "list<string>"
    assert value_type(0.5) == "float64"
    assert value_type({"bytes": b"", "path": None}) == "image"
