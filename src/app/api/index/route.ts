import { NextResponse } from "next/server";
import { z } from "zod";

import { all, getDb } from "@/lib/db/client";
import { ensureHandlers } from "@/lib/jobs/handlers";
import { activeJobFor, enqueue } from "@/lib/jobs/queue";

export const runtime = "nodejs";

const bodySchema = z
  .object({
    variantId: z.number().int().positive().optional(),
    datasetId: z.number().int().positive().optional(),
    superpackId: z.number().int().positive().optional(),
    datapackId: z.number().int().positive().optional(),
  })
  .refine((b) => b.variantId || b.datasetId || b.superpackId || b.datapackId, {
    message: "variantId, datasetId, datapackId, superpackId 중 하나가 필요합니다.",
  });

/** Queues index jobs for every variant (with a JSON path) in the requested scope. */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const { variantId, datasetId, superpackId, datapackId } = parsed.data;
  const db = getDb();
  ensureHandlers();

  let variantIds: number[] = [];
  if (variantId) variantIds = [variantId];
  else if (datasetId)
    variantIds = all<{ id: number }>(
      db,
      `SELECT id FROM variants WHERE dataset_id = ? AND json_path IS NOT NULL`,
      datasetId,
    ).map((r) => r.id);
  else if (datapackId)
    variantIds = all<{ id: number }>(
      db,
      `SELECT v.id FROM variants v JOIN datasets d ON d.id = v.dataset_id WHERE d.datapack_id = ? AND v.json_path IS NOT NULL`,
      datapackId,
    ).map((r) => r.id);
  else if (superpackId)
    variantIds = all<{ id: number }>(
      db,
      `SELECT v.id FROM variants v JOIN superpack_dataset_weights w ON w.dataset_id = v.dataset_id
       WHERE w.superpack_id = ? AND v.json_path IS NOT NULL`,
      superpackId,
    ).map((r) => r.id);

  const jobs = [];
  let skipped = 0;
  for (const id of variantIds) {
    if (activeJobFor(db, "index", "variantId", id)) {
      skipped++;
      continue;
    }
    db.prepare(`UPDATE variants SET index_status = 'queued', index_error = NULL WHERE id = ?`).run(
      id,
    );
    jobs.push(enqueue("index", { variantId: id }, "대기 중"));
  }
  return NextResponse.json({ jobs, skipped });
}
