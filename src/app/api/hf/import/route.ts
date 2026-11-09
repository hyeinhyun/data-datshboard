import { NextResponse } from "next/server";
import { z } from "zod";

import { hfOutputPaths } from "@/lib/hf/import-job";
import { normalizeRepoId, workerAvailable } from "@/lib/hf/python";
import { ensureHandlers } from "@/lib/jobs/handlers";
import { enqueue } from "@/lib/jobs/queue";

export const runtime = "nodejs";

const mappingSchema = z.object({
  question: z.string().nullable(),
  answer: z.string().nullable(),
  image: z.string().nullable(),
  id: z.string().nullable(),
  system: z.string().nullable(),
  conversations: z.string().nullable(),
  meta: z.array(z.string()),
  normalize_tokens: z.boolean(),
});

const schema = z
  .object({
    repo: z.string().min(3),
    config: z.string().nullable().optional(),
    split: z.string().min(1).default("train"),
    mapping: mappingSchema,
    maxSamples: z.number().int().positive().nullable().optional(),
    imageMode: z.enum(["first", "all"]).default("all"),
    datasetName: z.string().min(1).max(120),
    datapackName: z.string().min(1).max(120),
    category: z.string().max(200).nullable().optional(),
    subCategory: z.string().max(200).nullable().optional(),
    language: z.string().max(50).nullable().optional(),
    note: z.string().max(1000).nullable().optional(),
  })
  .refine((b) => b.mapping.conversations || (b.mapping.question && b.mapping.answer), {
    message: "question/answer 컬럼 또는 conversations 컬럼을 지정하세요.",
  });

/** POST → queues an hf_import job; the result dataset is registered and indexed automatically. */
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const repo = normalizeRepoId(parsed.data.repo);
  if (!repo) return NextResponse.json({ error: "잘못된 저장소 형식입니다." }, { status: 400 });
  const availability = workerAvailable();
  if (!availability.ok) return NextResponse.json({ error: availability.reason }, { status: 503 });
  ensureHandlers();
  const b = parsed.data;
  const paths = hfOutputPaths(b.datasetName);
  const job = enqueue(
    "hf_import",
    {
      repo,
      config: b.config ?? null,
      split: b.split,
      mapping: b.mapping,
      maxSamples: b.maxSamples ?? null,
      imageMode: b.imageMode,
      datasetName: paths.safe,
      datapackName: b.datapackName.trim(),
      category: b.category ?? null,
      subCategory: b.subCategory ?? null,
      language: b.language ?? null,
      note: b.note ?? null,
    },
    `${repo} 변환 대기`,
  );
  return NextResponse.json({ job, out: paths.out, imageDir: paths.imageDir }, { status: 202 });
}
