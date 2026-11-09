import json
import os
import zipfile

import pyarrow as pa
import pyarrow.parquet as pq
import pytest
from PIL import Image

from hf_worker import hf_import, source

N_ROWS = 7


@pytest.fixture
def fake_repo(tmp_path, monkeypatch):
    """Local parquet + images.zip standing in for a ViRL39K-like repo."""
    repo_dir = tmp_path / "repo"
    repo_dir.mkdir()
    rows = {
        "question": [f"<image>\nQuestion {i}?" for i in range(N_ROWS)],
        "answer": [f"\\boxed{{{i}}}" for i in range(N_ROWS)],
        "image": [[f"images/img-{i}.jpg"] for i in range(N_ROWS)],
        "qid": [f"Processed-{i}" for i in range(N_ROWS)],
        "category": ["(GradeSchool) Geometric"] * N_ROWS,
    }
    rows["image"][3] = ["images/does-not-exist.jpg"]  # missing image
    rows["image"][5] = ["images/img-5.jpg", "images/img-6.jpg"]  # multi-image
    pq.write_table(pa.table(rows), repo_dir / "data.parquet")
    with zipfile.ZipFile(repo_dir / "images.zip", "w") as zf:
        for i in range(N_ROWS):
            if i == 3:
                continue
            img_path = tmp_path / f"img-{i}.jpg"
            Image.new("RGB", (8, 8), (i * 30, 0, 0)).save(img_path)
            zf.write(img_path, f"images/img-{i}.jpg")

    files = [{"path": "data.parquet", "size": 1}, {"path": "images.zip", "size": 1}]
    monkeypatch.setattr(source, "list_files", lambda repo: files)
    monkeypatch.setattr(source, "download", lambda repo, p, cache_dir=None: str(repo_dir / p))
    monkeypatch.setattr(source, "count_rows", lambda *a, **k: N_ROWS)
    monkeypatch.setattr(
        source, "iter_rows", lambda repo, config, split, cache_dir=None, files=None: source.iter_parquet(str(repo_dir / "data.parquet"), batch_size=2)
    )

    mapping = tmp_path / "mapping.json"
    mapping.write_text(json.dumps({
        "question": "question", "answer": "answer", "image": "image", "id": "qid",
        "system": None, "conversations": None, "meta": ["category"], "normalize_tokens": True,
    }))
    return tmp_path, mapping


def _run(tmp_path, mapping, *extra):
    out = tmp_path / "out" / "virl.json"
    img_dir = tmp_path / "imgs"
    code = hf_import.main([
        "--repo", "TIGER-Lab/ViRL39K", "--mapping", str(mapping), "--out", str(out),
        "--image-dir", str(img_dir), "--image-rel-prefix", "hf_imports/ViRL39K", *extra,
    ])
    return code, out, img_dir


def _events(capsys):
    return [json.loads(line) for line in capsys.readouterr().out.splitlines() if line.strip()]


def test_import_end_to_end(fake_repo, capsys):
    tmp_path, mapping = fake_repo
    code, out, img_dir = _run(tmp_path, mapping)
    assert code == 0
    data = json.loads(out.read_text())
    assert len(data) == N_ROWS
    first = data[0]
    assert first["id"] == "Processed-0"
    assert first["image"] == "hf_imports/ViRL39K/Processed-0-0.jpg"
    assert first["conversations"] == [
        {"from": "human", "value": "<|image|>\nQuestion 0?"},
        {"from": "gpt", "value": "\\boxed{0}"},
    ]
    assert first["meta"] == {"category": "(GradeSchool) Geometric"}
    assert "image" not in data[3]  # missing image dropped, sample kept
    assert data[5]["image"] == ["hf_imports/ViRL39K/Processed-5-0.jpg", "hf_imports/ViRL39K/Processed-5-1.jpg"]
    assert (img_dir / "Processed-0-0.jpg").exists()
    assert len(list(img_dir.iterdir())) == N_ROWS  # 6 single + 1 extra for multi - 1 missing
    assert not out.with_name(out.name + ".partial").exists()

    events = _events(capsys)
    assert events[0] == {"event": "start", "repo": "TIGER-Lab/ViRL39K", "split": "train", "total": N_ROWS}
    assert events[-1]["event"] == "done"
    assert events[-1]["n_samples"] == N_ROWS
    assert events[-1]["n_images"] == N_ROWS
    assert events[-1]["missing_images"] == 1


