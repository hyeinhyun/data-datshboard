import type { DatabaseSync } from "node:sqlite";

import { all } from "@/lib/db/client";
import { VARIANT_KINDS, type VariantKind } from "@/lib/manifest/types";

export type SuperpackSummary = {
  id: number;
  name: string;
  source: "excel" | "user";
  description: string | null;
  updatedAt: string;
  nDatapacks: number;
  nDatasets: number;
  nSamples: number;
};

export type VariantInfo = {
  id: number;
  kind: VariantKind | "default";
  jsonPath: string | null;
  nSamples: number | null;
  sftWeight: number | null;
  indexStatus: string;
  nIndexed: number;
};

export type DatasetRow = {
  id: number;
  name: string;
  datapackId: number;
  datapack: string;
  category: string | null;
  subCategory: string | null;
  language: string | null;
  note: string | null;
  source: string;
  variants: VariantInfo[];
  tags: string[];
  /** Per-superpack values; null when no superpack is selected. */
  mxWeight1: number | null;
  mxWeight2: number | null;
  nTotal: number | null;
  nTraining: number | null;
  nMx1: number | null;
  nMx2: number | null;
};

export type OverviewFilters = {
  superpackId: number | null;
  datapack?: string[];
  category?: string[];
  subCategory?: string[];
  language?: string[];
  variant?: VariantKind[];
  tag?: string[];
};

export type Overview = {
  datasets: DatasetRow[];
  kpis: {
    nDatapacks: number;
    nDatasets: number;
    nSamples: number;
    nTraining: number;
    nMx1: number;
    nMx2: number;
  };
  byCategory: {
    category: string;
    longer: number;
    longans: number;
    shortans: number;
    default: number;
  }[];
  byDatapack: { datapack: string; nSamples: number; nDatasets: number }[];
  byLanguage: { language: string; nSamples: number }[];
  options: {
    datapacks: string[];
    categories: string[];
    subCategories: string[];
    languages: string[];
    tags: string[];
  };
};

export function listSuperpacks(db: DatabaseSync): SuperpackSummary[] {
  return all<SuperpackSummary>(
    db,
    `SELECT s.id, s.name, s.source, s.description, s.updated_at AS updatedAt,
            (SELECT count(*) FROM superpack_datapacks m WHERE m.superpack_id = s.id) AS nDatapacks,
            (SELECT count(*) FROM superpack_dataset_weights w WHERE w.superpack_id = s.id) AS nDatasets,
            COALESCE((SELECT sum(v.n_samples_manifest) FROM superpack_dataset_weights w
                      JOIN variants v ON v.dataset_id = w.dataset_id WHERE w.superpack_id = s.id), 0) AS nSamples
     FROM superpacks s ORDER BY s.name`,
  );
}

type RawDataset = {
  id: number;
  name: string;
  datapackId: number;
  datapack: string;
  category: string | null;
  subCategory: string | null;
  language: string | null;
  note: string | null;
  source: string;
  variants: string;
  tags: string;
  mxWeight1: number | null;
  mxWeight2: number | null;
  nTotal: number | null;
  nTraining: number | null;
  nMx1: number | null;
  nMx2: number | null;
};

/** Datasets with their variants, tags (own + datapack's) and, for a superpack, its weights. */
export function listDatasetRows(db: DatabaseSync, superpackId: number | null): DatasetRow[] {
  const variantsSql = `(SELECT json_group_array(json_object(
        'id', v.id, 'kind', v.kind, 'jsonPath', v.json_path, 'nSamples', v.n_samples_manifest,
        'sftWeight', v.sft_weight, 'indexStatus', v.index_status, 'nIndexed', v.n_samples_indexed))
      FROM variants v WHERE v.dataset_id = d.id)`;
  const tagsSql = `(SELECT json_group_array(DISTINCT t.name) FROM taggings g JOIN tags t ON t.id = g.tag_id
      WHERE (g.target_type = 'dataset' AND g.target_id = d.id)
         OR (g.target_type = 'datapack' AND g.target_id = d.datapack_id))`;
  const base = `SELECT d.id, d.name, d.datapack_id AS datapackId, p.name AS datapack, d.category,
       d.sub_category AS subCategory, d.language, d.note, d.source,
       ${variantsSql} AS variants, ${tagsSql} AS tags`;
  const rows = (
    superpackId === null
      ? db
          .prepare(
            `${base}, NULL AS mxWeight1, NULL AS mxWeight2, NULL AS nTotal, NULL AS nTraining, NULL AS nMx1, NULL AS nMx2
             FROM datasets d JOIN datapacks p ON p.id = d.datapack_id ORDER BY p.name, d.name`,
          )
          .all()
      : db
          .prepare(
            `${base}, w.mx_weight_1 AS mxWeight1, w.mx_weight_2 AS mxWeight2, w.n_total AS nTotal,
                    w.n_training AS nTraining, w.n_mx1 AS nMx1, w.n_mx2 AS nMx2
             FROM superpack_dataset_weights w
             JOIN datasets d ON d.id = w.dataset_id JOIN datapacks p ON p.id = d.datapack_id
             WHERE w.superpack_id = ? ORDER BY p.name, d.name`,
          )
          .all(superpackId)
  ) as RawDataset[];
  return rows.map((r) => ({
    ...r,
    variants: JSON.parse(r.variants) as VariantInfo[],
    tags: (JSON.parse(r.tags) as (string | null)[]).filter((t): t is string => Boolean(t)),
  }));
}

