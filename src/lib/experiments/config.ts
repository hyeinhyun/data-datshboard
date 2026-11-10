import { parse } from "yaml";

import { splitDatasetList } from "./format";

/** The fields of a LLaMA-Factory training YAML that the dashboard shows and filters on. */
export type TrainingConfig = {
  datasets: string[];
  evalDatasets: string[];
  stage: string | null;
  finetuningType: string | null;
  modelNameOrPath: string | null;
  outputDir: string | null;
  template: string | null;
  cutoffLen: number | null;
  learningRate: number | null;
  numTrainEpochs: number | null;
  mediaDir: string | null;
  datasetDir: string | null;
  /** Every top-level key, as parsed (comments dropped). */
  raw: Record<string, unknown>;
};

function str(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  return String(v);
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * Parses a training YAML. Returns null when the file is not a training config (no
 * `dataset` key), e.g. a deepspeed or accelerate config living next to it.
 */
export function parseTrainingConfig(source: string): TrainingConfig | null {
  let doc: unknown;
  try {
    doc = parse(source);
  } catch {
    return null;
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return null;
  const raw = doc as Record<string, unknown>;
  if (!("dataset" in raw) && !("eval_dataset" in raw)) return null;
  return {
    datasets: splitDatasetList(raw.dataset),
    evalDatasets: splitDatasetList(raw.eval_dataset),
    stage: str(raw.stage),
    finetuningType: str(raw.finetuning_type),
    modelNameOrPath: str(raw.model_name_or_path),
    outputDir: str(raw.output_dir),
    template: str(raw.template),
    cutoffLen: num(raw.cutoff_len),
    learningRate: num(raw.learning_rate),
    numTrainEpochs: num(raw.num_train_epochs),
    mediaDir: str(raw.media_dir ?? raw.image_dir),
    datasetDir: str(raw.dataset_dir),
    raw,
  };
}
