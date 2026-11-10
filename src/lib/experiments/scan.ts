import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";

import { all, get, transaction } from "@/lib/db/client";
import { remapPath, unmapPath } from "@/lib/env";
import { clearVariantSamples } from "@/lib/indexer/index-variant";
import { createDatapack } from "@/lib/queries/datapacks";
import { parseTrainingConfig, type TrainingConfig } from "./config";
import { isPlaceholder, parseDatasetInfo, type DatasetInfoEntry } from "./format";

export const DATASET_INFO = "dataset_info.json";
const MAX_DEPTH = 12;
const MAX_DIRS = 50_000;
const MAX_YAML_BYTES = 1 << 20;
/** Directories that never hold configs but can be huge (checkpoints, logs, caches). */
const SKIP_DIR = /^(\.|node_modules$|__pycache__$|wandb$|runs$|checkpoint-\d+$|global_step\d+$)/;

export class ScanCancelled extends Error {
  constructor() {
    super("스캔이 취소되었습니다.");
  }
}

export type ScanOptions = {
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
};

export type ScanResult = {
  rootId: number;
  nInfos: number;
  nConfigs: number;
  nFiles: number;
  nMissing: number;
  warnings: string[];
};

type Found = { infos: string[]; yamls: string[]; truncated: boolean };

/** Walks `dir` (local path) collecting dataset_info.json and YAML files. Symlinks are not followed. */
export async function findFiles(dir: string, signal?: AbortSignal): Promise<Found> {
  const found: Found = { infos: [], yamls: [], truncated: false };
  const queue: { dir: string; depth: number }[] = [{ dir, depth: 0 }];
  let visited = 0;
  while (queue.length) {
    if (signal?.aborted) throw new ScanCancelled();
    const { dir: current, depth } = queue.shift()!;
    if (++visited > MAX_DIRS) {
      found.truncated = true;
      break;
    }
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(current, e.name);
      if (e.isDirectory()) {
        if (depth < MAX_DEPTH && !SKIP_DIR.test(e.name))
          queue.push({ dir: full, depth: depth + 1 });
      } else if (e.isFile()) {
        if (e.name === DATASET_INFO) found.infos.push(full);
        else if (/\.ya?ml$/i.test(e.name)) found.yamls.push(full);
      }
    }
  }
  found.infos.sort();
  found.yamls.sort();
  return found;
}

function statOrNull(p: string): fs.Stats | null {
  try {
    return fs.statSync(p);
  } catch {
    return null;
  }
}

/** Data files the indexer can read; anything else (parquet, csv, arrow) is listed but not registered. */
export const SUPPORTED_FILE = /\.(json|jsonl)$/i;

type FileStatusValue = "ok" | "missing" | "directory" | "remote" | "none" | "unsupported";

/** A registry entry with its file looked up on disk (done before the write transaction). */
type ResolvedEntry = DatasetInfoEntry & {
  resolved: string | null;
  status: FileStatusValue;
  size: number | null;
  mtime: string | null;
};

type ParsedInfo = { entries: ResolvedEntry[]; error: string | null; mtime: string | null };

const specKey = (e: DatasetInfoEntry) => JSON.stringify(e.spec);

/**
 * Dataset name for a data file: its basename. When registries read the same file with
 * different formats (e.g. SFT and DPO views of one JSON), each format becomes its own
 * dataset so neither overwrites the other's index.
 */
export function fileDatasetName(volumePath: string, spec: string, ambiguous: boolean): string {
  const base = path.basename(volumePath);
  if (!ambiguous) return base;
  const hash = crypto.createHash("sha1").update(spec).digest("hex").slice(0, 6);
  return `${base} [${hash}]`;
}

/**
 * Registers a data file as a dataset (source = 'file') with one `default` variant. The
 * datapack is the file's directory, so the same file used by many experiments is one
 * dataset and is indexed once. An unchanged file keeps its index across rescans; when its
 * path or format changes, the stale samples are dropped.
 */
