import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/lib/db/client";
import { listSuperpacks } from "@/lib/queries/overview";
import { createSuperpack } from "@/lib/queries/superpacks";
import { publish } from "@/lib/realtime/bus";

export const runtime = "nodejs";

const createSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(1000).nullable().optional(),
  datapackIds: z.array(z.number().int().positive()).min(1),
  copyFrom: z.number().int().positive().nullable().optional(),
});

export async function GET() {
  return NextResponse.json({ superpacks: listSuperpacks(getDb()) });
}

export async function POST(request: Request) {
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  try {
    const id = createSuperpack(getDb(), parsed.data);
    publish({ type: "data-changed", scope: "superpack" });
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
