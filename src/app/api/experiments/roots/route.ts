import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/lib/db/client";
import { unmapPath } from "@/lib/env";
import { normalizeRootPath, upsertRoot } from "@/lib/experiments/scan";
import { ensureHandlers } from "@/lib/jobs/handlers";
import { activeJobFor, enqueue } from "@/lib/jobs/queue";
import { listRoots } from "@/lib/queries/experiments";

export const runtime = "nodejs";

export function GET() {
  return NextResponse.json({ roots: listRoots(getDb()) });
}

const bodySchema = z.object({ path: z.string().trim().min(1, "경로를 입력하세요.") });

/** Registers a root directory (or reuses it) and queues a scan. */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  // Stored in the volume namespace, like every other path the scan records.
  const rootPath = unmapPath(normalizeRootPath(parsed.data.path));
  if (!rootPath.startsWith("/"))
    return NextResponse.json({ error: "절대 경로를 입력하세요." }, { status: 400 });
  const db = getDb();
  // Nested roots would claim each other's configs; ask for one or the other.
  const overlap = listRoots(db).find(
    (r) =>
      r.path !== rootPath &&
      (rootPath.startsWith(`${r.path}/`) || r.path.startsWith(`${rootPath}/`)),
  );
  if (overlap)
    return NextResponse.json(
      {
        error: `이미 등록된 루트와 겹칩니다: ${overlap.path}. 겹치는 루트를 지우거나 그 루트를 다시 스캔하세요.`,
      },
      { status: 409 },
    );
  ensureHandlers();
  const rootId = upsertRoot(db, rootPath);
  const job =
    activeJobFor(db, "scan", "rootId", rootId) ??
    enqueue("scan", { rootId }, `${rootPath} 스캔 대기`);
  return NextResponse.json({ rootId, job });
}
