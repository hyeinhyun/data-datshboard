import { NextResponse } from "next/server";

import { getDb } from "@/lib/db/client";
import { applyImport, planImport } from "@/lib/manifest/import";
import { parseManifest } from "@/lib/manifest/parse";
import { publish } from "@/lib/realtime/bus";

export const runtime = "nodejs";

/**
 * POST multipart/form-data
 *   file:      .xlsx / .csv / .tsv manifest
 *   mode:      "preview" (default) | "apply"
 *   overwrite: "true" to overwrite conflicting variant values on apply
 */
export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file 필드에 Manifest 파일을 첨부하세요." }, { status: 400 });
  }
  const mode = form.get("mode") === "apply" ? "apply" : "preview";
  const overwrite = form.get("overwrite") === "true";

  let parsed;
  try {
    parsed = await parseManifest(Buffer.from(await file.arrayBuffer()), file.name);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  const db = getDb();
  const plan = planImport(db, parsed.sheets);
  if (mode === "preview") {
    return NextResponse.json({ fileName: parsed.fileName, plan });
  }
  const result = applyImport(db, parsed.sheets, { overwriteConflicts: overwrite });
  publish({ type: "data-changed", scope: "manifest" });
  return NextResponse.json({ fileName: parsed.fileName, plan, result });
}
