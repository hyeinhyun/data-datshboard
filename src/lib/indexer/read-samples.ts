/**
 * Reads indexed samples back from their data files using the byte positions stored at
 * index time. Nothing of the conversation lives in the database; this is the only way
 * to get it.
 */
import fs from "node:fs";
import type { DatabaseSync } from "node:sqlite";

import { all } from "@/lib/db/client";
import { remapPath } from "@/lib/env";
import { toRawSample, type FormatSpec } from "@/lib/experiments/format";
import { deriveSample, type DerivedSample, type RawSample } from "./derive";

export type LiveSample =
  | { ok: true; sample: DerivedSample; stale: boolean }
  | { ok: false; error: string; stale: boolean };

type Location = {
  id: number;
  offset: number;
  length: number;
  jsonPath: string | null;
  formatSpec: string | null;
  fileMtime: string | null;
};

/**
 * Loads the given sample rows from disk, opening each data file once. `stale` is true
 * when the file changed after indexing, in which case the stored positions may no longer
 * point at the same record (the result is still returned if it parses).
 */
export function readSamples(db: DatabaseSync, ids: number[]): Map<number, LiveSample> {
  const out = new Map<number, LiveSample>();
  if (ids.length === 0) return out;
  const rows = all<Location>(
    db,
    `SELECT s.id, s.byte_offset AS offset, s.byte_length AS length, v.json_path AS jsonPath,
            v.format_spec AS formatSpec, v.file_mtime AS fileMtime
     FROM samples s JOIN variants v ON v.id = s.variant_id
     WHERE s.id IN (${ids.map(() => "?").join(",")})`,
    ...ids,
  );
  const byFile = new Map<string, Location[]>();
  for (const r of rows) {
    if (!r.jsonPath) {
      out.set(r.id, { ok: false, error: "variant에 파일 경로가 없습니다.", stale: false });
      continue;
    }
    const list = byFile.get(r.jsonPath) ?? [];
    list.push(r);
    byFile.set(r.jsonPath, list);
  }

  for (const [jsonPath, locs] of byFile) {
    const local = remapPath(jsonPath);
    let fd: number;
    let stale = false;
    try {
      fd = fs.openSync(local, "r");
      stale = fs.fstatSync(fd).mtime.toISOString() !== locs[0].fileMtime;
    } catch {
      for (const l of locs)
        out.set(l.id, { ok: false, error: `파일을 열 수 없습니다: ${local}`, stale: false });
      continue;
    }
    const spec = locs[0].formatSpec ? (JSON.parse(locs[0].formatSpec) as FormatSpec) : null;
    try {
      for (const l of locs) {
        try {
          const buf = Buffer.alloc(l.length);
          const n = fs.readSync(fd, buf, 0, l.length, l.offset);
          const row = JSON.parse(buf.subarray(0, n).toString("utf8")) as unknown;
          const raw = spec ? toRawSample(row, spec) : (row as RawSample);
          out.set(l.id, { ok: true, sample: deriveSample(raw), stale });
        } catch {
          out.set(l.id, {
            ok: false,
            error: stale
              ? "색인 후 파일이 바뀌어 이 샘플 위치를 읽을 수 없습니다. 다시 색인하세요."
              : "파일의 이 위치를 JSON으로 읽을 수 없습니다.",
            stale,
          });
        }
      }
    } finally {
      fs.closeSync(fd);
    }
  }
  return out;
}
