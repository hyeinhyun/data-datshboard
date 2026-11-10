import type { DatabaseSync } from "node:sqlite";

import { all, get } from "@/lib/db/client";

export type ExperimentRoot = {
  id: number;
  path: string;
  scannedAt: string | null;
  nInfos: number;
  nConfigs: number;
  error: string | null;
};

export function listRoots(db: DatabaseSync): ExperimentRoot[] {
  return all<ExperimentRoot>(
    db,
    `SELECT id, path, scanned_at AS scannedAt, n_infos AS nInfos, n_configs AS nConfigs, error
     FROM experiment_roots ORDER BY path`,
  );
}

export function getRoot(db: DatabaseSync, id: number): ExperimentRoot | null {
  return (
    get<ExperimentRoot>(
      db,
      `SELECT id, path, scanned_at AS scannedAt, n_infos AS nInfos, n_configs AS nConfigs, error
       FROM experiment_roots WHERE id = ?`,
      id,
    ) ?? null
  );
}

export type FileStatus = "ok" | "missing" | "directory" | "remote" | "none" | "unsupported";

/** One dataset named by a config, resolved through the config's dataset_info.json. */
export type ExperimentDataset = {
  split: "train" | "eval";
  position: number;
  key: string;
  /** null when the key is not in the registry (or the registry was not found). */
  fileStatus: FileStatus | null;
  fileName: string | null;
  resolvedPath: string | null;
  formatting: string | null;
  ranking: boolean;
  fileSize: number | null;
  datasetId: number | null;
  datasetName: string | null;
  variantId: number | null;
  indexStatus: string | null;
  nIndexed: number | null;
  indexError: string | null;
};

const DATASET_COLUMNS = `
  ed.split, ed.position, ed.key, de.file_status AS fileStatus, de.file_name AS fileName,
  de.resolved_path AS resolvedPath, de.formatting, de.ranking, de.file_size AS fileSize,
  de.dataset_id AS datasetId, d.name AS datasetName, v.id AS variantId,
  v.index_status AS indexStatus, v.n_samples_indexed AS nIndexed, v.index_error AS indexError`;

const DATASET_JOINS = `
  JOIN experiments e ON e.id = ed.experiment_id
  LEFT JOIN dataset_info_entries de ON de.info_id = e.info_id AND de.key = ed.key
  LEFT JOIN datasets d ON d.id = de.dataset_id
  LEFT JOIN variants v ON v.dataset_id = d.id AND v.kind = 'default'`;

type RawDataset = Omit<ExperimentDataset, "ranking"> & { ranking: number | null };
const hydrateDataset = (r: RawDataset): ExperimentDataset => ({ ...r, ranking: r.ranking === 1 });

export type ExperimentSummary = {
  id: number;
  rootId: number;
  rootPath: string;
  name: string;
  dir: string;
  configPath: string;
  stage: string | null;
  finetuningType: string | null;
  modelNameOrPath: string | null;
  outputDir: string | null;
  template: string | null;
  cutoffLen: number | null;
  learningRate: number | null;
  numTrainEpochs: number | null;
  fileMtime: string | null;
  infoPath: string | null;
  datasets: ExperimentDataset[];
};

const SUMMARY_COLUMNS = `
  e.id, e.root_id AS rootId, r.path AS rootPath, e.name, e.dir, e.config_path AS configPath,
  e.stage, e.finetuning_type AS finetuningType, e.model_name_or_path AS modelNameOrPath,
  e.output_dir AS outputDir, e.template, e.cutoff_len AS cutoffLen, e.learning_rate AS learningRate,
  e.num_train_epochs AS numTrainEpochs, e.file_mtime AS fileMtime, i.path AS infoPath`;

function attachDatasets<T extends Omit<ExperimentSummary, "datasets">>(
  db: DatabaseSync,
  rows: T[],
): (T & { datasets: ExperimentDataset[] })[] {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const datasets = all<RawDataset & { experimentId: number }>(
    db,
    `SELECT ed.experiment_id AS experimentId, ${DATASET_COLUMNS}
     FROM experiment_datasets ed ${DATASET_JOINS}
     WHERE ed.experiment_id IN (${ids.map(() => "?").join(",")})
     ORDER BY ed.experiment_id, ed.split DESC, ed.position`,
    ...ids,
  );
  const byExp = new Map<number, ExperimentDataset[]>();
  for (const { experimentId, ...d } of datasets) {
    const list = byExp.get(experimentId) ?? [];
    list.push(hydrateDataset(d));
    byExp.set(experimentId, list);
  }
  return rows.map((r) => ({ ...r, datasets: byExp.get(r.id) ?? [] }));
}

