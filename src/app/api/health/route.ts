import { NextResponse } from "next/server";

import { get, getDb } from "@/lib/db/client";
import { workerAvailable } from "@/lib/hf/python";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Liveness/readiness probe for Docker and reverse proxies. */
export async function GET() {
  try {
    const db = getDb();
    const counts = get<{ datasets: number; samples: number }>(
      db,
      `SELECT (SELECT count(*) FROM datasets) AS datasets, (SELECT count(*) FROM samples) AS samples`,
    )!;
    return NextResponse.json({
      ok: true,
      db: "ok",
      worker: workerAvailable().ok,
      ...counts,
      time: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 503 });
  }
}
