// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

import { describe, expect, it } from "vitest";

import { openDatabase } from "@/lib/db/client";
import { indexVariant } from "@/lib/indexer/index-variant";
import { scanArray, scanLines, type ScannedRecord } from "@/lib/indexer/offsets";
import { readSamples } from "@/lib/indexer/read-samples";
import { getSample } from "@/lib/queries/samples";

/** Feeds `buf` in chunks of `size` bytes to exercise records split across chunks. */
function chunked(buf: Buffer, size: number): Readable {
  const parts: Buffer[] = [];
  for (let i = 0; i < buf.length; i += size) parts.push(buf.subarray(i, i + size));
  return Readable.from(parts);
}

async function collect(gen: AsyncGenerator<ScannedRecord>) {
  const out: ScannedRecord[] = [];
  for await (const r of gen) out.push(r);
  return out;
}

const TRICKY = [
  { id: 1, q: "한글 질문 🐱", a: 'quote " and \\ backslash' },
  { id: 2, q: "brackets ] [ } { , in a string", nested: [[1, 2], { x: [3] }] },
  { id: 3, q: "end\\" },
];

describe("offset scanners", () => {
  for (const size of [1, 3, 7, 64, 1 << 16]) {
    it(`finds every JSON array element at its byte position (chunk ${size})`, async () => {
      const text =
        "﻿ [\n  " + TRICKY.map((t) => JSON.stringify(t, null, 1)).join(" ,\r\n ") + "\n]\n";
      const buf = Buffer.from(text, "utf8");
      const recs = await collect(scanArray(chunked(buf, size)));
      expect(
        recs.map((r) => JSON.parse(buf.subarray(r.offset, r.offset + r.length).toString())),
      ).toEqual(TRICKY);
      expect(recs.map((r) => r.bytes.equals(buf.subarray(r.offset, r.offset + r.length)))).toEqual([
        true,
        true,
        true,
      ]);
    });

    it(`finds every JSONL line at its byte position (chunk ${size})`, async () => {
      const text = "﻿" + TRICKY.map((t) => JSON.stringify(t)).join("\r\n") + "\n\n   \n{bad\n";
      const buf = Buffer.from(text, "utf8");
      const recs = await collect(scanLines(chunked(buf, size)));
      expect(recs.map((r) => r.ordinal)).toEqual([1, 2, 3, 6]);
      const parsed = recs
        .slice(0, 3)
        .map((r) => JSON.parse(buf.subarray(r.offset, r.offset + r.length).toString()));
      expect(parsed).toEqual(TRICKY);
      expect(buf.subarray(recs[3].offset, recs[3].offset + recs[3].length).toString()).toBe("{bad");
    });
  }

  it("rejects a truncated array", async () => {
    await expect(collect(scanArray(chunked(Buffer.from('[{"a":1},{"b":'), 4)))).rejects.toThrow(
      /잘렸/,
    );
  });
});

describe("index by position, read live", () => {
  function setup(file: string) {
    const db = openDatabase(":memory:");
    db.exec(`INSERT INTO datapacks (name) VALUES ('p')`);
    db.exec(`INSERT INTO datasets (datapack_id, name) VALUES (1, 'd')`);
    db.prepare(`INSERT INTO variants (dataset_id, kind, json_path) VALUES (1, 'default', ?)`).run(
      file,
    );
    return db;
  }

  it("stores no conversation text and reads it back from the file", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sft-offsets-"));
    const file = path.join(dir, "d.jsonl");
    const long = "가".repeat(5000);
    const rows = [0, 1, 2].map((i) => ({
      id: `r${i}`,
      conversations: [
        { from: "human", value: `Q${i} ${long}` },
        { from: "gpt", value: `GT ${i} ${long}` },
      ],
      meta: { k: i },
    }));
    fs.writeFileSync(file, rows.map((r) => JSON.stringify(r)).join("\n"));
    const db = setup(file);
    await indexVariant(db, 1);

    const cols = (db.prepare(`PRAGMA table_info(samples)`).all() as { name: string }[]).map(
      (c) => c.name,
    );
    expect(cols).not.toContain("conversations");
    const stored = db.prepare(`SELECT max(length(first_question)) AS q FROM samples`).get() as {
      q: number;
    };
    expect(stored.q).toBe(300);

    const s = getSample(db, 2)!;
    expect(s.loadError).toBeNull();
    expect(s.stale).toBe(false);
    expect(s.conversations[1].value).toBe(`GT 1 ${long}`);
    expect(s.meta).toEqual({ k: 1 });

    // The file changes after indexing: flagged as stale (and re-index fixes it).
    fs.writeFileSync(file, "\n\n" + rows.map((r) => JSON.stringify(r)).join("\n"));
    fs.utimesSync(file, new Date(), new Date(Date.now() + 5000));
    const live = readSamples(db, [2]).get(2)!;
    expect(live.stale).toBe(true);
    await indexVariant(db, 1);
    const rowId = (
      db.prepare(`SELECT id FROM samples WHERE sample_id = 'r1'`).get() as { id: number }
    ).id;
    const again = getSample(db, rowId)!;
    expect([again.stale, again.conversations[0].value.startsWith("Q1")]).toEqual([false, true]);

    // Missing file: an error instead of a crash.
    fs.rmSync(file);
    expect(getSample(db, rowId)!.loadError).toMatch(/열 수 없습니다/);
  });
});
