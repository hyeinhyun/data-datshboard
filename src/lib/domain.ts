/**
 * Shared domain types and pure helpers. This module has no server-only imports,
 * so client components may import from it; `@/lib/queries/*` re-export these.
 */
import type { VariantKind } from "@/lib/manifest/types";

export type SuperpackSummary = {
  id: number;
  name: string;
  source: "excel" | "user";
  description: string | null;
  updatedAt: string;
  nDatapacks: number;
  nDatasets: number;
  nSamples: number;
};

export type VariantInfo = {
  id: number;
  kind: VariantKind | "default";
  jsonPath: string | null;
  nSamples: number | null;
  sftWeight: number | null;
  indexStatus: string;
  nIndexed: number;
};

export type DatasetRow = {
  id: number;
  name: string;
  datapackId: number;
  datapack: string;
  category: string | null;
  subCategory: string | null;
  language: string | null;
  note: string | null;
  source: string;
  variants: VariantInfo[];
  tags: string[];
  /** Per-superpack values; null when no superpack is selected. */
  mxWeight1: number | null;
  mxWeight2: number | null;
  nTotal: number | null;
  nTraining: number | null;
  nMx1: number | null;
  nMx2: number | null;
};

/** Sum of manifest sample counts over the dataset's variants (optionally only some kinds). */
export function variantSamples(d: DatasetRow, kinds?: VariantKind[]): number {
  return d.variants
    .filter((v) => !kinds || kinds.length === 0 || (kinds as string[]).includes(v.kind))
    .reduce((n, v) => n + (v.nSamples ?? 0), 0);
}
