import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";

import { get, transaction } from "@/lib/db/client";
import { env } from "@/lib/env";
import type { JobContext } from "@/lib/jobs/queue";
import { enqueue } from "@/lib/jobs/queue";
import { createDatapack } from "@/lib/queries/datapacks";
import { publish } from "@/lib/realtime/bus";
import { importRepo, type HfMapping } from "./python";

export type HfImportPayload = {
  repo: string;
  config: string | null;
  split: string;
  mapping: HfMapping;
  maxSamples: number | null;
  imageMode: "first" | "all";
  datasetName: string;
  datapackName: string;
  category: string | null;
  subCategory: string | null;
  language: string | null;
  note: string | null;
};

export function hfOutputPaths(datasetName: string) {
  const safe = datasetName.replace(/[^\w.-]+/g, "_");
  return {
    safe,
    out: path.join(env.OUTPUT_ROOT, `${safe}.json`),
    imageDir: path.join(env.IMAGE_ROOT, "hf_imports", safe),
    imageRelPrefix: `hf_imports/${safe}`,
  };
}

/** Registers the converted file as a dataset (source=hf) with one `default` variant. */
export function registerHfDataset(
  db: DatabaseSync,
  p: HfImportPayload,
  out: string,
  nSamples: number,
): { datasetId: number; variantId: number; datapackId: number } {
  return transaction(db, () => {
    const datapackId = createDatapack(db, p.datapackName);
    const existing = get<{ id: number }>(
      db,
      `SELECT id FROM datasets WHERE datapack_id = ? AND name = ?`,
      datapackId,
      p.datasetName,
    );
    let datasetId: number;
    if (existing) {
      datasetId = existing.id;
      db.prepare(
        `UPDATE datasets SET category = ?, sub_category = ?, language = ?, note = ?, source = 'hf', hf_repo = ?,
           updated_at = datetime('now') WHERE id = ?`,
      ).run(p.category, p.subCategory, p.language, p.note, p.repo, datasetId);
    } else {
      datasetId = get<{ id: number }>(
        db,
        `INSERT INTO datasets (datapack_id, name, category, sub_category, language, note, source, hf_repo)
         VALUES (?, ?, ?, ?, ?, ?, 'hf', ?) RETURNING id`,
        datapackId,
        p.datasetName,
        p.category,
        p.subCategory,
        p.language,
        p.note,
        p.repo,
      )!.id;
    }
    const variant = get<{ id: number }>(
      db,
      `INSERT INTO variants (dataset_id, kind, json_path, n_samples_manifest, sft_weight, index_status)
       VALUES (?, 'default', ?, ?, 1, 'none')
       ON CONFLICT(dataset_id, kind) DO UPDATE SET json_path = excluded.json_path,
         n_samples_manifest = excluded.n_samples_manifest, index_status = 'none', n_samples_indexed = 0
       RETURNING id`,
      datasetId,
      out,
      nSamples,
    )!;
    return { datasetId, variantId: variant.id, datapackId };
  });
}

/** Job handler: runs the Python converter, then registers + indexes the result. */
export async function runHfImportJob({ job, signal, progress }: JobContext, db: DatabaseSync) {
  const p = job.payload as unknown as HfImportPayload;
  const paths = hfOutputPaths(p.datasetName);
  const workDir = path.join(env.DATA_DIR, "hf-jobs", String(job.id));
  fs.mkdirSync(workDir, { recursive: true });
  fs.mkdirSync(path.dirname(paths.out), { recursive: true });
  fs.mkdirSync(paths.imageDir, { recursive: true });
  const mappingFile = path.join(workDir, "mapping.json");
  fs.writeFileSync(mappingFile, JSON.stringify(p.mapping, null, 2));

  progress(0, `${p.repo} 변환 시작`);
  let total: number | null = null;
  const events = await importRepo(
    {
      repo: p.repo,
      mappingFile,
      out: paths.out,
      imageDir: paths.imageDir,
      imageRelPrefix: paths.imageRelPrefix,
      config: p.config,
      split: p.split,
      maxSamples: p.maxSamples,
      imageMode: p.imageMode,
      resume: fs.existsSync(`${paths.out}.partial`),
    },
    {
      signal,
      onEvent: (e) => {
        if (e.event === "start") total = e.total;
        if (e.event === "progress") {
          const denom = p.maxSamples ? Math.min(p.maxSamples, total ?? p.maxSamples) : total;
          progress(
            denom ? e.done / denom : 0,
            `${p.repo} · ${e.done.toLocaleString("ko-KR")}${denom ? ` / ${denom.toLocaleString("ko-KR")}` : ""}개 · 이미지 ${e.images.toLocaleString("ko-KR")}${e.missing_images ? ` (누락 ${e.missing_images})` : ""}`,
          );
        }
        if (e.event === "log") progress(job.progress, `${p.repo} · ${e.message}`);
      },
    },
  );
  const done = events.find((e) => e.event === "done") as
    { n_samples: number; n_images: number; missing_images: number; out: string } | undefined;
  if (!done) throw new Error("워커가 완료 이벤트 없이 종료되었습니다.");

  const ids = registerHfDataset(db, p, done.out, done.n_samples);
  publish({ type: "data-changed", scope: "datasets" });
  // Index right away so the explorer can show it.
  db.prepare(`UPDATE variants SET index_status = 'queued' WHERE id = ?`).run(ids.variantId);
  enqueue("index", { variantId: ids.variantId }, `${p.datasetName} 색인 대기`);
  progress(1, `${p.datasetName}: ${done.n_samples.toLocaleString("ko-KR")}개 변환 완료, 색인 대기`);
  return { ...ids, ...done };
}