export function variantSamples(d: DatasetRow, kinds?: VariantKind[]): number {
  return d.variants
    .filter((v) => !kinds || kinds.length === 0 || (kinds as string[]).includes(v.kind))
    .reduce((n, v) => n + (v.nSamples ?? 0), 0);
}

function applyFilters(rows: DatasetRow[], f: OverviewFilters): DatasetRow[] {
  const has = (list: string[] | undefined, value: string | null) =>
    !list || list.length === 0 || (value !== null && list.includes(value));
  return rows.filter(
    (d) =>
      has(f.datapack, d.datapack) &&
      has(f.category, d.category) &&
      has(f.subCategory, d.subCategory) &&
      has(f.language, d.language) &&
      (!f.tag || f.tag.length === 0 || d.tags.some((t) => f.tag!.includes(t))) &&
      (!f.variant ||
        f.variant.length === 0 ||
        d.variants.some((v) => (f.variant as string[]).includes(v.kind))),
  );
}

export function getOverview(db: DatabaseSync, filters: OverviewFilters): Overview {
  const all = listDatasetRows(db, filters.superpackId);
  const datasets = applyFilters(all, filters);
  const kinds = filters.variant;

  const kpis = {
    nDatapacks: 0,
    nDatasets: datasets.length,
    nSamples: 0,
    nTraining: 0,
    nMx1: 0,
    nMx2: 0,
  };
  const datapackSet = new Set<string>();
  const byCategory = new Map<string, Record<VariantKind | "default", number>>();
  const byDatapack = new Map<string, { nSamples: number; nDatasets: number }>();
  const byLanguage = new Map<string, number>();

  for (const d of datasets) {
    datapackSet.add(d.datapack);
    const total = variantSamples(d, kinds);
    kpis.nSamples += total;
    kpis.nTraining += d.nTraining ?? total;
    kpis.nMx1 += d.nMx1 ?? (d.mxWeight1 !== null ? Math.round(total * d.mxWeight1) : total);
    kpis.nMx2 += d.nMx2 ?? (d.mxWeight2 !== null ? Math.round(total * d.mxWeight2) : total);

    const cat = d.category ?? "(미분류)";
    const bucket = byCategory.get(cat) ?? { longer: 0, longans: 0, shortans: 0, default: 0 };
    for (const v of d.variants) {
      if (kinds && kinds.length > 0 && !(kinds as string[]).includes(v.kind)) continue;
      bucket[v.kind] += v.nSamples ?? 0;
    }
    byCategory.set(cat, bucket);

    const dp = byDatapack.get(d.datapack) ?? { nSamples: 0, nDatasets: 0 };
    dp.nSamples += total;
    dp.nDatasets += 1;
    byDatapack.set(d.datapack, dp);

    const lang = d.language ?? "(미지정)";
    byLanguage.set(lang, (byLanguage.get(lang) ?? 0) + total);
  }
  kpis.nDatapacks = datapackSet.size;

  const uniq = (values: (string | null)[]) =>
    Array.from(new Set(values.filter((v): v is string => Boolean(v)))).sort((a, b) =>
      a.localeCompare(b),
    );

  return {
    datasets,
    kpis,
    byCategory: Array.from(byCategory, ([category, v]) => ({ category, ...v })).sort(
      (a, b) =>
        b.longer +
        b.longans +
        b.shortans +
        b.default -
        (a.longer + a.longans + a.shortans + a.default),
    ),
    byDatapack: Array.from(byDatapack, ([datapack, v]) => ({ datapack, ...v })).sort(
      (a, b) => b.nSamples - a.nSamples,
    ),
    byLanguage: Array.from(byLanguage, ([language, nSamples]) => ({ language, nSamples })).sort(
      (a, b) => b.nSamples - a.nSamples,
    ),
    options: {
      datapacks: uniq(all.map((d) => d.datapack)),
      categories: uniq(all.map((d) => d.category)),
      subCategories: uniq(all.map((d) => d.subCategory)),
      languages: uniq(all.map((d) => d.language)),
      tags: uniq(all.flatMap((d) => d.tags)),
    },
  };
}

export { VARIANT_KINDS };
