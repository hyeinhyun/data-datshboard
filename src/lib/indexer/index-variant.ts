import fs from "node:fs";
import readline from "node:readline";
import type { DatabaseSync } from "node:sqlite";
import { pipeline } from "node:stream/promises";

import { streamArray } from "stream-json/streamers/stream-array.js";

import { transaction } from "@/lib/db/client";
import { remapPath } from "@/lib/env";
import { toRawSample, type FormatSpec } from "@/lib/experiments/format";
import { deriveSample, type RawSample } from "./derive";

export type FileLayout = "array" | "lines";

/**
 * A JSON array (`[ {...}, ... ]`) or JSON Lines (one object per line). Decided by the
 * first non-whitespace character rather than the extension: `.json` files written by
 * `to_json(lines=True)` are common.
 */
export function detectLayout(file: string): FileLayout {
  const fd = fs.openSync(file, "r");
  try {
    const buf = Buffer.alloc(64 * 1024);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    const head = buf.subarray(0, n).toString("utf8").replace(/^﻿/, "");
    const first = head.trimStart()[0];
    if (first === "[") return "array";
    if (first === "{") return "lines";
    throw new Error("JSON 배열이나 JSONL(줄마다 객체) 형식이 아닙니다.");
  } finally {
    fs.closeSync(fd);
  }
}

/** Calls `onRow` for each element of a JSON array or each line of a JSONL file. */
async function forEachRow(
  source: fs.ReadStream,
  layout: FileLayout,
  onRow: (row: unknown) => void,
  onBadLine: (lineNo: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (layout === "array") {
    const items = streamArray.withParserAsStream();
    await pipeline(source, items, async function (iterable: AsyncIterable<{ value: unknown }>) {
      for await (const item of iterable) {
        if (signal?.aborted) throw new IndexCancelled();
        onRow(item.value);
      }
    });
    return;
  }
  const rl = readline.createInterface({ input: source, crlfDelay: Infinity });
  let lineNo = 0;
  try {
    for await (const line of rl) {
      if (signal?.aborted) throw new IndexCancelled();
      lineNo++;
      const t = line.trim();
      if (!t) continue;
      let row: unknown;
      try {
        row = JSON.parse(t);
      } catch {
        onBadLine(lineNo);
        continue;
      }
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        onBadLine(lineNo);
        continue;
      }
      onRow(row);
    }
    // A destroyed input may end the iterator quietly; never report a partial file as done.
    if (signal?.aborted) throw new IndexCancelled();
  } finally {
    rl.close();
    // close() only pauses the input; release the file descriptor too.
    if (!source.destroyed) source.destroy();
  }
}

export type IndexProgress = {
  done: number;
  bytesRead: number;
  bytesTotal: number;
};

export type IndexOptions = {
  onProgress?: (p: IndexProgress) => void;
  signal?: AbortSignal;
  batchSize?: number;
};

export type IndexResult = { variantId: number; nSamples: number; path: string; badLines: number };

export class IndexCancelled extends Error {
  constructor() {
    super("색인이 취소되었습니다.");
  }
}

/**
 * Streams the variant's JSON array into `samples` (+ FTS) in batches so memory stays
 * flat for files with hundreds of thousands of samples. Replaces any previous index
 * of the same variant.
 */
