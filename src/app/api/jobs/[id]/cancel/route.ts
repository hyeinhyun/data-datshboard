import { NextResponse } from "next/server";

import { cancelJob } from "@/lib/jobs/queue";

export const runtime = "nodejs";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ok = cancelJob(Number(id));
  return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
}
