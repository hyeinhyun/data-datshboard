import type { DatabaseSync } from "node:sqlite";

import { all, get, type SqlParam } from "@/lib/db/client";
import type { Turn } from "@/lib/indexer/derive";
import type { VariantKind } from "@/lib/manifest/types";
import { toFtsQuery } from "./search";

export type SampleFilters = {
  variantId: number | null;
  datasetId?: number | null;
  q?: string;
  hasImage?: boolean | null;
  minTurns?: number | null;
  maxTurns?: number | null;
};

export type SampleListItem = {
  id: number;
  sampleId: string | null;
  variantId: number;
  kind: VariantKind | "default";
  dataset: string;
  imagePaths: string[];
  nImages: number;
  nTurns: number;
  firstQuestion: string | null;
  firstAnswerPreview: string | null;
  qChars: number;
  aChars: number;
};

export type SampleDetail = SampleListItem & {
  datasetId: number;
  datapack: string;
  hasSystem: boolean;
  meta: Record<string, unknown> | null;
  conversations: Turn[];
  siblings: { variantId: number; kind: string; sampleRowId: number }[];
};

type RawItem = Omit<SampleListItem, "imagePaths"> & { imagePaths: string };

const ITEM_SELECT = `SELECT s.id, s.sample_id AS sampleId, s.variant_id AS variantId, v.kind, d.name AS dataset,
  s.image_paths AS imagePaths, s.n_images AS nImages, s.n_turns AS nTurns, s.first_question AS firstQuestion,
  s.first_answer_preview AS firstAnswerPreview, s.q_chars AS qChars, s.a_chars AS aChars
  FROM samples s JOIN variants v ON v.id = s.variant_id JOIN datasets d ON d.id = v.dataset_id`;

function whereClause(f: SampleFilters): { sql: string; params: SqlParam[] } {
  const conds: string[] = [];
  const params: SqlParam[] = [];
  if (f.variantId) {
    conds.push("s.variant_id = ?");
    params.push(f.variantId);
  } else if (f.datasetId) {
    conds.push("v.dataset_id = ?");
    params.push(f.datasetId);
  }
  if (f.hasImage === true) conds.push("s.n_images > 0");
  if (f.hasImage === false) conds.push("s.n_images = 0");
  if (f.minTurns) {
    conds.push("s.n_turns >= ?");
    params.push(f.minTurns);
  }
  if (f.maxTurns) {
    conds.push("s.n_turns <= ?");
    params.push(f.maxTurns);
  }
  const fts = f.q ? toFtsQuery(f.q) : "";
  if (fts) {
    conds.push("s.id IN (SELECT rowid FROM samples_fts WHERE samples_fts MATCH ?)");
    params.push(fts);
  }
  return { sql: conds.length ? `WHERE ${conds.join(" AND ")}` : "", params };
}

function hydrate(r: RawItem): SampleListItem {
  return { ...r, imagePaths: JSON.parse(r.imagePaths) as string[] };
}

export function listSamples(
  db: DatabaseSync,
  f: SampleFilters,
  page = 1,
  pageSize = 60,
): { items: SampleListItem[]; total: number; page: number; pageSize: number } {
  const { sql, params } = whereClause(f);
  const total =
    get<{ c: number }>(
      db,
      `SELECT count(*) AS c FROM samples s JOIN variants v ON v.id = s.variant_id ${sql}`,
      ...params,
    )?.c ?? 0;
  const items = all<RawItem>(
    db,
    `${ITEM_SELECT} ${sql} ORDER BY s.id LIMIT ? OFFSET ?`,
    ...params,
    pageSize,
    (page - 1) * pageSize,
  ).map(hydrate);
  return { items, total, page, pageSize };
}

/**
 * Full text of each sample's first assistant turn (the GT answer), for the table view.
 * `first_answer_preview` is capped at 200 characters, so this reads the stored conversation.
 */
export function firstAnswers(db: DatabaseSync, ids: number[]): Record<number, string> {
  if (ids.length === 0) return {};
  const rows = all<{ id: number; answer: string | null }>(
    db,
    `SELECT s.id,
       (SELECT json_extract(t.value, '$.value') FROM json_each(s.conversations) t
        WHERE lower(json_extract(t.value, '$.from')) IN ('gpt', 'assistant', 'model')
        ORDER BY t.key LIMIT 1) AS answer
     FROM samples s WHERE s.id IN (${ids.map(() => "?").join(",")})`,
    ...ids,
  );
  const out: Record<number, string> = {};
  for (const r of rows) if (r.answer !== null) out[r.id] = r.answer;
  return out;
}

