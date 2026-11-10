import { NextResponse } from "next/server";
import { z } from "zod";

import { get, getDb, transaction } from "@/lib/db/client";
import { registerFileDataset } from "@/lib/experiments/scan";
import { expandPaths, inspectFile, splitPaths, type InspectedFile } from "@/lib/files/detect";
import { ensureHandlers } from "@/lib/jobs/handlers";
import { activeJobFor, enqueue } from "@/lib/jobs/queue";
import { publish } from "@/lib/realtime/bus";

export const runtime = "nodejs";

const bodySchema = z.object({
  /** Comma / newline separated file or directory paths. */
  paths: z.string().min(1, "경로를 입력하세요."),
  mode: z.enum(["preview", "apply"]),
  /** Datapack for every file; empty = each file's directory. */
  datapack: z.string().trim().max(200).optional(),
  index: z.boolean().optional(),
  /** apply: only these paths (from the preview); omitted = every readable file. */
  include: z.array(z.string()).optional(),
});

export type FileImportItem = InspectedFile & {
  datasetId?: number;
  variantId?: number;
  jobId?: number;
};

/**
 * POST /api/import/files — preview: detect the format of each pasted JSON/JSONL path (or
 * the files under a pasted directory). apply: register the readable ones as datasets and,
 * optionally, queue their indexing.
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  const { mode, datapack, index = true, include } = parsed.data;

  const inputs = splitPaths(parsed.data.paths);
  if (inputs.length === 0)
    return NextResponse.json({ error: "경로를 입력하세요." }, { status: 400 });
  const { files, notes } = await expandPaths(inputs);
  const targets = include ? files.filter((f) => include.includes(f)) : files;
  const items: FileImportItem[] = [];
  for (const f of targets) items.push(await inspectFile(f));

  if (mode === "preview") return NextResponse.json({ items, notes });

  // Re-detected on the server above, so the client cannot inject a spec.
  const db = getDb();
  const readable = items.filter((i) => i.status === "ok");
  transaction(db, () => {
    for (const item of readable) {
      // A file already registered (e.g. by an experiment scan, with its dataset_info format)
      // is reused as is rather than re-registered with the guessed format.
      const existing = datapack
        ? undefined
        : get<{ datasetId: number; variantId: number }>(
            db,
            `SELECT d.id AS datasetId, v.id AS variantId FROM variants v
             JOIN datasets d ON d.id = v.dataset_id
             WHERE v.json_path = ? AND d.source = 'file' ORDER BY d.id LIMIT 1`,
            item.path,
          );
      if (existing) {
        item.datasetId = existing.datasetId;
        item.variantId = existing.variantId;
        continue;
      }
      item.datasetId = registerFileDataset(
        db,
        item.path,
        item.spec ? JSON.stringify(item.spec) : null,
        false,
        datapack || null,
      );
      item.variantId = get<{ id: number }>(
        db,
        `SELECT id FROM variants WHERE dataset_id = ? AND kind = 'default'`,
        item.datasetId,
      )!.id;
    }
  });
  if (index) {
    ensureHandlers();
    for (const item of readable) {
      const active = activeJobFor(db, "index", "variantId", item.variantId!);
      if (active) {
        item.jobId = active.id;
        continue;
      }
      // Already indexed with the same path and format: nothing to redo.
      const status = get<{ s: string }>(
        db,
        `SELECT index_status AS s FROM variants WHERE id = ?`,
        item.variantId!,
      )?.s;
      if (status === "done") continue;
      db.prepare(
        `UPDATE variants SET index_status = 'queued', index_error = NULL WHERE id = ?`,
      ).run(item.variantId!);
      item.jobId = enqueue(
        "index",
        { variantId: item.variantId },
        `${item.path.split("/").pop()} 색인 대기`,
      ).id;
    }
  }
  publish({ type: "data-changed", scope: "datasets" });
  return NextResponse.json({ items, notes, registered: readable.length });
}
