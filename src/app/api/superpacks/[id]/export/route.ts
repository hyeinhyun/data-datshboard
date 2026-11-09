import { NextResponse } from "next/server";

import { all, getDb } from "@/lib/db/client";
import { getSuperpack } from "@/lib/queries/superpacks";
import { superpackToJson, superpackToXlsx } from "@/lib/superpack/export";

export const runtime = "nodejs";

/** GET ?format=xlsx|json → file download. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const sp = getSuperpack(db, Number(id));
  if (!sp) return NextResponse.json({ error: "not found" }, { status: 404 });
  const format = new URL(request.url).searchParams.get("format") === "json" ? "json" : "xlsx";
  const safeName = sp.name.replace(/[^\w.-]+/g, "_");

  if (format === "json") {
    return new NextResponse(JSON.stringify(superpackToJson(sp), null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${safeName}.json"`,
      },
    });
  }
  const origin = new Map<number, string | null>(
    all<{ id: number; origin_json: string | null }>(
      db,
      `SELECT d.id, d.origin_json FROM datasets d JOIN superpack_dataset_weights w ON w.dataset_id = d.id
       WHERE w.superpack_id = ?`,
      sp.id,
    ).map((r) => [r.id, r.origin_json]),
  );
  const buffer = await superpackToXlsx(sp, origin);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${safeName}.xlsx"`,
    },
  });
}