export function listExperiments(
  db: DatabaseSync,
  filter: { rootId?: number; q?: string; datasetKey?: string } = {},
): ExperimentSummary[] {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (filter.rootId) {
    where.push("e.root_id = ?");
    params.push(filter.rootId);
  }
  if (filter.q) {
    where.push(
      `(e.name LIKE ? OR e.model_name_or_path LIKE ? OR e.output_dir LIKE ?
        OR EXISTS (SELECT 1 FROM experiment_datasets x WHERE x.experiment_id = e.id AND x.key LIKE ?))`,
    );
    const like = `%${filter.q}%`;
    params.push(like, like, like, like);
  }
  if (filter.datasetKey) {
    where.push(
      `EXISTS (SELECT 1 FROM experiment_datasets x WHERE x.experiment_id = e.id AND x.key = ?)`,
    );
    params.push(filter.datasetKey);
  }
  const rows = all<Omit<ExperimentSummary, "datasets">>(
    db,
    `SELECT ${SUMMARY_COLUMNS}
     FROM experiments e JOIN experiment_roots r ON r.id = e.root_id
     LEFT JOIN dataset_infos i ON i.id = e.info_id
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY r.path, e.name`,
    ...params,
  );
  return attachDatasets(db, rows);
}

export type RegistryEntry = {
  key: string;
  fileName: string | null;
  resolvedPath: string | null;
  formatting: string | null;
  ranking: boolean;
  spec: Record<string, unknown>;
  fileStatus: FileStatus;
  fileSize: number | null;
  datasetId: number | null;
};

export type ExperimentDetail = ExperimentSummary & {
  mediaDir: string | null;
  datasetDir: string | null;
  config: Record<string, unknown>;
  /** Every entry of the dataset_info.json the config reads, used or not. */
  registry: RegistryEntry[];
  /** Other configs in the same directory, for quick switching. */
  siblings: { id: number; name: string }[];
};

export function getExperiment(db: DatabaseSync, id: number): ExperimentDetail | null {
  const row = get<
    Omit<ExperimentSummary, "datasets"> & {
      mediaDir: string | null;
      datasetDir: string | null;
      config: string;
      infoId: number | null;
    }
  >(
    db,
    `SELECT ${SUMMARY_COLUMNS}, e.media_dir AS mediaDir, e.dataset_dir AS datasetDir, e.config,
            e.info_id AS infoId
     FROM experiments e JOIN experiment_roots r ON r.id = e.root_id
     LEFT JOIN dataset_infos i ON i.id = e.info_id WHERE e.id = ?`,
    id,
  );
  if (!row) return null;
  const { config, infoId, ...rest } = row;
  const [summary] = attachDatasets(db, [rest]);
  const registry = infoId
    ? all<Omit<RegistryEntry, "spec" | "ranking"> & { spec: string; ranking: number }>(
        db,
        `SELECT key, file_name AS fileName, resolved_path AS resolvedPath, formatting, ranking, spec,
                file_status AS fileStatus, file_size AS fileSize, dataset_id AS datasetId
         FROM dataset_info_entries WHERE info_id = ? ORDER BY id`,
        infoId,
      ).map((r) => ({
        ...r,
        ranking: r.ranking === 1,
        spec: JSON.parse(r.spec) as Record<string, unknown>,
      }))
    : [];
  const siblings = all<{ id: number; name: string }>(
    db,
    `SELECT id, name FROM experiments WHERE root_id = ? AND dir = ? AND id != ? ORDER BY name`,
    row.rootId,
    row.dir,
    id,
  );
  return {
    ...summary,
    config: JSON.parse(config) as Record<string, unknown>,
    registry,
    siblings,
  };
}

/** Experiments whose config names a registry entry that points at this dataset. */
export function experimentsUsingDataset(
  db: DatabaseSync,
  datasetId: number,
): { id: number; name: string; rootPath: string; key: string; split: "train" | "eval" }[] {
  return all(
    db,
    `SELECT DISTINCT e.id, e.name, r.path AS rootPath, ed.key, ed.split
     FROM experiment_datasets ed
     JOIN experiments e ON e.id = ed.experiment_id
     JOIN experiment_roots r ON r.id = e.root_id
     JOIN dataset_info_entries de ON de.info_id = e.info_id AND de.key = ed.key
     WHERE de.dataset_id = ?
     ORDER BY r.path, e.name`,
    datasetId,
  );
}

/** Default-variant ids of every data file used by the given experiments (for bulk indexing). */
export function variantIdsForExperiments(db: DatabaseSync, experimentIds: number[]): number[] {
  if (experimentIds.length === 0) return [];
  return all<{ id: number }>(
    db,
    `SELECT DISTINCT v.id FROM experiment_datasets ed ${DATASET_JOINS}
     WHERE ed.experiment_id IN (${experimentIds.map(() => "?").join(",")}) AND v.id IS NOT NULL`,
    ...experimentIds,
  ).map((r) => r.id);
}
