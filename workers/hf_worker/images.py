"""Image handling: turn whatever an image column holds into a file under the image dir."""

from __future__ import annotations

import io
import re
import time
import urllib.request
import zipfile
from pathlib import Path, PurePosixPath
from typing import Any, Callable

from PIL import Image

URL_RE = re.compile(r"^https?://", re.I)


def safe_name(text: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]", "_", text)[:150] or "x"


def is_url(value: Any) -> bool:
    return isinstance(value, str) and bool(URL_RE.match(value))


def save_pil(img: Image.Image, dest_stem: Path) -> Path:
    """Save as PNG when the image has alpha, otherwise RGB JPEG."""
    has_alpha = img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info)
    if has_alpha:
        path = dest_stem.with_suffix(".png")
        img.save(path, format="PNG")
    else:
        path = dest_stem.with_suffix(".jpg")
        img.convert("RGB").save(path, format="JPEG", quality=95)
    return path


def fetch_url(url: str, retries: int = 3, timeout: float = 30) -> bytes:
    last: Exception | None = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "sft-dashboard-hf-worker"})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(min(2**attempt, 5))
    raise RuntimeError(f"download failed: {url}: {last}")


class ArchiveIndex:
    """Lazily downloads the repo's zip archives and indexes member names."""

    def __init__(self, archive_paths: list[str], download: Callable[[str], str]):
        self._archive_paths = archive_paths
        self._download = download
        self._loaded = False
        self._zips: list[zipfile.ZipFile] = []
        self._by_path: dict[str, tuple[zipfile.ZipFile, str]] = {}
        self._by_base: dict[str, tuple[zipfile.ZipFile, str]] = {}

    def _load(self) -> None:
        if self._loaded:
            return
        self._loaded = True
        for ap in self._archive_paths:
            zf = zipfile.ZipFile(self._download(ap))
            self._zips.append(zf)
            for name in zf.namelist():
                if name.endswith("/"):
                    continue
                key = (zf, name)
                self._by_path.setdefault(name.lstrip("./"), key)
                self._by_base.setdefault(PurePosixPath(name).name, key)

    def find(self, rel: str) -> tuple[zipfile.ZipFile, str] | None:
        if not self._archive_paths:
            return None
        self._load()
        rel = rel.replace("\\", "/").lstrip("./")
        hit = self._by_path.get(rel)
        if hit is None:
            # match by suffix (zip may have an extra top folder), then by basename
            for name, key in self._by_path.items():
                if name.endswith("/" + rel):
                    hit = key
                    break
        return hit or self._by_base.get(PurePosixPath(rel).name)

    def close(self) -> None:
        for zf in self._zips:
            zf.close()


class ImageWriter:
    """Writes one image value to `<image_dir>/<stem>.<ext>`; returns the file name or None."""

    def __init__(
        self,
        image_dir: str | Path,
        archive_index: ArchiveIndex | None = None,
        repo_files: set[str] | None = None,
        download: Callable[[str], str] | None = None,
    ):
        self.image_dir = Path(image_dir)
        self.image_dir.mkdir(parents=True, exist_ok=True)
        self.archives = archive_index
        self.repo_files = repo_files or set()
        self.download = download

    def write(self, value: Any, stem: str) -> str | None:
        dest_stem = self.image_dir / safe_name(stem)
        try:
            path = self._write(value, dest_stem)
        except Exception:  # noqa: BLE001 - corrupt/unreachable image counts as missing
            return None
        return path.name if path else None

    def _write(self, value: Any, dest_stem: Path) -> Path | None:
        if value is None:
            return None
        if isinstance(value, Image.Image):
            return save_pil(value, dest_stem)
        if isinstance(value, (bytes, bytearray)):
            return save_pil(Image.open(io.BytesIO(value)), dest_stem)
        if isinstance(value, dict):  # HF Image feature undecoded: {"bytes":..., "path":...}
            if value.get("bytes"):
                return self._write(value["bytes"], dest_stem)
            return self._write(value.get("path"), dest_stem)
        if isinstance(value, str):
            if is_url(value):
                return save_pil(Image.open(io.BytesIO(fetch_url(value))), dest_stem)
            return self._write_relative(value, dest_stem)
        return None

    def _write_relative(self, rel: str, dest_stem: Path) -> Path | None:
        ext = PurePosixPath(rel).suffix.lower() or ".jpg"
        dest = dest_stem.with_suffix(ext)
        if self.archives is not None:
            hit = self.archives.find(rel)
            if hit:
                zf, member = hit
                with zf.open(member) as src, open(dest, "wb") as out:
                    out.write(src.read())
                return dest
        clean = rel.lstrip("./")
        if self.download and clean in self.repo_files:  # image stored loose in the repo
            data = Path(self.download(clean)).read_bytes()
            dest.write_bytes(data)
            return dest
        return None
