import type { DatabaseSync } from "node:sqlite";

import { transaction } from "@/lib/db/client";
import { variantPresent } from "./parse";
import { VARIANT_KINDS, type ManifestRow, type ManifestSheet, type VariantKind } from "./types";

export type VariantConflict = {
  datapack: string;
  dataset: string;
  kind: VariantKind;
  field: "json_path" | "n_samples" | "sft_weight";
  existing: string | number | null;
  incoming: string | number | null;
};

export type SheetPlan = {
  name: string;
  superpackExists: boolean;
  rows: number;
  skippedRows: number;
  datapacks: string[];
  newDatapacks: string[];
  newDatasets: number;
  existingDatasets: number;
  conflicts: VariantConflict[];
  warnings: string[];
};

export type ImportPlan = { sheets: SheetPlan[]; totalConflicts: number };

export type ImportResult = {
  superpacks: number;
  datapacksCreated: number;
  datasetsCreated: number;
  datasetsUpdated: number;
  variantsUpserted: number;
  conflictsOverwritten: number;
  conflictsSkipped: number;
};

type ExistingVariant = {
  id: number;
  json_path: string | null;
  n_samples_manifest: number | null;
  sft_weight: number | null;
};

function findDataset(db: DatabaseSync, datapack: string, dataset: string): number | null {
  const row = db
    .prepare(
      `SELECT d.id FROM datasets d JOIN datapacks p ON p.id = d.datapack_id
       WHERE p.name = ? AND d.name = ?`,
    )
    .get(datapack, dataset) as { id: number } | undefined;
  return row?.id ?? null;
}

function variantConflicts(
  db: DatabaseSync,
  datasetId: number,
  row: ManifestRow,
): VariantConflict[] {
  const conflicts: VariantConflict[] = [];
  for (const kind of VARIANT_KINDS) {
    const incoming = row.variants[kind];
    if (!variantPresent(incoming)) continue;
    const existing = db
      .prepare(
        `SELECT id, json_path, n_samples_manifest, sft_weight FROM variants
         WHERE dataset_id = ? AND kind = ?`,
      )
      .get(datasetId, kind) as ExistingVariant | undefined;
    if (!existing) continue;
    const base = { datapack: row.datapack, dataset: row.dataset, kind };
    if (existing.json_path !== incoming.jsonPath && incoming.jsonPath !== null) {
      conflicts.push({
        ...base,
        field: "json_path",
        existing: existing.json_path,
        incoming: incoming.jsonPath,
      });
    }
    if (existing.n_samples_manifest !== incoming.nSamples && incoming.nSamples !== null) {
      conflicts.push({
        ...base,
        field: "n_samples",
        existing: existing.n_samples_manifest,
        incoming: incoming.nSamples,
      });
    }
    if (existing.sft_weight !== incoming.sftWeight && incoming.sftWeight !== null) {
      conflicts.push({
        ...base,
        field: "sft_weight",
        existing: existing.sft_weight,
        incoming: incoming.sftWeight,
      });
    }
  }
  return conflicts;
}

/** Dry run: what would change, including variant conflicts with data already in the DB. */
export function planImport(db: DatabaseSync, sheets: ManifestSheet[]): ImportPlan {
  const plans: SheetPlan[] = [];
  // Track datasets that earlier sheets in this same file would create, so that a
  // dataset appearing in two sheets is counted as "existing" the second time.
  const seenInFile = new Set<string>();
  const knownDatapacks = new Set(
    (db.prepare("SELECT name FROM datapacks").all() as { name: string }[]).map((r) => r.name),
  );
  for (const sheet of sheets) {
    const superpackExists = Boolean(
      db.prepare("SELECT 1 FROM superpacks WHERE name = ?").get(sheet.name),
    );
    const datapacks = Array.from(new Set(sheet.rows.map((r) => r.datapack)));
    const newDatapacks = datapacks.filter((d) => !knownDatapacks.has(d));
    let newDatasets = 0;
    let existingDatasets = 0;
    const conflicts: VariantConflict[] = [];
    for (const row of sheet.rows) {
      const key = `${row.datapack}\u0000${row.dataset}`;
      const id = findDataset(db, row.datapack, row.dataset);
      if (id === null && !seenInFile.has(key)) newDatasets++;
      else existingDatasets++;
      if (id !== null) conflicts.push(...variantConflicts(db, id, row));
      seenInFile.add(key);
    }
    for (const d of newDatapacks) knownDatapacks.add(d);
    plans.push({
      name: sheet.name,
      superpackExists,
      rows: sheet.rows.length,
      skippedRows: sheet.skippedRows,
      datapacks,
      newDatapacks,
      newDatasets,
      existingDatasets,
      conflicts,
      warnings: sheet.warnings,
    });
  }
  return { sheets: plans, totalConflicts: plans.reduce((n, s) => n + s.conflicts.length, 0) };
}

/**
 * Applies the manifest. Each sheet becomes (or refreshes) a superpack; the sheet is
 * authoritative for that superpack's composition and weights. Dataset descriptive
 * fields are overwritten; variant paths/counts/weights are overwritten only when
 * `overwriteConflicts` is true or there was no existing value.
 */
