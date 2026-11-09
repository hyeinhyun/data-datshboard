import type { DatabaseSync } from "node:sqlite";

import { all, get } from "@/lib/db/client";
import type { VariantKind } from "@/lib/manifest/types";
import type { VariantInfo } from "./overview";
import { tagsFor, type Tag } from "./tags";

export type SuperpackWeight = {
  superpackId: number;
  superpack: string;
  mxWeight1: number | null;
  mxWeight2: number | null;
  nTotal: number | null;
  nTraining: number | null;
  nMx1: number | null;
  nMx2: number | null;
};

export type DatasetDetail = {
  id: number;
  name: string;
  datapackId: number;
  datapack: string;
  category: string | null;
  subCategory: string | null;
  language: string | null;
  originJson: string | null;
  note: string | null;
  source: string;
  hfRepo: string | null;
  createdAt: string;
  updatedAt: string;
  variants: (VariantInfo & {
    indexedAt: string | null;
    indexError: string | null;
    fileMtime: string | null;
  })[];
  superpacks: SuperpackWeight[];
  tags: Tag[];
  datapackTags: Tag[];
};

export function getDataset(db: DatabaseSync, id: number): DatasetDetail | null {
  const row = get<Omit<DatasetDetail, "variants" | "superpacks" | "tags" | "datapackTags">>(
    db,
    `SELECT d.id, d.name, d.datapack_id AS datapackId, p.name AS datapack, d.category,
            d.sub_category AS subCategory, d.language, d.origin_json AS originJson, d.note, d.source,
            d.hf_repo AS hfRepo, d.created_at AS createdAt, d.updated_at AS updatedAt
     FROM datasets d JOIN datapacks p ON p.id = d.datapack_id WHERE d.id = ?`,
    id,
  );
  if (!row) return null;
  const variants = all<DatasetDetail["variants"][number]>(
    db,
    `SELECT id, kind, json_path AS jsonPath, n_samples_manifest AS nSamples, sft_weight AS sftWeight,
            index_status AS indexStatus, n_samples_indexed AS nIndexed, indexed_at AS indexedAt,
            index_error AS indexError, file_mtime AS fileMtime
     FROM variants WHERE dataset_id = ?
     ORDER BY CASE kind WHEN 'longer' THEN 0 WHEN 'longans' THEN 1 WHEN 'shortans' THEN 2 ELSE 3 END`,
    id,
  );
  const superpacks = all<SuperpackWeight>(
    db,
    `SELECT w.superpack_id AS superpackId, s.name AS superpack, w.mx_weight_1 AS mxWeight1,
            w.mx_weight_2 AS mxWeight2, w.n_total AS nTotal, w.n_training AS nTraining,
            w.n_mx1 AS nMx1, w.n_mx2 AS nMx2
     FROM superpack_dataset_weights w JOIN superpacks s ON s.id = w.superpack_id
     WHERE w.dataset_id = ? ORDER BY s.name`,
    id,
  );
  return {
    ...row,
    variants,
    superpacks,
    tags: tagsFor(db, "dataset", id),
    datapackTags: tagsFor(db, "datapack", row.datapackId),
  };
}

export type VariantRef = {
  id: number;
  datasetId: number;
  dataset: string;
  datapack: string;
  kind: VariantKind | "default";
  jsonPath: string | null;
  indexStatus: string;
  nIndexed: number;
  nSamples: number | null;
};

export function getVariant(db: DatabaseSync, variantId: number): VariantRef | null {
  return (
    get<VariantRef>(
      db,
      `SELECT v.id, v.dataset_id AS datasetId, d.name AS dataset, p.name AS datapack, v.kind,
              v.json_path AS jsonPath, v.index_status AS indexStatus, v.n_samples_indexed AS nIndexed,
              v.n_samples_manifest AS nSamples
       FROM variants v JOIN datasets d ON d.id = v.dataset_id JOIN datapacks p ON p.id = d.datapack_id
       WHERE v.id = ?`,
      variantId,
    ) ?? null
  );
}

/** Variants that have indexed samples, for the sample explorer's picker. */
export function listVariants(db: DatabaseSync, onlyIndexed = false): VariantRef[] {
  return all<VariantRef>(
    db,
    `SELECT v.id, v.dataset_id AS datasetId, d.name AS dataset, p.name AS datapack, v.kind,
            v.json_path AS jsonPath, v.index_status AS indexStatus, v.n_samples_indexed AS nIndexed,
            v.n_samples_manifest AS nSamples
     FROM variants v JOIN datasets d ON d.id = v.dataset_id JOIN datapacks p ON p.id = d.datapack_id
     ${onlyIndexed ? "WHERE v.n_samples_indexed > 0" : ""}
     ORDER BY p.name, d.name, CASE v.kind WHEN 'longer' THEN 0 WHEN 'longans' THEN 1 WHEN 'shortans' THEN 2 ELSE 3 END`,
  );
}
