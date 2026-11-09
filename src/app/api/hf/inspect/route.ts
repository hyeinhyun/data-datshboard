import { NextResponse } from "next/server";
import { z } from "zod";

import { inspectRepo, normalizeRepoId, workerAvailable } from "@/lib/hf/python";

export const runtime = "nodejs";
export const maxDuration = 300;

const schema = z.object({
  repo: z.string().min(3),
  config: z.string().nullable().optional(),
  split: z.string().nullable().optional(),
});

/** POST { repo } → schema, splits, preview rows and a suggested mapping. */
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const repo = normalizeRepoId(parsed.data.repo);
  if (!repo)
    return NextResponse.json(
      { error: "org/name 또는 huggingface.co/datasets/org/name 형식이어야 합니다." },
      { status: 400 },
    );
  const availability = workerAvailable();
  if (!availability.ok) return NextResponse.json({ error: availability.reason }, { status: 503 });
  try {
    const result = await inspectRepo(repo, {
      config: parsed.data.config,
      split: parsed.data.split,
    });
    return NextResponse.json({ repo, result });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
