export const VARIANT_KINDS = ["longer", "longans", "shortans"] as const;
export type VariantKind = (typeof VARIANT_KINDS)[number];

export const VARIANT_LABELS: Record<VariantKind | "default", string> = {
  longer: "longer",
  longans: "longans",
  shortans: "shortans",
  default: "default",
};

export type ManifestVariant = {
  jsonPath: string | null;
  nSamples: number | null;
  sftWeight: number | null;
};

/** One manifest row, i.e. one dataset inside one superpack (sheet). */
export type ManifestRow = {
  rowNumber: number;
  datapack: string;
  dataset: string;
  category: string | null;
  subCategory: string | null;
  language: string | null;
  originJson: string | null;
  note: string | null;
  variants: Record<VariantKind, ManifestVariant>;
  mxWeight1: number | null;
  mxWeight2: number | null;
  nTotal: number | null;
  nTraining: number | null;
  nMx1: number | null;
  nMx2: number | null;
  /** Columns the normalizer did not recognise, kept verbatim. */
  extra: Record<string, string>;
};

export type ManifestColumn = { index: number; raw: string; normalized: NormalizedColumn | null };

export type ManifestSheet = {
  name: string;
  columns: ManifestColumn[];
  rows: ManifestRow[];
  skippedRows: number;
  warnings: string[];
};

export type ParsedManifest = {
  fileName: string;
  sheets: ManifestSheet[];
};

export const NORMALIZED_COLUMNS = [
  "datapack",
  "category",
  "sub_category",
  "language",
  "dataset",
  "origin_json",
  "longer_json_path",
  "longer_n_samples",
  "longer_sft_weight",
  "longans_json_path",
  "longans_n_samples",
  "longans_sft_weight",
  "shortans_json_path",
  "shortans_n_samples",
  "shortans_sft_weight",
  "mx_weight_1",
  "mx_weight_2",
  "n_total",
  "n_training",
  "n_mx1",
  "n_mx2",
  "note",
] as const;
export type NormalizedColumn = (typeof NORMALIZED_COLUMNS)[number];
