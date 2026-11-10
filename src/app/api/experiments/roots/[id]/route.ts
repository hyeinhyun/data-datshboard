import { NextResponse } from "next/server";

import { getDb } from "@/lib/db/client";
import { ensureHandlers } from "@/lib/jobs/handlers";
import { activeJobFor, enqueue } from "@/lib/jobs/queue";
import { getRoot } from "@/lib/queries/experiments";
import { publish } from "@/lib/realtime/bus";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** POST: rescan the root. */
export async function POST(_request: Request, { params }: Params) {
  const id = Number((await params).id);
  const db = getDb();
  const root = getRoot(db, id);
  if (!root) return NextResponse.json({ error: "루트를 찾을 수 없습니다." }, { status: 404 });
  ensureHandlers();
  const job =
    activeJobFor(db, "scan", "rootId", id) ??
    enqueue("scan", { rootId: id }, `${root.path} 스캔 대기`);
  return NextResponse.json({ job });
}

/** DELETE: forget the root and its experiments. Registered data files and indexes stay. */
export async function DELETE(_request: Request, { params }: Params) {
  const id = Number((await params).id);
  const db = getDb();
  const result = db.prepare(`DELETE FROM experiment_roots WHERE id = ?`).run(id);
  if (result.changes === 0)
    return NextResponse.json({ error: "루트를 찾을 수 없습니다." }, { status: 404 });
  publish({ type: "data-changed", scope: "experiments" });
  return NextResponse.json({ ok: true });
}
