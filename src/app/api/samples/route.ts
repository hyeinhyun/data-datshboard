import { NextResponse } from "next/server";

import { getDb } from "@/lib/db/client";
import { listSamples, randomSampleId } from "@/lib/queries/samples";
import { parseSampleFilters } from "@/lib/sample-filters";

export const runtime = "nodejs";

/** GET /api/samples?variant=&q=&img=&minTurns=&maxTurns=&page=&pageSize=  |  &random=1 */
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const db = getDb();
  const filters = parseSampleFilters(Object.fromEntries(sp.entries()));
  if (sp.get("random") === "1") {
    return NextResponse.json({ id: randomSampleId(db, filters) });
  }
  const page = Math.max(1, Number(sp.get("page") ?? 1) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(sp.get("pageSize") ?? 60) || 60));
  return NextResponse.json(listSamples(db, filters, page, pageSize));
}
