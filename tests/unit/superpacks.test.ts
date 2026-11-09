import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { openDatabase } from "@/lib/db/client";
import { applyImport } from "@/lib/manifest/import";
import { parseManifest } from "@/lib/manifest/parse";
import { listDatapacks } from "@/lib/queries/datapacks";
import {
  createSuperpack,
  deleteSuperpack,
  duplicateSuperpack,
  getSuperpack,
  setSuperpackDatapacks,
  updateWeights,
} from "@/lib/queries/superpacks";
import { superpackRows, superpackToJson, superpackToXlsx } from "@/lib/superpack/export";

const FIXTURE = path.resolve(__dirname, "../../data/samples/manifest_example.tsv");

async function seeded() {
  const db = openDatabase(":memory:");
  const parsed = await parseManifest(fs.readFileSync(FIXTURE), "manifest_example.tsv");
  applyImport(db, parsed.sheets, { overwriteConflicts: false });
  // A second datapack so composition has something to choose from.
  db.exec(`INSERT INTO datapacks (name) VALUES ('extra')`);
  db.exec(
    `INSERT INTO datasets (datapack_id, name, category) VALUES ((SELECT id FROM datapacks WHERE name='extra'), 'extra_ds', 'Math')`,
  );
  db.exec(
    `INSERT INTO variants (dataset_id, kind, json_path, n_samples_manifest, sft_weight)
     VALUES ((SELECT id FROM datasets WHERE name='extra_ds'), 'longer', '/v/extra.json', 1000, 1)`,
  );
  return db;
}

describe("superpack composition", () => {
  it("creates a user superpack from datapacks with default weights and derived totals", async () => {
    const db = await seeded();
    const packs = listDatapacks(db);
    const base = packs.find((p) => p.name === "base")!;
    const extra = packs.find((p) => p.name === "extra")!;

    const id = createSuperpack(db, { name: "mix_user", datapackIds: [extra.id, base.id] });
    const sp = getSuperpack(db, id)!;
    expect(sp.source).toBe("user");
    expect(sp.datapacks.map((p) => p.name)).toEqual(["extra", "base"]);
    expect(sp.datasets).toHaveLength(5);
    expect(sp.datasets.every((d) => d.mxWeight1 === 1 && d.mxWeight2 === 1)).toBe(true);
    expect(sp.totals.nSamples).toBe(308578 + 1000);
    expect(sp.totals.nMx1).toBe(308578 + 1000);

    // Weights change the derived MX totals.
    const lvis = sp.datasets.find((d) => d.name === "LVIS (OCR)")!;
    updateWeights(db, id, [{ datasetId: lvis.id, mxWeight1: 0.5, mxWeight2: 0 }]);
    const after = getSuperpack(db, id)!;
    expect(after.totals.nMx1).toBe(308578 + 1000 - 218296 / 2);
    expect(after.totals.nMx2).toBe(308578 + 1000 - 218296);

    // Removing a datapack drops its datasets' weights; re-adding restores defaults.
    setSuperpackDatapacks(db, id, [base.id]);
    expect(getSuperpack(db, id)!.datasets).toHaveLength(4);
    setSuperpackDatapacks(db, id, [base.id, extra.id]);
    expect(getSuperpack(db, id)!.datasets).toHaveLength(5);

    // Duplicate keeps weights; delete removes everything.
    const copyId = duplicateSuperpack(db, id, "mix_user_copy");
    const copy = getSuperpack(db, copyId)!;
    expect(copy.datasets.find((d) => d.name === "LVIS (OCR)")!.mxWeight1).toBe(0.5);
    deleteSuperpack(db, copyId);
    expect(getSuperpack(db, copyId)).toBeNull();
    expect(
      (
        db
          .prepare(`SELECT count(*) c FROM superpack_dataset_weights WHERE superpack_id = ?`)
          .get(copyId) as { c: number }
      ).c,
    ).toBe(0);
  });

  it("rejects duplicate names", async () => {
    const db = await seeded();
    const base = listDatapacks(db).find((p) => p.name === "base")!;
    createSuperpack(db, { name: "dup", datapackIds: [base.id] });
    expect(() => createSuperpack(db, { name: "dup", datapackIds: [base.id] })).toThrow(/이미/);
  });
});

describe("superpack export", () => {
  it("round-trips through xlsx with the manifest header", async () => {
    const db = await seeded();
    const base = listDatapacks(db).find((p) => p.name === "base")!;
    const id = createSuperpack(db, { name: "export_me", datapackIds: [base.id] });
    const sp = getSuperpack(db, id)!;

    const rows = superpackRows(sp);
    expect(rows).toHaveLength(4);
    const json = superpackToJson(sp);
    expect(json.datasets.find((d) => d.dataset === "LVIS (OCR)")!.variants.longans.n_samples).toBe(
      145626,
    );

    const xlsx = await superpackToXlsx(sp, new Map());
    const reparsed = await parseManifest(xlsx, "export_me.xlsx");
    expect(reparsed.sheets[0].name).toBe("export_me");
    expect(reparsed.sheets[0].rows).toHaveLength(4);
    expect(reparsed.sheets[0].warnings).toEqual([]);
    const lvis = reparsed.sheets[0].rows.find((r) => r.dataset === "LVIS (OCR)")!;
    expect(lvis.variants.longans.nSamples).toBe(145626);
    expect(lvis.mxWeight1).toBe(1);
    expect(lvis.nTotal).toBe(218296);
  });
});
