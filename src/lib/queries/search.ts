import type { DatabaseSync } from "node:sqlite";

import { all } from "@/lib/db/client";

export type SearchHit = {
  type: "superpack" | "datapack" | "dataset" | "tag" | "sample";
  id: number;
  title: string;
  subtitle: string | null;
  href: string;
};

function like(q: string): string {
  return `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
}

/** Cross-entity search for the ⌘K palette. Names/categories/paths use LIKE; samples use FTS5. */
export function globalSearch(db: DatabaseSync, query: string, limit = 8): SearchHit[] {
  const q = query.trim();
  if (q.length < 1) return [];
  const pattern = like(q);
  const hits: SearchHit[] = [];

  hits.push(
    ...all<{ id: number; name: string; n: number }>(
      db,
      `SELECT s.id, s.name, (SELECT count(*) FROM superpack_dataset_weights w WHERE w.superpack_id = s.id) AS n
       FROM superpacks s WHERE s.name LIKE ? ESCAPE '\\' ORDER BY s.name LIMIT ?`,
      pattern,
      limit,
    ).map((r) => ({
      type: "superpack" as const,
      id: r.id,
      title: r.name,
      subtitle: `Superpack · Dataset ${r.n}개`,
      href: `/superpacks/${r.id}`,
    })),
  );

  hits.push(
    ...all<{ id: number; name: string; n: number }>(
      db,
      `SELECT p.id, p.name, (SELECT count(*) FROM datasets d WHERE d.datapack_id = p.id) AS n
       FROM datapacks p WHERE p.name LIKE ? ESCAPE '\\' ORDER BY p.name LIMIT ?`,
      pattern,
      limit,
    ).map((r) => ({
      type: "datapack" as const,
      id: r.id,
      title: r.name,
      subtitle: `Datapack · Dataset ${r.n}개`,
      href: `/datapacks/${r.id}`,
    })),
  );

  hits.push(
    ...all<{ id: number; name: string; datapack: string; category: string | null }>(
      db,
      `SELECT d.id, d.name, p.name AS datapack, d.category
       FROM datasets d JOIN datapacks p ON p.id = d.datapack_id
       WHERE d.name LIKE ? ESCAPE '\\' OR d.category LIKE ? ESCAPE '\\' OR d.sub_category LIKE ? ESCAPE '\\'
          OR d.origin_json LIKE ? ESCAPE '\\'
          OR EXISTS (SELECT 1 FROM variants v WHERE v.dataset_id = d.id AND v.json_path LIKE ? ESCAPE '\\')
       ORDER BY d.name LIMIT ?`,
      pattern,
      pattern,
      pattern,
      pattern,
      pattern,
      limit,
    ).map((r) => ({
      type: "dataset" as const,
      id: r.id,
      title: r.name,
      subtitle: [r.datapack, r.category].filter(Boolean).join(" · "),
      href: `/datasets/${r.id}`,
    })),
  );

  hits.push(
    ...all<{ id: number; name: string; n: number }>(
      db,
      `SELECT t.id, t.name, (SELECT count(*) FROM taggings g WHERE g.tag_id = t.id) AS n
       FROM tags t WHERE t.name LIKE ? ESCAPE '\\' ORDER BY t.name LIMIT ?`,
      pattern,
      limit,
    ).map((r) => ({
      type: "tag" as const,
      id: r.id,
      title: r.name,
      subtitle: `태그 · ${r.n}곳에 사용`,
      href: `/datasets?tag=${encodeURIComponent(r.name)}&sp=all`,
    })),
  );

  const ftsQuery = toFtsQuery(q);
  if (ftsQuery) {
    try {
      hits.push(
        ...all<{
          id: number;
          sample_id: string | null;
          first_question: string | null;
          dataset: string;
          kind: string;
        }>(
          db,
          `SELECT s.id, s.sample_id, s.first_question, d.name AS dataset, v.kind
           FROM samples_fts f JOIN samples s ON s.id = f.rowid
           JOIN variants v ON v.id = s.variant_id JOIN datasets d ON d.id = v.dataset_id
           WHERE samples_fts MATCH ? ORDER BY rank LIMIT ?`,
          ftsQuery,
          limit,
        ).map((r) => ({
          type: "sample" as const,
          id: r.id,
          title: (r.first_question ?? r.sample_id ?? `#${r.id}`)
            .replace(/<\|image\|>\s*/g, "")
            .slice(0, 120),
          subtitle: `샘플 · ${r.dataset} / ${r.kind}${r.sample_id ? ` · ${r.sample_id}` : ""}`,
          href: `/samples/${r.id}`,
        })),
      );
    } catch {
      // Malformed FTS syntax: ignore sample hits rather than failing the whole search.
    }
  }
  return hits;
}

/** Turns free text into a safe FTS5 query: each word quoted and prefix-matched. */
export function toFtsQuery(text: string): string {
  const words = text
    .split(/\s+/)
    .map((w) => w.replace(/"/g, "").trim())
    .filter((w) => w.length > 0);
  if (words.length === 0) return "";
  return words.map((w) => `"${w}"*`).join(" ");
}