export function registerFileDataset(
  db: DatabaseSync,
  volumePath: string,
  /** JSON of the FormatSpec, or null for a file that is already LLaVA format. */
  spec: string | null,
  ambiguous = false,
  /** Datapack to file it under; defaults to the file's directory. */
  datapackName?: string | null,
): number {
  const datapackId = createDatapack(db, datapackName?.trim() || path.dirname(volumePath));
  const datasetId = get<{ id: number }>(
    db,
    `INSERT INTO datasets (datapack_id, name, source, note) VALUES (?, ?, 'file', ?)
     ON CONFLICT(datapack_id, name) DO UPDATE SET updated_at = datetime('now')
     RETURNING id`,
    datapackId,
    fileDatasetName(volumePath, spec ?? "", ambiguous),
    volumePath,
  )!.id;
  const existing = get<{ id: number; json_path: string | null; format_spec: string | null }>(
    db,
    `SELECT id, json_path, format_spec FROM variants WHERE dataset_id = ? AND kind = 'default'`,
    datasetId,
  );
  if (!existing) {
    db.prepare(
      `INSERT INTO variants (dataset_id, kind, json_path, format_spec, sft_weight)
       VALUES (?, 'default', ?, ?, 1)`,
    ).run(datasetId, volumePath, spec);
  } else if (existing.json_path !== volumePath || existing.format_spec !== spec) {
    clearVariantSamples(db, existing.id);
    db.prepare(
      `UPDATE variants SET json_path = ?, format_spec = ?, index_status = 'none',
         n_samples_indexed = 0, indexed_at = NULL, file_mtime = NULL, index_error = NULL
       WHERE id = ?`,
    ).run(volumePath, spec, existing.id);
  }
  return datasetId;
}

/** Reads one dataset_info.json (volume path) and stats every file it names. */
function readInfo(infoPath: string): ParsedInfo {
  const local = remapPath(infoPath);
  const stat = statOrNull(local);
  let raw: DatasetInfoEntry[] = [];
  let error: string | null = null;
  try {
    raw = parseDatasetInfo(JSON.parse(fs.readFileSync(local, "utf8")));
  } catch (err) {
    error = (err as Error).message;
  }
  const entries = raw.map((e): ResolvedEntry => {
    // LLaMA-Factory prefers hub/script/cloud sources over file_name.
    if (e.remote || !e.fileName || isPlaceholder(e.fileName))
      return {
        ...e,
        resolved: null,
        status: e.remote ? "remote" : "none",
        size: null,
        mtime: null,
      };
    // file_name is joined onto dataset_dir, i.e. the registry's directory.
    const resolved = path.isAbsolute(e.fileName)
      ? path.normalize(e.fileName)
      : path.join(path.dirname(infoPath), e.fileName);
    const s = statOrNull(remapPath(resolved));
    const status: FileStatusValue = !s
      ? "missing"
      : s.isDirectory()
        ? "directory"
        : SUPPORTED_FILE.test(resolved)
          ? "ok"
          : "unsupported";
    return {
      ...e,
      resolved,
      status,
      size: s?.isFile() ? s.size : null,
      mtime: s?.isFile() ? s.mtime.toISOString() : null,
    };
  });
  return { entries, error, mtime: stat?.mtime.toISOString() ?? null };
}

/**
 * Upserts one registry and its entries. A registry already owned by another root (reached
 * through `dataset_dir`) keeps its owner, so overlapping scans do not steal it.
 */
