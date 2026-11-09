// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { openDatabase } from "@/lib/db/client";
import { deriveSample } from "@/lib/indexer/derive";
import { IndexCancelled, indexVariant } from "@/lib/indexer/index-variant";

const EXAMPLE = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../../data/samples/conversation_example.json"), "utf8"),
)[0];

describe("deriveSample", () => {
  it("derives turn counts, previews and image paths from the example", () => {
    const d = deriveSample(EXAMPLE);
    expect(d.sampleId).toBe("syn_hbar_d5etglu7");
    expect(d.imagePaths).toEqual(["Syn_gen_ds/syn_gen_train_ds/syn_hbar_d5etglu7.jpg"]);
    expect(d.nTurns).toBe(4);
    expect(d.hasSystem).toBe(true);
    expect(d.firstQuestion).toBe("What is the label on the x-axis?");
    expect(d.firstAnswerPreview!.length).toBeLessThanOrEqual(200);
    expect(d.qChars).toBeGreaterThan(0);
    expect(d.aChars).toBeGreaterThan(d.qChars);
    expect(d.meta).toBeNull();
  });

  it("keeps extra keys as meta and accepts image lists / user-assistant roles", () => {
    const d = deriveSample({
      id: 7,
      image: ["a.jpg", "b.jpg"],
      category: "Math",
      meta: { source: "hf" },
      conversations: [
        { from: "user", value: "<image>\n<image>\nQ?" },
        { from: "assistant", value: "A." },
      ],
    });
    expect(d.sampleId).toBe("7");
    expect(d.nImages).toBe(2);
    expect(d.firstQuestion).toBe("Q?");
    expect(d.meta).toEqual({ source: "hf", category: "Math" });
    expect(d.nTurns).toBe(1);
  });
});

function writeJson(n: number): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sft-index-"));
  const file = path.join(dir, "samples.json");
  const fd = fs.openSync(file, "w");
  fs.writeSync(fd, "[");
  for (let i = 0; i < n; i++) {
    const s = {
      id: `s${i}`,
      image: i % 3 === 0 ? `img/${i}.jpg` : undefined,
      conversations: [
        {
          from: "human",
          value: `<|image|>\nQuestion number ${i} about ${i % 2 ? "cats" : "dogs"}`,
        },
        { from: "gpt", value: `Answer ${i}. ${"x".repeat(i % 50)}` },
      ],
    };
    fs.writeSync(fd, (i ? "," : "") + JSON.stringify(s));
  }
  fs.writeSync(fd, "]");
  fs.closeSync(fd);
  return file;
}

function dbWithVariant(file: string) {
  const db = openDatabase(":memory:");
  db.exec(`INSERT INTO datapacks (name) VALUES ('p')`);
  db.exec(`INSERT INTO datasets (datapack_id, name) VALUES (1, 'd')`);
  db.prepare(
    `INSERT INTO variants (dataset_id, kind, json_path, n_samples_manifest) VALUES (1, 'longans', ?, ?)`,
  ).run(file, 2500);
  return db;
}

describe("indexVariant", () => {
  it("streams a JSON array into samples and FTS in batches", async () => {
    const file = writeJson(2500);
    const db = dbWithVariant(file);
    const progress: number[] = [];
    const result = await indexVariant(db, 1, {
      batchSize: 400,
      onProgress: (p) => progress.push(p.done),
    });
    expect(result.nSamples).toBe(2500);
    expect(progress.at(-1)).toBe(2500);
    expect(progress.length).toBeGreaterThanOrEqual(6);

    const v = db
      .prepare(`SELECT index_status, n_samples_indexed, file_mtime FROM variants WHERE id = 1`)
      .get() as {
      index_status: string;
      n_samples_indexed: number;
      file_mtime: string;
    };
    expect(v.index_status).toBe("done");
    expect(v.n_samples_indexed).toBe(2500);
    expect(v.file_mtime).toBeTruthy();

    const withImages = (
      db.prepare(`SELECT count(*) c FROM samples WHERE n_images = 1`).get() as { c: number }
    ).c;
    expect(withImages).toBe(834);
    const cats = (
      db.prepare(`SELECT count(*) c FROM samples_fts WHERE samples_fts MATCH '"cats"'`).get() as {
        c: number;
      }
    ).c;
    expect(cats).toBe(1250);

    // Re-indexing replaces rather than duplicates.
    await indexVariant(db, 1, { batchSize: 1000 });
    expect((db.prepare(`SELECT count(*) c FROM samples`).get() as { c: number }).c).toBe(2500);
    expect((db.prepare(`SELECT count(*) c FROM samples_fts`).get() as { c: number }).c).toBe(2500);
  });

  it("records an error for a missing file and supports cancellation", async () => {
    const db = dbWithVariant("/nowhere/missing.json");
    await expect(indexVariant(db, 1)).rejects.toThrow(/찾을 수 없습니다/);

    const file = writeJson(3000);
    const db2 = dbWithVariant(file);
    const controller = new AbortController();
    const run = indexVariant(db2, 1, {
      batchSize: 100,
      signal: controller.signal,
      onProgress: (p) => {
        if (p.done >= 300) controller.abort();
      },
    });
    await expect(run).rejects.toBeInstanceOf(IndexCancelled);
    expect((db2.prepare(`SELECT count(*) c FROM samples`).get() as { c: number }).c).toBe(0);
    expect(
      (
        db2.prepare(`SELECT index_status FROM variants WHERE id = 1`).get() as {
          index_status: string;
        }
      ).index_status,
    ).toBe("none");
  });
});
