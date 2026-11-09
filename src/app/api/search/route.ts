import { NextResponse } from "next/server";

import { getDb } from "@/lib/db/client";
import { globalSearch } from "@/lib/queries/search";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const limit = Math.min(Number(searchParams.get("limit") ?? 8) || 8, 25);
  return NextResponse.json({ hits: globalSearch(getDb(), q, limit) });
}
