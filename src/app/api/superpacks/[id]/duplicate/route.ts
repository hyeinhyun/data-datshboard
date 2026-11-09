import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/lib/db/client";
import { duplicateSuperpack } from "@/lib/queries/superpacks";
import { publish } from "@/lib/realtime/bus";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = z
    .object({ name: z.string().min(1).max(120) })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  try {
    const newId = duplicateSuperpack(getDb(), Number(id), parsed.data.name);
    publish({ type: "data-changed", scope: "superpack" });
    return NextResponse.json({ id: newId }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