export function getSample(db: DatabaseSync, id: number): SampleDetail | null {
  const r = get<
    RawItem & {
      datasetId: number;
      datapack: string;
      hasSystem: number;
      meta: string | null;
      conversations: string;
    }
  >(
    db,
    `SELECT s.id, s.sample_id AS sampleId, s.variant_id AS variantId, v.kind, d.name AS dataset,
            d.id AS datasetId, p.name AS datapack, s.image_paths AS imagePaths, s.n_images AS nImages,
            s.n_turns AS nTurns, s.first_question AS firstQuestion, s.first_answer_preview AS firstAnswerPreview,
            s.q_chars AS qChars, s.a_chars AS aChars, s.has_system AS hasSystem, s.meta, s.conversations
     FROM samples s JOIN variants v ON v.id = s.variant_id JOIN datasets d ON d.id = v.dataset_id
     JOIN datapacks p ON p.id = d.datapack_id WHERE s.id = ?`,
    id,
  );
  if (!r) return null;
  const siblings = r.sampleId
    ? all<{ variantId: number; kind: string; sampleRowId: number }>(
        db,
        `SELECT s2.variant_id AS variantId, v2.kind, s2.id AS sampleRowId
         FROM samples s2 JOIN variants v2 ON v2.id = s2.variant_id
         WHERE v2.dataset_id = ? AND s2.sample_id = ? AND s2.id != ?
         ORDER BY CASE v2.kind WHEN 'longer' THEN 0 WHEN 'longans' THEN 1 WHEN 'shortans' THEN 2 ELSE 3 END`,
        r.datasetId,
        r.sampleId,
        id,
      )
    : [];
  return {
    ...hydrate(r),
    datasetId: r.datasetId,
    datapack: r.datapack,
    hasSystem: Boolean(r.hasSystem),
    meta: r.meta ? (JSON.parse(r.meta) as Record<string, unknown>) : null,
    conversations: JSON.parse(r.conversations) as Turn[],
    siblings,
  };
}

/** Previous/next sample ids within the same filter set, ordered by row id. */
export function sampleNeighbors(
  db: DatabaseSync,
  id: number,
  f: SampleFilters,
): { prevId: number | null; nextId: number | null; position: number } {
  const { sql, params } = whereClause(f);
  const and = sql ? `${sql} AND` : "WHERE";
  const prev = get<{ id: number }>(
    db,
    `SELECT s.id FROM samples s JOIN variants v ON v.id = s.variant_id ${and} s.id < ? ORDER BY s.id DESC LIMIT 1`,
    ...params,
    id,
  );
  const next = get<{ id: number }>(
    db,
    `SELECT s.id FROM samples s JOIN variants v ON v.id = s.variant_id ${and} s.id > ? ORDER BY s.id LIMIT 1`,
    ...params,
    id,
  );
  const position =
    get<{ c: number }>(
      db,
      `SELECT count(*) AS c FROM samples s JOIN variants v ON v.id = s.variant_id ${and} s.id <= ?`,
      ...params,
      id,
    )?.c ?? 0;
  return { prevId: prev?.id ?? null, nextId: next?.id ?? null, position };
}

export function randomSampleId(db: DatabaseSync, f: SampleFilters): number | null {
  const { sql, params } = whereClause(f);
  return (
    get<{ id: number }>(
      db,
      `SELECT s.id FROM samples s JOIN variants v ON v.id = s.variant_id ${sql} ORDER BY random() LIMIT 1`,
      ...params,
    )?.id ?? null
  );
}

export type SampleStats = {
  total: number;
  withImages: number;
  avgTurns: number;
  avgQChars: number;
  avgAChars: number;
};

export function sampleStats(db: DatabaseSync, f: SampleFilters): SampleStats {
  const { sql, params } = whereClause(f);
  const r = get<{
    total: number;
    withImages: number;
    avgTurns: number | null;
    avgQ: number | null;
    avgA: number | null;
  }>(
    db,
    `SELECT count(*) AS total, sum(CASE WHEN s.n_images > 0 THEN 1 ELSE 0 END) AS withImages,
            avg(s.n_turns) AS avgTurns, avg(s.q_chars) AS avgQ, avg(s.a_chars) AS avgA
     FROM samples s JOIN variants v ON v.id = s.variant_id ${sql}`,
    ...params,
  );
  return {
    total: r?.total ?? 0,
    withImages: r?.withImages ?? 0,
    avgTurns: r?.avgTurns ?? 0,
    avgQChars: r?.avgQ ?? 0,
    avgAChars: r?.avgA ?? 0,
  };
}
