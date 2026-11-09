// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { openDatabase } from "@/lib/db/client";
import { indexVariant } from "@/lib/indexer/index-variant";
import {
  getSample,
  listSamples,
  randomSampleId,
  sampleNeighbors,
  sampleStats,
} from "@/lib/queries/samples";

function seed() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sft-samples-"));
  const mk = (kind: string, n: number) => {
    const file = path.join(dir, `${kind}.json`);
    const rows = Array.from({ length: n }, (_, i) => ({
      id: `s${i}`,
      image: i % 2 === 0 ? `img/${i}.jpg` : undefined,
      conversations: [
        { from: "human", value: `<|image|>\nIs this a ${i % 3 === 0 ? "cat" : "dog"} picture?` },
        { from: "gpt", value: kind === "shortans" ? "Yes." : `Yes, it is. \\boxed{${i}}` },
        ...(kind === "longans" && i % 5 === 0
          ? [
              { from: "human", value: "Why?" },
              { from: "gpt", value: "Because." },
            ]
          : []),
      ],
      meta: { category: i % 3 === 0 ? "cat" : "dog" },
    }));
    fs.writeFileSync(file, JSON.stringify(rows));
    return file;
  };
  const db = openDatabase(":memory:");
  db.exec(`INSERT INTO datapacks (name) VALUES ('p')`);
  db.exec(`INSERT INTO datasets (datapack_id, name) VALUES (1, 'd')`);
  db.prepare(`INSERT INTO variants (dataset_id, kind, json_path) VALUES (1, 'longans', ?)`).run(
    mk("longans", 40),
  );
  db.prepare(`INSERT INTO variants (dataset_id, kind, json_path) VALUES (1, 'shortans', ?)`).run(
    mk("shortans", 40),
  );
  return db;
}

describe("sample queries", () => {
  it("lists, filters, pages, finds neighbours and siblings", async () => {
    const db = seed();
    await indexVariant(db, 1);
    await indexVariant(db, 2);

    const page1 = listSamples(db, { variantId: 1 }, 1, 15);
    expect(page1.total).toBe(40);
    expect(page1.items).toHaveLength(15);
    expect(page1.items[0].imagePaths).toEqual(["img/0.jpg"]);

    const cats = listSamples(db, { variantId: 1, q: "cat" });
    expect(cats.total).toBe(14);
    const noImg = listSamples(db, { variantId: 1, hasImage: false });
    expect(noImg.total).toBe(20);
    const multi = listSamples(db, { variantId: 1, minTurns: 2 });
    expect(multi.total).toBe(8);

    const first = page1.items[0];
    const detail = getSample(db, first.id)!;
    // i = 0 is a multiple of 5, so the longans variant has a follow-up turn.
    expect(detail.conversations).toHaveLength(4);
    expect(detail.nTurns).toBe(2);
    expect(detail.meta).toEqual({ category: "cat" });
    expect(detail.siblings).toEqual([{ variantId: 2, kind: "shortans", sampleRowId: 41 }]);

    const nb = sampleNeighbors(db, page1.items[1].id, { variantId: 1 });
    expect(nb.prevId).toBe(page1.items[0].id);
    expect(nb.nextId).toBe(page1.items[2].id);
    expect(nb.position).toBe(2);

    const rnd = randomSampleId(db, { variantId: 2, q: "dog" });
    expect(rnd).not.toBeNull();
    expect(getSample(db, rnd!)!.kind).toBe("shortans");

    const stats = sampleStats(db, { variantId: 1 });
    expect(stats.total).toBe(40);
    expect(stats.withImages).toBe(20);
    expect(stats.avgTurns).toBeCloseTo(1.2, 5);
  });
});
