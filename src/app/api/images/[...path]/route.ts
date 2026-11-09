import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

import { NextResponse } from "next/server";
import sharp from "sharp";

import {
  ImageForbidden,
  ImageNotFound,
  mimeFor,
  resolveImagePath,
  thumbPath,
} from "@/lib/images/resolve";

export const runtime = "nodejs";

const ALLOWED_WIDTHS = new Set([128, 256, 512, 1024]);

/** GET /api/images/<relative path>[?w=256] — streams the original or a cached WebP thumbnail. */
export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await params;
  const relative = segments.map((s) => decodeURIComponent(s)).join("/");
  let source: string;
  try {
    source = resolveImagePath(relative);
  } catch (err) {
    if (err instanceof ImageForbidden)
      return NextResponse.json({ error: err.message }, { status: 403 });
    if (err instanceof ImageNotFound)
      return NextResponse.json({ error: err.message }, { status: 404 });
    throw err;
  }

  const wParam = Number(new URL(request.url).searchParams.get("w"));
  const width = ALLOWED_WIDTHS.has(wParam) ? wParam : null;
  const headers: Record<string, string> = {
    "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
  };

  if (width) {
    const cached = thumbPath(source, width);
    if (!fs.existsSync(cached)) {
      fs.mkdirSync(path.dirname(cached), { recursive: true });
      try {
        await sharp(source)
          .rotate()
          .resize({ width, withoutEnlargement: true })
          .webp({ quality: 80 })
          .toFile(cached);
      } catch (err) {
        return NextResponse.json(
          { error: `썸네일 생성 실패: ${(err as Error).message}` },
          { status: 500 },
        );
      }
    }
    return new Response(Readable.toWeb(fs.createReadStream(cached)) as ReadableStream, {
      headers: { ...headers, "content-type": "image/webp" },
    });
  }

  const stat = fs.statSync(source);
  return new Response(Readable.toWeb(fs.createReadStream(source)) as ReadableStream, {
    headers: { ...headers, "content-type": mimeFor(source), "content-length": String(stat.size) },
  });
}
