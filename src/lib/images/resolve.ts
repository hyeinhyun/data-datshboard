import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { env } from "@/lib/env";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
};

export class ImageNotFound extends Error {}
export class ImageForbidden extends Error {}

/** Resolves a sample's relative image path under IMAGE_ROOT, refusing anything that escapes it. */
export function resolveImagePath(relative: string): string {
  const root = path.resolve(env.IMAGE_ROOT);
  const resolved = path.resolve(root, relative.replace(/^\/+/, ""));
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new ImageForbidden(`이미지 루트 밖의 경로입니다: ${relative}`);
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new ImageNotFound(`이미지를 찾을 수 없습니다: ${relative}`);
  }
  return resolved;
}

export function mimeFor(file: string): string {
  return MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream";
}

/** Cache file for a thumbnail of `source` at `width`, keyed by path + mtime so edits invalidate. */
export function thumbPath(source: string, width: number): string {
  const stat = fs.statSync(source);
  const key = crypto.createHash("sha1").update(`${source}|${stat.mtimeMs}|${width}`).digest("hex");
  return path.join(env.THUMB_DIR, key.slice(0, 2), `${key}.webp`);
}
