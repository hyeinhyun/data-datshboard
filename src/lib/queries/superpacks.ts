import type { DatabaseSync } from "node:sqlite";

import { all, get, transaction } from "@/lib/db/client";
import { variantSamples, type DatasetRow, type SuperpackSummary } from "@/lib/domain";
import { listDatasetRows } from "./overview";

export type SuperpackDatapack = {
  id: number;
  name: string;
  position: number;
  nDatasets: number;
  nSamples: number;
};

export type SuperpackDetail = SuperpackSummary & {
  createdAt: string;
  datapacks: SuperpackDatapack[];
  datasets: DatasetRow[];
  totals: { nSamples: number; nMx1: number; nMx2: number };
};

/** Aggregates for one dataset row inside a superpack: manifest values win, else derived from weights. */
export function datasetAggregates(d: DatasetRow) {
  const total = variantSamples(d);
  const nTotal = d.nTotal ?? total;
  const nTraining = d.nTraining ?? nTotal;
  const nMx1 = d.nMx1 ?? Math.round(nTotal * (d.mxWeight1 ?? 1));
  const nMx2 = d.nMx2 ?? Math.round(nTotal * (d.mxWeight2 ?? 1));
  return { nTotal, nTraining, nMx1, nMx2 };
}

export function getSuperpack(db: DatabaseSync, id: number): SuperpackDetail | null {
  const row = get<SuperpackSummary & { createdAt: string }>(
    db,
    `SELECT s.id, s.name, s.source, s.description, s.created_at AS createdAt, s.updated_at AS updatedAt,
            (SELECT count(*) FROM superpack_datapacks m WHERE m.superpack_id = s.id) AS nDatapacks,
            (SELECT count(*) FROM superpack_dataset_weights w WHERE w.superpack_id = s.id) AS nDatasets,
            0 AS nSamples
     FROM superpacks s WHERE s.id = ?`,
    id,
  );
  if (!row) return null;
  const datapacks = all<SuperpackDatapack>(
    db,
    `SELECT p.id, p.name, m.position,
            (SELECT count(*) FROM datasets d WHERE d.datapack_id = p.id) AS nDatasets,
            COALESCE((SELECT sum(v.n_samples_manifest) FROM datasets d JOIN variants v ON v.dataset_id = d.id
                      WHERE d.datapack_id = p.id), 0) AS nSamples
     FROM superpack_datapacks m JOIN datapacks p ON p.id = m.datapack_id
     WHERE m.superpack_id = ? ORDER BY m.position, p.name`,
    id,
  );
  const datasets = listDatasetRows(db, id);
  const totals = datasets.reduce(
    (acc, d) => {
      const a = datasetAggregates(d);
      acc.nSamples += a.nTotal;
      acc.nMx1 += a.nMx1;
      acc.nMx2 += a.nMx2;
      return acc;
    },
    { nSamples: 0, nMx1: 0, nMx2: 0 },
  );
  return { ...row, nSamples: totals.nSamples, datapacks, datasets, totals };
}

function datasetIdsOf(db: DatabaseSync, datapackIds: number[]): number[] {
  if (datapackIds.length === 0) return [];
  const placeholders = datapackIds.map(() => "?").join(",");
  return all<{ id: number }>(
    db,
    `SELECT id FROM datasets WHERE datapack_id IN (${placeholders})`,
    ...datapackIds,
  ).map((r) => r.id);
}

/**
 * Makes the superpack consist of exactly `datapackIds` (in that order). Datasets of
 * newly added datapacks get weight rows (default 1 / 1, or copied from `copyFrom`);
 * datasets of removed datapacks lose theirs.
 */
export function setSuperpackDatapacks(
  db: DatabaseSync,
  superpackId: number,
  datapackIds: number[],
  copyFrom?: number | null,
): void {
  transaction(db, () => {
    const current = all<{ datapack_id: number }>(
      db,
      `SELECT datapack_id FROM superpack_datapacks WHERE superpack_id = ?`,
      superpackId,
    ).map((r) => r.datapack_id);
    const removed = current.filter((d) => !datapackIds.includes(d));
    const removedDatasets = datasetIdsOf(db, removed);
    for (const dsId of removedDatasets) {
      db.prepare(
        `DELETE FROM superpack_dataset_weights WHERE superpack_id = ? AND dataset_id = ?`,
      ).run(superpackId, dsId);
    }
    db.prepare(`DELETE FROM superpack_datapacks WHERE superpack_id = ?`).run(superpackId);
    datapackIds.forEach((dpId, position) => {
      db.prepare(
        `INSERT INTO superpack_datapacks (superpack_id, datapack_id, position) VALUES (?, ?, ?)`,
      ).run(superpackId, dpId, position);
    });
    const insertWeight = db.prepare(
      `INSERT OR IGNORE INTO superpack_dataset_weights (superpack_id, dataset_id, mx_weight_1, mx_weight_2)
       VALUES (?, ?, COALESCE((SELECT mx_weight_1 FROM superpack_dataset_weights WHERE superpack_id = ? AND dataset_id = ?), 1),
                     COALESCE((SELECT mx_weight_2 FROM superpack_dataset_weights WHERE superpack_id = ? AND dataset_id = ?), 1))`,
    );
    for (const dsId of datasetIdsOf(db, datapackIds)) {
      insertWeight.run(superpackId, dsId, copyFrom ?? -1, dsId, copyFrom ?? -1, dsId);
    }
    db.prepare(`UPDATE superpacks SET updated_at = datetime('now') WHERE id = ?`).run(superpackId);
  });
}

