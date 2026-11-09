import { NORMALIZED_COLUMNS, type NormalizedColumn } from "./types";

/**
 * Collapses a raw spreadsheet header such as "longer:\n# sample" into a
 * comparable key: lower-case, single spaces, no trailing colon.
 */
export function canonicalHeader(raw: string): string {
  return raw
    .replace(/[\r\n_]+/g, " ")
    .replace(/\s*:\s*/g, ": ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/:$/, "")
    .toLowerCase();
}

const EXACT: Record<string, NormalizedColumn> = {
  datapack: "datapack",
  "data pack": "datapack",
  category: "category",
  "sub-category": "sub_category",
  "sub category": "sub_category",
  subcategory: "sub_category",
  언어: "language",
  language: "language",
  lang: "language",
  dataset: "dataset",
  "dataset name": "dataset",
  "orign json": "origin_json",
  "origin json": "origin_json",
  "original json": "origin_json",
  "mx weight": "mx_weight_1",
  "mx weight (1)": "mx_weight_1",
  "mx weight 1": "mx_weight_1",
  "mx weight (2)": "mx_weight_2",
  "mx weight 2": "mx_weight_2",
  "# samples in total": "n_total",
  "samples in total": "n_total",
  "# samples in training": "n_training",
  "samples in training": "n_training",
  "# samples in mx weight": "n_mx1",
  "# samples in mx weight (1)": "n_mx1",
  "# samples in mx weight (2)": "n_mx2",
  "n samples total": "n_total",
  "n samples training": "n_training",
  "n samples mx weight 1": "n_mx1",
  "n samples mx weight 2": "n_mx2",
  비고: "note",
  note: "note",
  notes: "note",
  remark: "note",
  remarks: "note",
};

const VARIANT_PATTERN =
  /^(longer|longans|shortans)(?::| )\s*(json path|json|path|#? ?samples?|n samples|sft weight|weight)$/;

/** Maps a raw header to a normalized column name, or null when unknown. */
export function normalizeHeader(raw: string): NormalizedColumn | null {
  const direct = raw.trim().toLowerCase();
  if ((NORMALIZED_COLUMNS as readonly string[]).includes(direct)) return direct as NormalizedColumn;
  const key = canonicalHeader(raw);
  if (key in EXACT) return EXACT[key];
  const m = VARIANT_PATTERN.exec(key);
  if (m) {
    const kind = m[1] as "longer" | "longans" | "shortans";
    const field = m[2];
    if (field.includes("path") || field === "json") return `${kind}_json_path`;
    if (field.includes("sample")) return `${kind}_n_samples`;
    if (field.includes("weight")) return `${kind}_sft_weight`;
  }
  return null;
}

/** Parses "34,813", " 0.5 ", 97 → number; blanks and non-numbers → null. */
export function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value).replace(/,/g, "").trim();
  if (text === "" || text === "-") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

export function parseText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}
