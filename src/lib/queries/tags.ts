import type { DatabaseSync } from "node:sqlite";

import { all, get } from "@/lib/db/client";

export type Tag = { id: number; name: string; color: string | null; nUses: number };
export type TagTarget = "datapack" | "dataset";

/** A small fixed set of chip colors; a new tag takes the least-used one. */
export const TAG_COLORS = ["blue", "orange", "aqua", "yellow", "magenta", "green"] as const;

export function listTags(db: DatabaseSync): Tag[] {
  return all<Tag>(
    db,
    `SELECT t.id, t.name, t.color, (SELECT count(*) FROM taggings g WHERE g.tag_id = t.id) AS nUses
     FROM tags t ORDER BY t.name`,
  );
}

export function normalizeTagName(name: string): string {
  return name.trim().replace(/\s+/g, " ").slice(0, 64);
}

export function ensureTag(db: DatabaseSync, rawName: string, color?: string | null): Tag {
  const name = normalizeTagName(rawName);
  if (!name) throw new Error("태그 이름이 비어 있습니다.");
  const existing = get<Tag>(
    db,
    `SELECT id, name, color, 0 AS nUses FROM tags WHERE name = ?`,
    name,
  );
  if (existing) return existing;
  const used = all<{ color: string }>(db, `SELECT color FROM tags WHERE color IS NOT NULL`);
  const counts = new Map<string, number>(TAG_COLORS.map((c) => [c, 0]));
  for (const u of used) counts.set(u.color, (counts.get(u.color) ?? 0) + 1);
  const pick = color ?? [...counts.entries()].sort((a, b) => a[1] - b[1])[0][0];
  const row = get<{ id: number }>(
    db,
    `INSERT INTO tags (name, color) VALUES (?, ?) RETURNING id`,
    name,
    pick,
  )!;
  return { id: row.id, name, color: pick, nUses: 0 };
}

export function addTagging(
  db: DatabaseSync,
  tagName: string,
  target: TagTarget,
  targetId: number,
): Tag {
  const tag = ensureTag(db, tagName);
  db.prepare(
    `INSERT OR IGNORE INTO taggings (tag_id, target_type, target_id) VALUES (?, ?, ?)`,
  ).run(tag.id, target, targetId);
  return tag;
}

export function removeTagging(
  db: DatabaseSync,
  tagName: string,
  target: TagTarget,
  targetId: number,
): void {
  const tag = get<{ id: number }>(
    db,
    `SELECT id FROM tags WHERE name = ?`,
    normalizeTagName(tagName),
  );
  if (!tag) return;
  db.prepare(`DELETE FROM taggings WHERE tag_id = ? AND target_type = ? AND target_id = ?`).run(
    tag.id,
    target,
    targetId,
  );
  // Drop tags nobody uses any more so the picker stays tidy.
  db.prepare(
    `DELETE FROM tags WHERE id = ? AND NOT EXISTS (SELECT 1 FROM taggings WHERE tag_id = ?)`,
  ).run(tag.id, tag.id);
}

export function tagsFor(db: DatabaseSync, target: TagTarget, targetId: number): Tag[] {
  return all<Tag>(
    db,
    `SELECT t.id, t.name, t.color, 0 AS nUses FROM taggings g JOIN tags t ON t.id = g.tag_id
     WHERE g.target_type = ? AND g.target_id = ? ORDER BY t.name`,
    target,
    targetId,
  );
}