export function createSuperpack(
  db: DatabaseSync,
  input: {
    name: string;
    description?: string | null;
    datapackIds: number[];
    copyFrom?: number | null;
  },
): number {
  const name = input.name.trim();
  if (!name) throw new Error("Superpack 이름이 비어 있습니다.");
  return transaction(db, () => {
    const exists = get<{ id: number }>(db, `SELECT id FROM superpacks WHERE name = ?`, name);
    if (exists) throw new Error(`이미 "${name}" Superpack이 있습니다.`);
    const row = get<{ id: number }>(
      db,
      `INSERT INTO superpacks (name, source, description) VALUES (?, 'user', ?) RETURNING id`,
      name,
      input.description ?? null,
    )!;
    setSuperpackDatapacks(db, row.id, input.datapackIds, input.copyFrom ?? null);
    return row.id;
  });
}

export function updateSuperpackMeta(
  db: DatabaseSync,
  id: number,
  patch: { name?: string; description?: string | null },
): void {
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error("Superpack 이름이 비어 있습니다.");
    const clash = get<{ id: number }>(
      db,
      `SELECT id FROM superpacks WHERE name = ? AND id != ?`,
      name,
      id,
    );
    if (clash) throw new Error(`이미 "${name}" Superpack이 있습니다.`);
    db.prepare(`UPDATE superpacks SET name = ?, updated_at = datetime('now') WHERE id = ?`).run(
      name,
      id,
    );
  }
  if (patch.description !== undefined) {
    db.prepare(
      `UPDATE superpacks SET description = ?, updated_at = datetime('now') WHERE id = ?`,
    ).run(patch.description, id);
  }
}

export type WeightPatch = { datasetId: number; mxWeight1: number | null; mxWeight2: number | null };

/** Sets mix weights; derived aggregate columns are cleared so they are recomputed from the weights. */
export function updateWeights(db: DatabaseSync, superpackId: number, patches: WeightPatch[]): void {
  transaction(db, () => {
    const stmt = db.prepare(
      `UPDATE superpack_dataset_weights SET mx_weight_1 = ?, mx_weight_2 = ?, n_mx1 = NULL, n_mx2 = NULL
       WHERE superpack_id = ? AND dataset_id = ?`,
    );
    for (const p of patches) stmt.run(p.mxWeight1, p.mxWeight2, superpackId, p.datasetId);
    db.prepare(`UPDATE superpacks SET updated_at = datetime('now') WHERE id = ?`).run(superpackId);
  });
}

export function duplicateSuperpack(db: DatabaseSync, id: number, newName: string): number {
  const name = newName.trim();
  if (!name) throw new Error("새 이름이 비어 있습니다.");
  return transaction(db, () => {
    const src = get<{ description: string | null }>(
      db,
      `SELECT description FROM superpacks WHERE id = ?`,
      id,
    );
    if (!src) throw new Error("원본 Superpack을 찾을 수 없습니다.");
    const clash = get<{ id: number }>(db, `SELECT id FROM superpacks WHERE name = ?`, name);
    if (clash) throw new Error(`이미 "${name}" Superpack이 있습니다.`);
    const row = get<{ id: number }>(
      db,
      `INSERT INTO superpacks (name, source, description) VALUES (?, 'user', ?) RETURNING id`,
      name,
      src.description,
    )!;
    db.prepare(
      `INSERT INTO superpack_datapacks (superpack_id, datapack_id, position)
       SELECT ?, datapack_id, position FROM superpack_datapacks WHERE superpack_id = ?`,
    ).run(row.id, id);
    db.prepare(
      `INSERT INTO superpack_dataset_weights
         (superpack_id, dataset_id, mx_weight_1, mx_weight_2, n_total, n_training, n_mx1, n_mx2)
       SELECT ?, dataset_id, mx_weight_1, mx_weight_2, n_total, n_training, n_mx1, n_mx2
       FROM superpack_dataset_weights WHERE superpack_id = ?`,
    ).run(row.id, id);
    return row.id;
  });
}

export function deleteSuperpack(db: DatabaseSync, id: number): void {
  db.prepare(`DELETE FROM superpacks WHERE id = ?`).run(id);
}