export function applyImport(
  db: DatabaseSync,
  sheets: ManifestSheet[],
  options: { overwriteConflicts: boolean },
): ImportResult {
  const result: ImportResult = {
    superpacks: 0,
    datapacksCreated: 0,
    datasetsCreated: 0,
    datasetsUpdated: 0,
    variantsUpserted: 0,
    conflictsOverwritten: 0,
    conflictsSkipped: 0,
  };

  const upsertSuperpack = db.prepare(
    `INSERT INTO superpacks (name, source) VALUES (?, 'excel')
     ON CONFLICT(name) DO UPDATE SET updated_at = datetime('now')
     RETURNING id`,
  );
  const insertDatapack = db.prepare(
    `INSERT INTO datapacks (name) VALUES (?) ON CONFLICT(name) DO NOTHING`,
  );
  const selectDatapack = db.prepare(`SELECT id FROM datapacks WHERE name = ?`);
  const insertDataset = db.prepare(
    `INSERT INTO datasets (datapack_id, name, category, sub_category, language, origin_json, note, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'excel') RETURNING id`,
  );
  const updateDataset = db.prepare(
    `UPDATE datasets SET category = ?, sub_category = ?, language = ?, origin_json = ?, note = ?,
       updated_at = datetime('now') WHERE id = ?`,
  );
  const selectVariant = db.prepare(
    `SELECT id, json_path, n_samples_manifest, sft_weight FROM variants WHERE dataset_id = ? AND kind = ?`,
  );
  const insertVariant = db.prepare(
    `INSERT INTO variants (dataset_id, kind, json_path, n_samples_manifest, sft_weight) VALUES (?, ?, ?, ?, ?)`,
  );
  const updateVariant = db.prepare(
    `UPDATE variants SET json_path = ?, n_samples_manifest = ?, sft_weight = ?,
       index_status = CASE WHEN json_path IS NOT ? THEN 'none' ELSE index_status END,
       n_samples_indexed = CASE WHEN json_path IS NOT ? THEN 0 ELSE n_samples_indexed END
     WHERE id = ?`,
  );
  const clearMembership = db.prepare(`DELETE FROM superpack_datapacks WHERE superpack_id = ?`);
  const clearWeights = db.prepare(`DELETE FROM superpack_dataset_weights WHERE superpack_id = ?`);
  const insertMembership = db.prepare(
    `INSERT OR IGNORE INTO superpack_datapacks (superpack_id, datapack_id, position) VALUES (?, ?, ?)`,
  );
  const insertWeights = db.prepare(
    `INSERT OR REPLACE INTO superpack_dataset_weights
       (superpack_id, dataset_id, mx_weight_1, mx_weight_2, n_total, n_training, n_mx1, n_mx2)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  transaction(db, () => {
    for (const sheet of sheets) {
      if (sheet.rows.length === 0) continue;
      const { id: superpackId } = upsertSuperpack.get(sheet.name) as { id: number };
      result.superpacks++;
      clearMembership.run(superpackId);
      clearWeights.run(superpackId);

      const datapackPosition = new Map<number, number>();
      for (const row of sheet.rows) {
        const inserted = insertDatapack.run(row.datapack);
        if (inserted.changes > 0) result.datapacksCreated++;
        const { id: datapackId } = selectDatapack.get(row.datapack) as { id: number };
        if (!datapackPosition.has(datapackId)) {
          datapackPosition.set(datapackId, datapackPosition.size);
          insertMembership.run(superpackId, datapackId, datapackPosition.size - 1);
        }

        let datasetId = findDataset(db, row.datapack, row.dataset);
        if (datasetId === null) {
          const created = insertDataset.get(
            datapackId,
            row.dataset,
            row.category,
            row.subCategory,
            row.language,
            row.originJson,
            row.note,
          ) as { id: number };
          datasetId = created.id;
          result.datasetsCreated++;
        } else {
          updateDataset.run(
            row.category,
            row.subCategory,
            row.language,
            row.originJson,
            row.note,
            datasetId,
          );
          result.datasetsUpdated++;
        }

        for (const kind of VARIANT_KINDS) {
          const incoming = row.variants[kind];
          if (!variantPresent(incoming)) continue;
          const existing = selectVariant.get(datasetId, kind) as ExistingVariant | undefined;
          if (!existing) {
            insertVariant.run(
              datasetId,
              kind,
              incoming.jsonPath,
              incoming.nSamples,
              incoming.sftWeight,
            );
            result.variantsUpserted++;
            continue;
          }
          const differs =
            (incoming.jsonPath !== null && existing.json_path !== incoming.jsonPath) ||
            (incoming.nSamples !== null && existing.n_samples_manifest !== incoming.nSamples) ||
            (incoming.sftWeight !== null && existing.sft_weight !== incoming.sftWeight);
          if (differs && !options.overwriteConflicts) {
            result.conflictsSkipped++;
            continue;
          }
          if (differs) result.conflictsOverwritten++;
          const jsonPath = incoming.jsonPath ?? existing.json_path;
          updateVariant.run(
            jsonPath,
            incoming.nSamples ?? existing.n_samples_manifest,
            incoming.sftWeight ?? existing.sft_weight,
            jsonPath,
            jsonPath,
            existing.id,
          );
          result.variantsUpserted++;
        }

        insertWeights.run(
          superpackId,
          datasetId,
          row.mxWeight1,
          row.mxWeight2,
          row.nTotal,
          row.nTraining,
          row.nMx1,
          row.nMx2,
        );
      }
    }
  });
  return result;
}