def test_import_max_samples_and_first_image_mode(fake_repo, capsys):
    tmp_path, mapping = fake_repo
    code, out, _ = _run(tmp_path, mapping, "--max-samples", "6", "--image-mode", "first")
    assert code == 0
    data = json.loads(out.read_text())
    assert len(data) == 6
    assert data[5]["image"] == "hf_imports/ViRL39K/Processed-5-0.jpg"
    assert _events(capsys)[0]["total"] == 6


def test_import_resume(fake_repo, capsys):
    tmp_path, mapping = fake_repo
    code, out, _ = _run(tmp_path, mapping, "--max-samples", "3")
    assert code == 0
    full = json.loads(out.read_text())
    # Simulate an interrupted run: 3 complete items + a torn 4th one in the partial file.
    partial = out.with_name(out.name + ".partial")
    lines = ["["] + [json.dumps(s) + "," for s in full[:2]] + [json.dumps(full[2])]
    partial.write_text("\n".join(lines) + ',\n{"id": "torn', encoding="utf-8")
    os.remove(out)
    capsys.readouterr()

    code, out, _ = _run(tmp_path, mapping, "--resume")
    assert code == 0
    data = json.loads(out.read_text())
    assert [s["id"] for s in data] == [f"Processed-{i}" for i in range(N_ROWS)]
    events = _events(capsys)
    assert any(e["event"] == "log" and "resuming after 3" in e["message"] for e in events)
    assert events[-1]["n_samples"] == N_ROWS


def test_import_bytes_images(tmp_path, monkeypatch, capsys):
    import io

    buf = io.BytesIO()
    Image.new("RGBA", (4, 4)).save(buf, format="PNG")
    rows = [{"q": "hi", "a": "yo", "img": {"bytes": buf.getvalue(), "path": None}}]
    monkeypatch.setattr(source, "list_files", lambda repo: [])
    monkeypatch.setattr(source, "count_rows", lambda *a, **k: None)
    monkeypatch.setattr(source, "iter_rows", lambda *a, **k: iter(rows))
    mapping = tmp_path / "m.json"
    mapping.write_text(json.dumps({"question": "q", "answer": "a", "image": "img"}))
    code, out, img_dir = _run(tmp_path, mapping)
    assert code == 0
    data = json.loads(out.read_text())
    assert data[0]["id"] == "0"
    assert data[0]["image"] == "hf_imports/ViRL39K/0-0.png"  # alpha -> PNG
    assert data[0]["conversations"][0]["value"] == "<|image|>\nhi"


def test_import_error_event(tmp_path, capsys):
    mapping = tmp_path / "m.json"
    mapping.write_text(json.dumps({"question": "q"}))
    code, _, _ = _run(tmp_path, mapping)
    assert code == 1
    assert _events(capsys)[-1]["event"] == "error"


def test_import_sigterm_cancels(fake_repo, monkeypatch, capsys):
    import signal

    tmp_path, mapping = fake_repo

    def rows(*a, **k):
        for i, row in enumerate(source.iter_parquet(str(tmp_path / "repo" / "data.parquet"))):
            if i == 2:
                os.kill(os.getpid(), signal.SIGTERM)
            yield row

    monkeypatch.setattr(source, "iter_rows", rows)
    old = signal.getsignal(signal.SIGTERM)
    try:
        code, out, _ = _run(tmp_path, mapping)
    finally:
        signal.signal(signal.SIGTERM, old)
    assert code == 130
    assert not out.exists()
    assert out.with_name(out.name + ".partial").exists()
    assert _events(capsys)[-1] == {"event": "log", "message": "cancelled"}