export async function indexVariant(
  db: DatabaseSync,
  variantId: number,
  options: IndexOptions = {},
): Promise<IndexResult> {
  const batchSize = options.batchSize ?? 1000;
  const variant = db
    .prepare(`SELECT id, json_path, format_spec FROM variants WHERE id = ?`)
    .get(variantId) as
    { id: number; json_path: string | null; format_spec: string | null } | undefined;
  if (!variant) throw new Error(`variant ${variantId}를 찾을 수 없습니다.`);
  if (!variant.json_path) throw new Error("이 variant에는 JSON 경로가 없습니다.");
  const path = remapPath(variant.json_path);
  const spec = variant.format_spec ? (JSON.parse(variant.format_spec) as FormatSpec) : null;
  let stat: fs.Stats;
  let layout: FileLayout;
  try {
    stat = fs.statSync(path);
  } catch {
    throw new Error(`JSON 파일을 찾을 수 없습니다: ${path}`);
  }
  try {
    layout = detectLayout(path);
  } catch (err) {
    db.prepare(`UPDATE variants SET index_status = 'error', index_error = ? WHERE id = ?`).run(
      (err as Error).message,
      variantId,
    );
    throw err;
  }

  db.prepare(`UPDATE variants SET index_status = 'running', index_error = NULL WHERE id = ?`).run(
    variantId,
  );
  clearVariantSamples(db, variantId);

  const insertSample = db.prepare(
    `INSERT INTO samples (variant_id, sample_id, image_paths, n_images, n_turns, has_system,
       first_question, first_answer_preview, q_chars, a_chars, meta, conversations)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertFts = db.prepare(
    `INSERT INTO samples_fts (rowid, first_question, answer_text) VALUES (?, ?, ?)`,
  );

  let batch: RawSample[] = [];
  let done = 0;
  let bytesRead = 0;
  let badLines = 0;
  let firstBadLine = 0;
  const flush = () => {
    if (batch.length === 0) return;
    const rows = batch;
    batch = [];
    transaction(db, () => {
      for (const raw of rows) {
        const d = deriveSample(raw);
        const result = insertSample.run(
          variantId,
          d.sampleId,
          JSON.stringify(d.imagePaths),
          d.nImages,
          d.nTurns,
          d.hasSystem ? 1 : 0,
          d.firstQuestion,
          d.firstAnswerPreview,
          d.qChars,
          d.aChars,
          d.meta ? JSON.stringify(d.meta) : null,
          JSON.stringify(d.conversations),
        );
        insertFts.run(Number(result.lastInsertRowid), d.firstQuestion ?? "", d.answerText);
      }
    });
    done += rows.length;
    options.onProgress?.({ done, bytesRead, bytesTotal: stat.size });
  };

  const source = fs.createReadStream(path, { highWaterMark: 1 << 20 });
  source.on("data", (chunk) => {
    bytesRead += chunk.length;
  });
  const abort = () => source.destroy(new IndexCancelled());
  options.signal?.addEventListener("abort", abort, { once: true });

  try {
    await forEachRow(
      source,
      layout,
      (row) => {
        batch.push(spec ? toRawSample(row, spec) : (row as RawSample));
        if (batch.length >= batchSize) flush();
      },
      (lineNo) => {
        badLines++;
        if (!firstBadLine) firstBadLine = lineNo;
      },
      options.signal,
    );
    flush();
  } catch (err) {
    clearVariantSamples(db, variantId);
    const cancelled = err instanceof IndexCancelled || options.signal?.aborted;
    db.prepare(
      `UPDATE variants SET index_status = ?, index_error = ?, n_samples_indexed = 0 WHERE id = ?`,
    ).run(cancelled ? "none" : "error", cancelled ? null : (err as Error).message, variantId);
    throw cancelled ? new IndexCancelled() : err;
  } finally {
    options.signal?.removeEventListener("abort", abort);
  }

  // Bad JSONL lines are skipped rather than failing the whole file; keep a note of them.
  const warning = badLines
    ? `JSON으로 읽을 수 없는 줄 ${badLines.toLocaleString("ko-KR")}개를 건너뜀 (첫 줄: ${firstBadLine})`
    : null;
  db.prepare(
    `UPDATE variants SET index_status = 'done', n_samples_indexed = ?, indexed_at = datetime('now'),
       file_mtime = ?, index_error = ? WHERE id = ?`,
  ).run(done, stat.mtime.toISOString(), warning, variantId);
  return { variantId, nSamples: done, path, badLines };
}

export function clearVariantSamples(db: DatabaseSync, variantId: number): void {
  transaction(db, () => {
    db.prepare(
      `DELETE FROM samples_fts WHERE rowid IN (SELECT id FROM samples WHERE variant_id = ?)`,
    ).run(variantId);
    db.prepare(`DELETE FROM samples WHERE variant_id = ?`).run(variantId);
  });
}

/** True when the JSON file changed since the variant was indexed (or was never indexed). */
export function variantIsStale(db: DatabaseSync, variantId: number): boolean {
  const v = db
    .prepare(`SELECT json_path, index_status, file_mtime FROM variants WHERE id = ?`)
    .get(variantId) as
    { json_path: string | null; index_status: string; file_mtime: string | null } | undefined;
  if (!v?.json_path) return false;
  try {
    const mtime = fs.statSync(remapPath(v.json_path)).mtime.toISOString();
    return v.index_status !== "done" || v.file_mtime !== mtime;
  } catch {
    return false;
  }
}
