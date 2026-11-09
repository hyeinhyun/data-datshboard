import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/lib/db/client";
import { addTagging, listTags, removeTagging } from "@/lib/queries/tags";
import { publish } from "@/lib/realtime/bus";

export const runtime = "nodejs";

const bodySchema = z.object({
  tag: z.string().min(1).max(64),
  targetType: z.enum(["datapack", "dataset"]),
  targetId: z.number().int().positive(),
});

export async function GET() {
  return NextResponse.json({ tags: listTags(getDb()) });
}

/** Attach a tag (creating it if needed). */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const { tag, targetType, targetId } = parsed.data;
  const created = addTagging(getDb(), tag, targetType, targetId);
  publish({ type: "data-changed", scope: "tags" });
  return NextResponse.json({ tag: created });
}

/** Detach a tag. */
export async function DELETE(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const { tag, targetType, targetId } = parsed.data;
  removeTagging(getDb(), tag, targetType, targetId);
  publish({ type: "data-changed", scope: "tags" });
  return NextResponse.json({ ok: true });
}