function upsertInfo(
  db: DatabaseSync,
  rootId: number,
  infoPath: string,
  info: ParsedInfo,
  ambiguous: (resolved: string) => boolean,
): number {
  const infoId = get<{ id: number }>(
    db,
    `INSERT INTO dataset_infos (root_id, path, n_entries, file_mtime, error) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(path) DO UPDATE SET n_entries = excluded.n_entries,
       file_mtime = excluded.file_mtime, error = excluded.error
     RETURNING id`,
    rootId,
    infoPath,
    info.entries.length,
    info.mtime,
    info.error,
  )!.id;
  db.prepare(`DELETE FROM dataset_info_entries WHERE info_id = ?`).run(infoId);
  const insert = db.prepare(
    `INSERT INTO dataset_info_entries (info_id, key, file_name, resolved_path, formatting, ranking, spec,
       file_status, file_size, file_mtime, dataset_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const e of info.entries) {
    const spec = specKey(e);
    const datasetId =
      e.status === "ok" && e.resolved
        ? registerFileDataset(db, e.resolved, spec, ambiguous(e.resolved))
        : null;
    insert.run(
      infoId,
      e.key,
      e.fileName,
      e.resolved,
      e.spec.formatting,
      e.spec.ranking ? 1 : 0,
      spec,
      e.status,
      e.size,
      e.mtime,
      datasetId,
    );
  }
  return infoId;
}

/**
 * The dataset_info.json a config reads. LLaMA-Factory resolves `dataset_dir` (default
 * `data`) against the launch directory, which is unknown here, so this tries the YAML's
 * directory and each ancestor up to the root, looking for `<dir>/<dataset_dir>/` and then
 * `<dir>/` itself. An absolute `dataset_dir` is tried first.
 */
export function resolveInfoFor(
  yamlPath: string,
  cfg: TrainingConfig,
  rootPath: string,
): string | null {
  const datasetDir = cfg.datasetDir ?? "data";
  const remote = datasetDir === "ONLINE" || datasetDir.startsWith("REMOTE:");
  const candidates: string[] = [];
  if (!remote && path.isAbsolute(datasetDir))
    candidates.push(path.join(path.normalize(datasetDir), DATASET_INFO));
  const stop = path.resolve(rootPath);
  for (let d = path.dirname(yamlPath); ; d = path.dirname(d)) {
    if (!remote && !path.isAbsolute(datasetDir))
      candidates.push(path.join(d, datasetDir, DATASET_INFO));
    candidates.push(path.join(d, DATASET_INFO));
    if (d === stop || path.dirname(d) === d || !d.startsWith(stop)) break;
  }
  return [...new Set(candidates)].find((c) => statOrNull(remapPath(c))?.isFile()) ?? null;
}

export function upsertRoot(db: DatabaseSync, rootPath: string): number {
  return get<{ id: number }>(
    db,
    `INSERT INTO experiment_roots (path) VALUES (?)
     ON CONFLICT(path) DO UPDATE SET path = excluded.path RETURNING id`,
    rootPath,
  )!.id;
}

/** Normalises user input: trims, drops a trailing slash or a trailing `/dataset_info.json`. */
export function normalizeRootPath(input: string): string {
  let p = path.normalize(input.trim());
  if (path.basename(p) === DATASET_INFO) p = path.dirname(p);
  return p.length > 1 ? p.replace(/\/+$/, "") : p;
}

/**
 * Scans a root directory: every dataset_info.json and its data files, and every training
 * YAML with the datasets it names. Rescanning updates rows in place (ids stay stable) and
 * removes configs/registries that disappeared.
 */
export async function scanRoot(
  db: DatabaseSync,
  rootId: number,
  options: ScanOptions = {},
): Promise<ScanResult> {
  const root = get<{ path: string }>(db, `SELECT path FROM experiment_roots WHERE id = ?`, rootId);
  if (!root) throw new Error(`실험 루트 ${rootId}를 찾을 수 없습니다.`);
  const local = remapPath(root.path);
  const rootStat = statOrNull(local);
  if (!rootStat?.isDirectory()) {
    const message = `디렉터리를 찾을 수 없습니다: ${local}`;
    db.prepare(
      `UPDATE experiment_roots SET error = ?, scanned_at = datetime('now') WHERE id = ?`,
    ).run(message, rootId);
    throw new Error(message);
  }

  options.onProgress?.(`${root.path} 탐색 중`);
  const found = await findFiles(local, options.signal);
  const warnings: string[] = [];
  if (found.truncated)
    warnings.push(`디렉터리가 너무 많아 ${MAX_DIRS.toLocaleString("ko-KR")}개까지만 탐색했습니다.`);

  // Parse YAMLs before opening the write transaction (file I/O only).
  const configs: { path: string; cfg: TrainingConfig; mtime: string | null }[] = [];
  for (const y of found.yamls) {
    if (options.signal?.aborted) throw new ScanCancelled();
    const s = statOrNull(y);
    if (!s || s.size > MAX_YAML_BYTES) continue;
    const cfg = parseTrainingConfig(fs.readFileSync(y, "utf8"));
    if (cfg) configs.push({ path: unmapPath(y), cfg, mtime: s.mtime.toISOString() });
  }
  options.onProgress?.(
    `dataset_info.json ${found.infos.length}개, 학습 설정 ${configs.length}개 정리 중`,
  );

  // Read every registry (found under the root or reached through a config) up front.
  const infoFor = new Map<string, string | null>();
  for (const c of configs) infoFor.set(c.path, resolveInfoFor(c.path, c.cfg, root.path));
  const infoPaths = [
    ...new Set([
      ...found.infos.map(unmapPath),
      ...[...infoFor.values()].filter((p): p is string => p !== null),
    ]),
  ];
  const parsed = new Map<string, ParsedInfo>();
  const specsByFile = new Map<string, Set<string>>();
  let nMissing = 0;
  for (const p of infoPaths) {
    if (options.signal?.aborted) throw new ScanCancelled();
    const info = readInfo(p);
    parsed.set(p, info);
    if (info.error) warnings.push(`${p}: ${info.error}`);
    for (const e of info.entries) {
      if (e.status === "missing") nMissing++;
      if (e.status !== "ok" || !e.resolved) continue;
      const specs = specsByFile.get(e.resolved) ?? new Set<string>();
      specs.add(specKey(e));
      specsByFile.set(e.resolved, specs);
    }
  }
  const ambiguous = (file: string) => (specsByFile.get(file)?.size ?? 0) > 1;

  const result = transaction(db, () => {
    const infoIds = new Map<string, number>();
    const infoId = (p: string) => {
      let id = infoIds.get(p);
      if (id === undefined) {
        id = upsertInfo(db, rootId, p, parsed.get(p)!, ambiguous);
        infoIds.set(p, id);
      }
      return id;
    };
    for (const p of infoPaths) infoId(p);

    const seenConfigs: string[] = [];
    const insertDs = db.prepare(
      `INSERT INTO experiment_datasets (experiment_id, split, position, key) VALUES (?, ?, ?, ?)`,
    );
    for (const { path: cfgPath, cfg, mtime } of configs) {
      const info = infoFor.get(cfgPath) ?? null;
      const rel = path.relative(root.path, cfgPath);
      const expId = get<{ id: number }>(
        db,
        `INSERT INTO experiments (root_id, config_path, dir, name, info_id, stage, finetuning_type,
           model_name_or_path, output_dir, template, cutoff_len, learning_rate, num_train_epochs,
           media_dir, dataset_dir, config, file_mtime, scanned_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(config_path) DO UPDATE SET root_id = excluded.root_id, dir = excluded.dir,
           name = excluded.name, info_id = excluded.info_id, stage = excluded.stage,
           finetuning_type = excluded.finetuning_type, model_name_or_path = excluded.model_name_or_path,
           output_dir = excluded.output_dir, template = excluded.template,
           cutoff_len = excluded.cutoff_len, learning_rate = excluded.learning_rate,
           num_train_epochs = excluded.num_train_epochs, media_dir = excluded.media_dir,
           dataset_dir = excluded.dataset_dir, config = excluded.config,
           file_mtime = excluded.file_mtime, scanned_at = excluded.scanned_at
         RETURNING id`,
        rootId,
        cfgPath,
        path.dirname(rel) === "." ? "" : path.dirname(rel),
        rel.replace(/\.ya?ml$/i, ""),
        info ? infoId(info) : null,
        cfg.stage,
        cfg.finetuningType,
        cfg.modelNameOrPath,
        cfg.outputDir,
        cfg.template,
        cfg.cutoffLen,
        cfg.learningRate,
        cfg.numTrainEpochs,
        cfg.mediaDir,
        cfg.datasetDir,
        JSON.stringify(cfg.raw),
        mtime,
      )!.id;
      seenConfigs.push(cfgPath);
      db.prepare(`DELETE FROM experiment_datasets WHERE experiment_id = ?`).run(expId);
      cfg.datasets.forEach((key, i) => insertDs.run(expId, "train", i, key));
      cfg.evalDatasets.forEach((key, i) => insertDs.run(expId, "eval", i, key));
      if (!info && cfg.datasets.length)
        warnings.push(`${rel}: dataset_info.json을 찾지 못했습니다.`);
    }

    // Drop configs and registries of this root that no longer exist on disk.
    const stale = all<{ id: number; config_path: string }>(
      db,
      `SELECT id, config_path FROM experiments WHERE root_id = ?`,
      rootId,
    ).filter((r) => !seenConfigs.includes(r.config_path));
    for (const r of stale) db.prepare(`DELETE FROM experiments WHERE id = ?`).run(r.id);
    const keepInfos = new Set(infoIds.values());
    for (const r of all<{ id: number }>(
      db,
      `SELECT id FROM dataset_infos WHERE root_id = ?`,
      rootId,
    ))
      if (!keepInfos.has(r.id)) db.prepare(`DELETE FROM dataset_infos WHERE id = ?`).run(r.id);

    db.prepare(
      `UPDATE experiment_roots SET scanned_at = datetime('now'), n_infos = ?, n_configs = ?,
         error = NULL WHERE id = ?`,
    ).run(infoIds.size, configs.length, rootId);
    return {
      rootId,
      nInfos: infoIds.size,
      nConfigs: configs.length,
      nFiles: specsByFile.size,
      nMissing,
      warnings,
    };
  });
  return result;
}
