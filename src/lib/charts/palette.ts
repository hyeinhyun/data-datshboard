import type { VariantKind } from "@/lib/manifest/types";

/** Series colors come from CSS tokens so light/dark both use validated steps. */
export const SERIES = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
] as const;

/** Color follows the entity: each variant kind always gets the same slot. */
export const VARIANT_COLOR: Record<VariantKind | "default", string> = {
  longer: SERIES[0],
  longans: SERIES[1],
  shortans: SERIES[2],
  default: SERIES[3],
};

export const VARIANT_ORDER: (VariantKind | "default")[] = [
  "longer",
  "longans",
  "shortans",
  "default",
];

/** Stable color for a named entity (datapack, language…) by its position in a fixed, sorted list. */
export function colorForIndex(index: number): string {
  return SERIES[Math.min(index, SERIES.length - 1)];
}
