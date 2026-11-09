import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/lib/db/client";
import {
  deleteSuperpack,
  getSuperpack,
  setSuperpackDatapacks,
  updateSuperpackMeta,
  updateWeights,
} from "@/lib/queries/superpacks";
import { publish } from "@/lib/realtime/bus";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(1000).nullable().optional(),
  datapackIds: z.array(z.number().int().positive()).optional(),
  weights: z
    .array(
      z.object({
        datasetId: z.number().int().positive(),
        mxWeight1: z.number().min(0).nullable(),
        mxWeight2: z.number().min(0).nullable(),
      }),
    )
    .optional(),
});

export async function GET(_request: Request, { params }: Ctx) {
  const { id } = await params;
  const sp = getSuperpack(getDb(), Number(id));
  if (!sp) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ superpack: sp });
}

export async function PATCH(request: Request, { params }: Ctx) {
  const { id } = await params;
  const superpackId = Number(id);
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const db = getDb();
  if (!getSuperpack(db, superpackId))
    return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    const { name, description, datapackIds, weights } = parsed.data;
    if (name !== undefined || description !== undefined)
      updateSuperpackMeta(db, superpackId, { name, description });
    if (datapackIds) setSuperpackDatapacks(db, superpackId, datapackIds);
    if (weights) updateWeights(db, superpackId, weights);
    publish({ type: "data-changed", scope: "superpack" });
    return NextResponse.json({ superpack: getSuperpack(db, superpackId) });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const { id } = await params;
  deleteSuperpack(getDb(), Number(id));
  publish({ type: "data-changed", scope: "superpack" });
  return NextResponse.json({ ok: true });
}
