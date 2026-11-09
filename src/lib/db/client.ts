import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { MIGRATIONS } from "./migrations";
import { env } from "@/lib/env";

type GlobalWithDb = typeof globalThis & { __sftDashboardDb?: DatabaseSync };

/** Opens (or reuses) the SQLite database. One connection per process; survives dev HMR. */
export function getDb(): DatabaseSync {
  const g = globalThis as GlobalWithDb;
  if (g.__sftDashboardDb) return g.__sftDashboardDb;
  const db = openDatabase(env.DATABASE_PATH);
  g.__sftDashboardDb = db;
  return db;
}

export function openDatabase(file: string): DatabaseSync {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  if (file !== ":memory:") db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  migrate(db);
  return db;
}

export function migrate(db: DatabaseSync): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       name TEXT PRIMARY KEY,
       applied_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`,
  );
  const applied = new Set(
    (db.prepare("SELECT name FROM schema_migrations").all() as { name: string }[]).map(
      (r) => r.name,
    ),
  );
  for (const m of MIGRATIONS) {
    if (applied.has(m.name)) continue;
    db.exec("BEGIN");
    try {
      db.exec(m.sql);
      db.prepare("INSERT INTO schema_migrations (name) VALUES (?)").run(m.name);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
}

/** Runs `fn` inside a transaction. Nested calls join the already-open transaction. */
export function transaction<T>(db: DatabaseSync, fn: () => T): T {
  if (db.isTransaction) return fn();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

/**
 * node:sqlite returns rows with a null prototype, which React cannot serialise to
 * client components. These helpers return plain objects.
 */
export function all<T>(db: DatabaseSync, sql: string, ...params: SqlParam[]): T[] {
  return (db.prepare(sql).all(...params) as Record<string, unknown>[]).map((r) => ({
    ...r,
  })) as T[];
}

export function get<T>(db: DatabaseSync, sql: string, ...params: SqlParam[]): T | undefined {
  const row = db.prepare(sql).get(...params) as Record<string, unknown> | undefined;
  return row ? ({ ...row } as T) : undefined;
}

export type SqlParam = string | number | bigint | null | Uint8Array;

export function nowIso(): string {
  return new Date().toISOString();
}
