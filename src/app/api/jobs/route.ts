import { NextResponse } from "next/server";

import { getDb } from "@/lib/db/client";
import { listJobs } from "@/lib/jobs/queue";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const limit = Math.min(Number(new URL(request.url).searchParams.get("limit") ?? 50) || 50, 200);
  return NextResponse.json({ jobs: listJobs(getDb(), limit) });
}
