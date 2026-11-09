import type { DatabaseSync } from "node:sqlite";

import { all, get } from "@/lib/db/client";
import { listDatasetRows, type DatasetRow } from "./overview";
import { tagsFor, type Tag } from "./tags";

export type SuperpackRef = { id: number; name: string; source: "excel" | "user" };

export type DatapackSummary = {
  id: number;
  name: string;
  description: string | null;
  nDatasets: number;
  nSamples: number;
  superpacks: SuperpackRef[];
  tags: Tag[];
};

export type DatapackDetail = DatapackSummary & { datasets: DatasetRow[] };

function superpacksOf(db: DatabaseSync, datapackId: number): SuperpackRef[] {
  return all<SuperpackRef>(
    db,
    `SELECT s.id, s.name, s.source FROM superpack_datapacks m JOIN superpacks s ON s.id = m.superpack_id
     WHERE m.datapack_id = ? ORDER BY s.name`,
    datapackId,
  );
}

export function listDatapacks(db: DatabaseSync): DatapackSummary[] {
  const rows = all<Omit<DatapackSummary, "superpacks" | "tags">>(
    db,
    `SELECT p.id, p.name, p.description,
            (SELECT count(*) FROM datasets d WHERE d.datapack_id = p.id) AS nDatasets,
            COALESCE((SELECT sum(v.n_samples_manifest) FROM datasets d JOIN variants v ON v.dataset_id = d.id
                      WHERE d.datapack_id = p.id), 0) AS nSamples
     FROM datapacks p ORDER BY p.name`,
  );
  return rows.map((r) => ({
    ...r,
    superpacks: superpacksOf(db, r.id),
    tags: tagsFor(db, "datapack", r.id),
  }));
}

export function getDatapack(db: DatabaseSync, id: number): DatapackDetail | null {
  const row = get<Omit<DatapackSummary, "superpacks" | "tags">>(
    db,
    `SELECT p.id, p.name, p.description,
            (SELECT count(*) FROM datasets d WHERE d.datapack_id = p.id) AS nDatasets,
            COALESCE((SELECT sum(v.n_samples_manifest) FROM datasets d JOIN variants v ON v.dataset_id = d.id
                      WHERE d.datapack_id = p.id), 0) AS nSamples
     FROM datapacks p WHERE p.id = ?`,
    id,
  );
  if (!row) return null;
  return {
    ...row,
    superpacks: superpacksOf(db, id),
    tags: tagsFor(db, "datapack", id),
    datasets: listDatasetRows(db, null).filter((d) => d.datapackId === id),
  };
}

export function createDatapack(
  db: DatabaseSync,
  name: string,
  description?: string | null,
): number {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Datapack 이름이 비어 있습니다.");
  const row = get<{ id: number }>(
    db,
    `INSERT INTO datapacks (name, description) VALUES (?, ?)
     ON CONFLICT(name) DO UPDATE SET description = COALESCE(excluded.description, datapacks.description)
     RETURNING id`,
    trimmed,
    description ?? null,
  )!;
  return row.id;
}
