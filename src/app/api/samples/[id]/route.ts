import { NextResponse } from "next/server";

import { getDb } from "@/lib/db/client";
import { getSample } from "@/lib/queries/samples";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sample = getSample(getDb(), Number(id));
  if (!sample) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ sample });
}
