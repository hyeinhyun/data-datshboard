import fs from "node:fs";

import chokidar, { type FSWatcher } from "chokidar";

import { all, getDb } from "@/lib/db/client";
import { env, remapPath } from "@/lib/env";
import { ensureHandlers } from "@/lib/jobs/handlers";
import { activeJobFor, enqueue } from "@/lib/jobs/queue";
import { publish } from "./bus";

type WatcherState = { interval: ReturnType<typeof setInterval> | null; manifest: FSWatcher | null };
type GlobalWithWatcher = typeof globalThis & { __sftDashboardWatcher?: WatcherState };

const STALE_CHECK_MS = Number(process.env.STALE_CHECK_MS ?? 5 * 60_000);

/** Variants whose JSON file changed since they were indexed. */
export function findStaleVariants(): { id: number; path: string }[] {
  const db = getDb();
  const rows = all<{ id: number; json_path: string; file_mtime: string | null }>(
    db,
    `SELECT id, json_path, file_mtime FROM variants WHERE index_status = 'done' AND json_path IS NOT NULL`,
  );
  const stale: { id: number; path: string }[] = [];
  for (const r of rows) {
    const p = remapPath(r.json_path);
    try {
      const mtime = fs.statSync(p).mtime.toISOString();
      if (mtime !== r.file_mtime) stale.push({ id: r.id, path: p });
    } catch {
      /* missing file: left alone; the detail page shows the error on re-index */
    }
  }
  return stale;
}

function checkStale(): void {
  const stale = findStaleVariants();
  if (stale.length === 0) return;
  const db = getDb();
  if (process.env.AUTO_REINDEX === "true") {
    ensureHandlers();
    for (const v of stale) {
      if (activeJobFor(db, "index", "variantId", v.id)) continue;
      db.prepare(`UPDATE variants SET index_status = 'queued' WHERE id = ?`).run(v.id);
      enqueue("index", { variantId: v.id }, "파일 변경 감지 · 재색인 대기");
    }
  } else {
    // Mark as stale so the UI can offer re-indexing; keep the old samples usable meanwhile.
    for (const v of stale) {
      db.prepare(
        `UPDATE variants SET index_error = '파일이 변경되었습니다. 다시 색인하세요.' WHERE id = ?`,
      ).run(v.id);
    }
  }
  publish({ type: "data-changed", scope: "datasets" });
}

/**
 * Starts background watching once per process:
 *  - every STALE_CHECK_MS, compare indexed variants' file mtimes (large JSON files
 *    are polled rather than watched with inotify)
 *  - if MANIFEST_PATH is set, watch that Excel file and notify browsers on change
 */
export function startWatchers(): void {
  const g = globalThis as GlobalWithWatcher;
  if (g.__sftDashboardWatcher) return;
  const state: WatcherState = { interval: null, manifest: null };
  g.__sftDashboardWatcher = state;

  state.interval = setInterval(() => {
    try {
      checkStale();
    } catch (err) {
      console.error("[watcher] stale check failed:", err);
    }
  }, STALE_CHECK_MS);
  state.interval.unref();

  const manifestPath = process.env.MANIFEST_PATH;
  if (manifestPath) {
    state.manifest = chokidar.watch(manifestPath, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 1500 },
    });
    state.manifest.on("change", () => {
      getDb()
        .prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('manifest_changed_at', ?)`)
        .run(new Date().toISOString());
      publish({ type: "data-changed", scope: "manifest" });
    });
    state.manifest.on("error", (err) => console.error("[watcher] manifest watch error:", err));
  }
  console.log(
    `[watcher] started (stale check every ${Math.round(STALE_CHECK_MS / 1000)}s${manifestPath ? `, watching ${manifestPath}` : ""}${process.env.AUTO_REINDEX === "true" ? ", auto re-index on" : ""})`,
  );
}

export { env };
